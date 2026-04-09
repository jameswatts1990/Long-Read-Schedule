import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage, pool } from "./storage";

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
  const sessionTtlMs = 180 * 24 * 60 * 60 * 1000; // 180 days in ms
  const sessionTtlSeconds = Math.floor(sessionTtlMs / 1000);
  const pgStore = connectPg(session);
  // Share the same Neon pool that Drizzle uses — avoids a second independent
  // WebSocket cluster to the database just for session reads/writes.
  const sessionStore = new pgStore({
    pool: pool as unknown as import("pg").Pool,
    createTableIfMissing: false,
    ttl: sessionTtlSeconds,
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
      maxAge: sessionTtlMs,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  const claims = tokens.claims();
  user.claims = claims;
  user.access_token = tokens.access_token;
  // Some refresh-token responses omit a new refresh token. Preserve the
  // existing one so future refreshes don't fail prematurely.
  user.refresh_token = tokens.refresh_token ?? user.refresh_token;
  const now = Math.floor(Date.now() / 1000);
  user.expires_at = claims?.exp ?? (tokens.expires_in ? now + tokens.expires_in : user.expires_at);
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
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

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

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
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
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

// Deduplicates concurrent token-refresh attempts for the same session.
// Key: session ID  Value: the in-flight refresh promise.
// Memory overhead: one Promise reference per session actively refreshing (~0).
const sessionRefreshPromises = new Map<string, Promise<void>>();

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  // 60-second buffer: proactively refresh before the token actually expires,
  // shrinking the window in which concurrent requests all see an expired token.
  if (now < user.expires_at - 60) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const sessionId = req.session.id;

  // If another concurrent request for this session is already refreshing,
  // wait for it to finish instead of issuing a duplicate refresh grant.
  const inFlight = sessionRefreshPromises.get(sessionId);
  if (inFlight) {
    try {
      await inFlight;
      return next(); // Concurrent refresh succeeded; this request can proceed.
    } catch {
      return res.status(401).json({ message: "Unauthorized" });
    }
  }

  // Kick off the refresh and register it so concurrent requests can piggyback.
  const refreshWork = (async () => {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    await new Promise<void>((resolve, reject) => {
      req.login(user, (error) => {
        if (error) { reject(error); return; }
        req.session.save((sessionError) => {
          if (sessionError) { reject(sessionError); return; }
          resolve();
        });
      });
    });
  })();

  sessionRefreshPromises.set(sessionId, refreshWork);

  try {
    await refreshWork;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  } finally {
    // Always clean up — even on failure — so a retry isn't permanently blocked.
    sessionRefreshPromises.delete(sessionId);
  }
};
