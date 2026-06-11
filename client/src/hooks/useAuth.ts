import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getQueryFn } from "@/lib/queryClient";

export function useAuth() {
  const wasAuthenticated = useRef(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Must use returnNull (not throw) so React Query sets data=null on 401.
  // With "throw", RQ preserves the previous user object in data even in error
  // state, keeping isAuthenticated=true and preventing session expiry detection.
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const isAuthenticated = !!user;

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        wasAuthenticated.current = true;
        setSessionExpired(false);
      } else if (wasAuthenticated.current) {
        setSessionExpired(true);
      }
    }
  }, [isAuthenticated, isLoading]);

  return {
    user,
    isLoading,
    isAuthenticated,
    sessionExpired,
  };
}
