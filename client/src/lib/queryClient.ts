import { QueryClient, QueryFunction } from "@tanstack/react-query";

let hasTriggeredSessionRedirect = false;

function redirectToLogin() {
  if (hasTriggeredSessionRedirect || typeof window === "undefined") return;
  hasTriggeredSessionRedirect = true;
  window.location.assign("/api/login");
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

  // Handle 401 on mutations by re-checking auth in the background.
  // Avoid forcing the app into a logged-out state until /api/auth/user
  // confirms the session is actually gone.
  if (res.status === 401) {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    redirectToLogin();
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
      redirectToLogin();
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
