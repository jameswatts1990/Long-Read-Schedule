import { QueryClient, QueryFunction } from "@tanstack/react-query";

let hasTriggeredSessionRedirect = false;
let pendingAuthCheck: Promise<boolean> | null = null;

// Returns true when the session has actually expired (so a redirect is
// warranted), false when /api/auth/user still returns a valid user (the 401
// was transient — e.g. an in-flight token refresh on the server). We dedupe
// concurrent checks so a burst of 401s only triggers one verification call.
async function isSessionTrulyExpired(): Promise<boolean> {
  if (pendingAuthCheck) return pendingAuthCheck;
  pendingAuthCheck = (async () => {
    try {
      const r = await fetch("/api/auth/user", { credentials: "include" });
      // Any non-401 response (200 with user, 500, network-recovered) means the
      // session is still considered alive by the server.
      return r.status === 401;
    } catch {
      // Network error: don't bounce the user; assume transient.
      return false;
    } finally {
      // Clear after a short delay so subsequent 401s within the same tick
      // share this result, but later failures can re-check.
      setTimeout(() => { pendingAuthCheck = null; }, 1000);
    }
  })();
  return pendingAuthCheck;
}

async function maybeRedirectToLogin() {
  if (hasTriggeredSessionRedirect || typeof window === "undefined") return;
  const expired = await isSessionTrulyExpired();
  if (!expired) return;
  if (hasTriggeredSessionRedirect) return;
  hasTriggeredSessionRedirect = true;
  const returnTo = window.location.pathname + window.location.search + window.location.hash;
  window.location.assign(`/api/login?returnTo=${encodeURIComponent(returnTo)}`);
}

async function getErrorDetails(res: Response): Promise<{ rawText: string; message: string }> {
  const rawText = (await res.text()) || res.statusText;
  let parsedMessage = rawText;

  try {
    const parsed = JSON.parse(rawText);
    parsedMessage = parsed?.message ?? parsed?.error ?? rawText;
  } catch {
    // Keep raw text for non-JSON error payloads.
  }

  if (res.status === 401) {
    return {
      rawText,
      message: "Your session has expired. Redirecting you to log in...",
    };
  }

  if (res.status === 400 && /No active workspace selected/i.test(parsedMessage)) {
    queryClient.invalidateQueries({ queryKey: ["/api/my-workspace"] });
    return {
      rawText,
      message: "Your workspace session has ended. Please choose a workspace again.",
    };
  }

  return { rawText, message: parsedMessage };
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const { message } = await getErrorDetails(res);
    throw new Error(`${res.status}: ${message}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  // Handle 401 on mutations by re-verifying auth in the background. Only
  // redirect to /api/login if /api/auth/user *also* returns 401 — a single
  // transient 401 (e.g. mid-flight OIDC refresh on the server) should not
  // bounce an active user.
  if (res.status === 401) {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    void maybeRedirectToLogin();
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (res.status === 401) {
      // Re-check auth in the background on non-auth 401s, but keep the
      // current auth state until the dedicated auth query confirms expiry.
      if (queryKey[0] !== "/api/auth/user") {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      }

      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
      // Verify before redirecting; transient 401s from in-flight refreshes
      // should not visibly log the user out.
      void maybeRedirectToLogin();
      throw new Error("Your session has expired. Redirecting you to log in...");
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
