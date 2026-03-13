import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

export function useAuth() {
  const { toast } = useToast();
  const wasAuthenticated = useRef(false);
  
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const isAuthenticated = !!user;

  // Handle session expiration detection
  useEffect(() => {
    if (!isLoading) {
      if (wasAuthenticated.current && !isAuthenticated) {
        toast({
          title: "Session expired",
          description: "Your session has ended. Please log in again to continue.",
          variant: "destructive",
        });
      }
      wasAuthenticated.current = isAuthenticated;
    }
  }, [isAuthenticated, isLoading, toast]);

  // No polling needed — session expiry is detected reactively via the 401
  // handler in queryClient.ts (apiRequest / getQueryFn both call
  // setQueryData(["/api/auth/user"], null) on any 401 response).
  // A setInterval here was firing 2 DB queries every 5 minutes per open tab
  // for zero benefit.

  return {
    user,
    isLoading,
    isAuthenticated,
  };
}
