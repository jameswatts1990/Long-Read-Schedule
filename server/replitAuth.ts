import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, Request, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage, sessionPool } from "./storage";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 24 * 3600 * 1000 } // 24 hours — OIDC discovery docs rarely change
);

export function getSession() {
  const sessionTtlMs = 180 * 24 * 60 * 60 * 1000; // 180 days in ms
  const sessionTtlSeconds = Math.floor(sessionTtlMs / 1000);
  const pgStore = connectPg(session);
  // Share the same Neon pool that Drizzle uses — avoids a second independent
  // WebSocket cluster to the database just for session reads/writes.
  const sessionStore = new pgStore({
    pool: sessionPool as unknown as import("pg").Pool,
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
    // Roll the cookie expiry forward on every response so that an active user
    // never sees their 180-day window count down. Cookie header overhead is
    // negligible; we still avoid per-request DB writes via disableTouch above
    // and the once-per-day extendSessionRow middleware below.
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: sessionTtlMs,
    },
  });
}

// Periodically refreshes the Postgres session row's `expire` column for an
// active user. Without this, `disableTouch: true` would let the row TTL count
// down from the original login even though the browser cookie keeps rolling.
// We piggy-back on `req.session.save()` (which invokes `store.set()` and
// writes the row with a new TTL) but throttle to once per day per session.
const SESSION_EXTEND_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const extendSessionRow: RequestHandler = (req, _res, next) => {
  const sess = req.session as any;
  if (!req.isAuthenticated?.() || !sess) return next();
  const now = Date.now();
  if (sess.lastExtendedAt && now - sess.lastExtendedAt < SESSION_EXTEND_INTERVAL_MS) {
    return next();
  }
  // Reload first so this save doesn't clobber fields written by a concurrent
  // request (freshly rotated tokens, activeWorkspaceId) with this request's
  // stale snapshot. Reload failure is tolerated — save() recreates the row.
  req.session.reload(() => {
    const fresh = req.session as any;
    if (fresh.lastExtendedAt && now - fresh.lastExtendedAt < SESSION_EXTEND_INTERVAL_MS) {
      return next(); // a concurrent request already extended the row
    }
    fresh.lastExtendedAt = now;
    // touch() resets cookie.expires from cookie.maxAge so the subsequent save()
    // writes a fresh TTL into the Postgres row. Without this, save() can persist
    // the original (drifting) expiry and the row TTL won't keep up with the
    // rolling cookie.
    req.session.touch();
    req.session.save((err) => {
      if (err) console.error("[auth] Failed to extend session row TTL:", err);
      next();
    });
  });
};

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
  app.use(extendSessionRow);

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
    // Preserve the user's current page through OIDC re-auth so they land back
    // where they were rather than at root. Passport reads session.returnTo
    // inside successReturnToOrRedirect and clears it after use.
    // Only accept same-origin relative paths to prevent open-redirect attacks.
    const rt = req.query.returnTo;
    if (
      typeof rt === "string" &&
      rt.startsWith("/") &&
      !rt.startsWith("//") &&
      !/^\/[^/]*:/.test(rt)
    ) {
      (req.session as any).returnTo = rt;
    }
    // No `prompt` override — lets Replit use SSO if the user already has
    // an active session there, so re-authentication after token expiry is
    // seamless (invisible redirect) rather than forcing a login/consent screen.
    passport.authenticate(`replitauth:${req.hostname}`, {
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
      // Login intentionally regenerates the session ID (fixation protection),
      // but session contents — notably returnTo set by /api/login — must be
      // merged into the new session or the user always lands back at "/".
      keepSessionInfo: true,
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

// Reload the session from the store, tolerating failures (e.g. a pruned row):
// on error the in-memory session is left untouched and the caller proceeds
// with its current snapshot. Used before session writes so that a save here
// can't clobber fields written by a concurrent request (rotated tokens,
// activeWorkspaceId) with this request's stale snapshot.
export function reloadSessionTolerant(req: Request): Promise<void> {
  return new Promise((resolve) => {
    if (typeof req.session?.reload !== "function") return resolve();
    req.session.reload(() => resolve());
  });
}

// Deduplicates concurrent token-refresh attempts for the same session.
// Key: session ID  Value: the in-flight refresh promise.
// Memory overhead: one Promise reference per session actively refreshing (~0).
const sessionRefreshPromises = new Map<string, Promise<void>>();

// Short grace window applied ONLY to transient refresh failures (network
// blips, brief OIDC discovery hiccups). It runs from the first failed refresh
// attempt for a given session, NOT from token expiry — so a session that can
// never refresh again (e.g. invalid_grant from Replit) starts returning 401
// promptly and the client can fall through to the silent SSO login path.
const TRANSIENT_REFRESH_GRACE_MS = 30 * 60 * 1000; // 30 minutes

// sessionId -> timestamp (ms) of the first refresh failure since the last
// successful refresh. Cleared on any successful refresh. In-memory only —
// this is purely a tolerance window for transient errors, so losing it on
// pod restart simply means we re-evaluate on the next request.
const sessionRefreshFirstFailureAt = new Map<string, number>();

function isPermanentRefreshError(err: unknown): boolean {
  const e = err as any;
  if (!e) return false;
  // openid-client surfaces OAuth error responses (e.g. invalid_grant) as
  // ResponseBodyError. These are non-recoverable: the refresh token has been
  // revoked/rotated away or the client is no longer trusted, so retrying or
  // waiting won't help.
  if (e instanceof (client as any).ResponseBodyError) {
    return [
      "invalid_grant",
      "invalid_token",
      "invalid_client",
      "unauthorized_client",
    ].includes(e.error);
  }
  return false;
}

// Returns true if we should let the request through despite a refresh
// failure (transient hiccup within the short grace window), false if the
// session should be treated as expired and a 401 returned.
function shouldGracefullyContinue(
  sessionId: string,
  err: unknown,
  nowMs: number,
): boolean {
  if (isPermanentRefreshError(err)) {
    sessionRefreshFirstFailureAt.delete(sessionId);
    return false;
  }
  const firstFailure = sessionRefreshFirstFailureAt.get(sessionId) ?? nowMs;
  if (!sessionRefreshFirstFailureAt.has(sessionId)) {
    sessionRefreshFirstFailureAt.set(sessionId, nowMs);
  }
  return nowMs - firstFailure < TRANSIENT_REFRESH_GRACE_MS;
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  const tokenExpired = now >= user.expires_at;

  // 5-minute buffer: proactively refresh before the token actually expires.
  // Larger than 60 s so that a Replit server waking from sleep has enough time
  // to complete OIDC discovery and the refresh grant before the token hard-expires.
  if (now < user.expires_at - 300) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    // No refresh token and token is expired → force re-login
    if (tokenExpired) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    // No refresh token but token still valid → let it through
    return next();
  }

  const sessionId = req.session.id;

  // If another concurrent request for this session is already refreshing,
  // wait for it to finish instead of issuing a duplicate refresh grant.
  const inFlight = sessionRefreshPromises.get(sessionId);
  if (inFlight) {
    try {
      await inFlight;
      return next(); // Concurrent refresh succeeded; this request can proceed.
    } catch (err) {
      // If the access token itself is still within its lifetime, let the
      // request through — the in-flight refresh failure didn't actually cost
      // us anything yet.
      if (!tokenExpired) return next();
      // Otherwise, only tolerate transient failures within the short grace
      // window. Permanent errors (e.g. invalid_grant) and persistent
      // failures fall through to a 401 so the client can trigger silent
      // re-auth via Replit SSO.
      if (shouldGracefullyContinue(sessionId, err, Date.now())) return next();
      return res.status(401).json({ message: "Unauthorized" });
    }
  }

  // Kick off the refresh and register it so concurrent requests can piggyback.
  // We retry the refresh once on transient failure (network blip, brief OIDC
  // outage) before surfacing the error.
  const refreshWork = (async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // Pick up writes from concurrent requests (or another process on a
        // multi-instance deployment) before refreshing: if fresh tokens are
        // already in the store, adopt them instead of issuing a duplicate
        // grant — refresh tokens may be single-use, so a duplicate grant can
        // fail with invalid_grant and revoke the token the other refresh just
        // obtained.
        await reloadSessionTolerant(req);
        const storedUser = (req.session as any)?.passport?.user;
        // Adopt the stored tokens wholesale: if another writer rotated the
        // refresh token, we must grant with (and on success keep) that one,
        // not this request's stale copy.
        if (storedUser) Object.assign(user, storedUser);
        if (
          user.expires_at &&
          Math.floor(Date.now() / 1000) < user.expires_at - 300
        ) {
          sessionRefreshFirstFailureAt.delete(sessionId);
          return;
        }
        const config = await getOidcConfig();
        const tokenResponse = await client.refreshTokenGrant(
          config,
          user.refresh_token ?? refreshToken
        );
        updateUserSession(user, tokenResponse);
        // Persist by writing the session directly — never via req.login():
        // passport ≥0.6 regenerates the session ID inside login(), which
        // destroys the session row out from under concurrent requests (they
        // 401) and wipes session data such as activeWorkspaceId. A rolling
        // cookie race could then leave the browser holding the dead session
        // ID, logging the user out entirely. req.user is already the same
        // object as session.passport.user (pass-through serializer), but we
        // re-point it explicitly because the reload above replaced req.session
        // with a fresh object.
        (req.session as any).passport = {
          ...((req.session as any).passport ?? {}),
          user,
        };
        await new Promise<void>((resolve, reject) =>
          req.session.save((err) => (err ? reject(err) : resolve()))
        );
        sessionRefreshFirstFailureAt.delete(sessionId);
        return;
      } catch (err) {
        lastErr = err;
        // Don't retry permanent OAuth errors — they will never succeed.
        if (isPermanentRefreshError(err)) break;
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    }
    throw lastErr;
  })();

  sessionRefreshPromises.set(sessionId, refreshWork);

  try {
    await refreshWork;
    return next();
  } catch (error) {
    // Log the actual error so we can diagnose refresh failures.
    console.error(`[auth] Token refresh failed for session ${sessionId}:`, error);
    // If the access token hasn't actually expired yet, let the request
    // through — the failure was during a proactive refresh and the next
    // request will retry.
    if (!tokenExpired) return next();
    // Otherwise: tolerate transient errors for a short window only. Permanent
    // OAuth errors (invalid_grant etc.) and persistent failures fall through
    // to a 401 so the client can promptly fall through to the silent SSO
    // login path rather than appearing authenticated indefinitely.
    if (shouldGracefullyContinue(sessionId, error, Date.now())) return next();
    return res.status(401).json({ message: "Unauthorized" });
  } finally {
    // Always clean up — even on failure — so a retry isn't permanently blocked.
    sessionRefreshPromises.delete(sessionId);
  }
};
