import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage, pool } from "./storage";

const AUTH_STRATEGY_NAME = "replitauth";

function getCanonicalAuthOrigin(): URL {
  const rawOrigin = process.env.AUTH_PUBLIC_ORIGIN ?? process.env.REPLIT_APP_URL;
  if (!rawOrigin) {
    throw new Error(
      "Missing AUTH_PUBLIC_ORIGIN (or REPLIT_APP_URL fallback) for canonical auth origin"
    );
  }

  return new URL(rawOrigin);
}

function getRecognizedAuthHostnames(canonicalOrigin: URL): Set<string> {
  const hostnames = new Set([canonicalOrigin.hostname]);
  const rawHostnames = process.env.AUTH_ALLOWED_HOSTNAMES;

  if (!rawHostnames) {
    return hostnames;
  }

  for (const hostname of rawHostnames.split(",").map((value) => value.trim().toLowerCase())) {
    if (hostname) {
      hostnames.add(hostname);
    }
  }

  return hostnames;
}

function getStrategyCount(): number {
  const strategies = (passport as any)._strategies ?? {};
  return Object.keys(strategies).length;
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
  const pgStore = connectPg(session);
  // Share the same Neon pool that Drizzle uses — avoids a second independent
  // WebSocket cluster to the database just for session reads/writes.
  const sessionStore = new pgStore({
    pool: pool as unknown as import("pg").Pool,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
    pruneSessionInterval: 24 * 60 * 60, // once per day, not every 15 min
    disableTouch: true,                  // no TTL-refresh write on every request
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

export const sessionMiddleware = getSession();
export const passportInitializeMiddleware = passport.initialize();
export const passportSessionMiddleware = passport.session();

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

// Email whitelist - Add approved emails here
const ALLOWED_EMAILS = new Set<string>([
  // Add your allowed email addresses here, for example:
  // "user@example.com",
  // "admin@yourlab.org",
]);

// Check if a domain is allowed (optional: allow all emails from specific domains)
const ALLOWED_DOMAINS = new Set<string>([
  // Add allowed domains here, for example:
  "sanger.ac.uk",
  // "youruniversity.edu",
]);

function isEmailAllowed(email: string | null): boolean {
  if (!email) return false;
  
  // Check if email is in whitelist
  if (ALLOWED_EMAILS.has(email.toLowerCase())) {
    return true;
  }
  
  // Check if email domain is allowed
  const domain = email.split('@')[1]?.toLowerCase();
  if (domain && ALLOWED_DOMAINS.has(domain)) {
    return true;
  }
  
  return false;
}

async function upsertUser(
  claims: any,
) {
  // Check if email is allowed
  if (!isEmailAllowed(claims["email"])) {
    throw new Error("Access denied: Your email is not on the approved list for this application.");
  }

  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(sessionMiddleware);
  app.use(passportInitializeMiddleware);
  app.use(passportSessionMiddleware);

  const config = await getOidcConfig();
  const canonicalOrigin = getCanonicalAuthOrigin();
  const recognizedHostnames = getRecognizedAuthHostnames(canonicalOrigin);

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    try {
      const user = {};
      updateUserSession(user, tokens);
      await upsertUser(tokens.claims());
      verified(null, user);
    } catch (error: any) {
      // If email is not allowed, pass error to Passport
      verified(error, false);
    }
  };

  const strategy = new Strategy(
    {
      name: AUTH_STRATEGY_NAME,
      config,
      scope: "openid email profile offline_access",
      callbackURL: new URL("/api/callback", canonicalOrigin).toString(),
    },
    verify,
  );
  passport.use(strategy);

  const expectedStrategyCount = getStrategyCount();

  const validateRequestHostname = (hostname: string): boolean => {
    const normalizedHostname = hostname.toLowerCase();
    const isRecognized = recognizedHostnames.has(normalizedHostname);
    if (!isRecognized) {
      console.warn(
        `[auth] Rejected auth request for unrecognized hostname: ${hostname}. ` +
          `Expected one of: ${Array.from(recognizedHostnames).join(", ")}`
      );
    }
    return isRecognized;
  };

  const assertStrategyCount = () => {
    const strategyCount = getStrategyCount();
    if (strategyCount !== expectedStrategyCount) {
      console.error(
        `[auth] Strategy count changed unexpectedly: expected ${expectedStrategyCount}, got ${strategyCount}`
      );
      throw new Error("Auth strategy count changed unexpectedly");
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    if (!validateRequestHostname(req.hostname)) {
      return res.status(400).json({ message: "Invalid authentication host" });
    }
    assertStrategyCount();

    passport.authenticate(AUTH_STRATEGY_NAME, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    if (!validateRequestHostname(req.hostname)) {
      return res.status(400).json({ message: "Invalid authentication host" });
    }
    assertStrategyCount();

    passport.authenticate(AUTH_STRATEGY_NAME, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
      failureFlash: true,
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: canonicalOrigin.toString(),
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
