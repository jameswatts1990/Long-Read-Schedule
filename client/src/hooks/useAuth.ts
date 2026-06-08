import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

export function useAuth() {
  const wasAuthenticated = useRef(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
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
