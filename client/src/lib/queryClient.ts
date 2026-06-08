import { QueryClient, QueryFunction } from "@tanstack/react-query";

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
      message: "Unauthorized",
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

  if (res.status === 401) {
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
      if (queryKey[0] !== "/api/auth/user") {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      }

      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
      throw new Error("Unauthorized");
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
