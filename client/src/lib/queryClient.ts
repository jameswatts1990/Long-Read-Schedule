import { QueryClient, QueryFunction } from "@tanstack/react-query";

let clientIdentifier: string | null = null;

export function setClientIdentifier(identifier: string) {
  clientIdentifier = identifier;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const isMutationMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};

  if (isMutationMethod && clientIdentifier) {
    headers["X-Client-Id"] = clientIdentifier;
  }

  const bodyPayload =
    isMutationMethod &&
    clientIdentifier &&
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    !(data instanceof FormData)
      ? { ...(data as Record<string, unknown>), originClientId: (data as Record<string, unknown>).originClientId ?? clientIdentifier }
      : data;

  const res = await fetch(url, {
    method,
    headers,
    body: bodyPayload ? JSON.stringify(bodyPayload) : undefined,
    credentials: "include",
  });

  // Handle 401 on mutations - force auth state update and UI refresh
  if (res.status === 401) {
    queryClient.setQueryData(["/api/auth/user"], null);
    queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
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
      // Always invalidate auth state on any 401
      if (queryKey[0] !== "/api/auth/user") {
        // Force auth re-check immediately when any API returns 401
        queryClient.setQueryData(["/api/auth/user"], null);
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      }
      
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
      throw new Error("Session expired. Please log in.");
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
