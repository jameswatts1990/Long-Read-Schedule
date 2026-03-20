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

  // No polling needed — session expiry is detected reactively. We only show
  // the destructive toast once the dedicated auth query itself confirms the
  // session is gone, which avoids false flashes from transient 401s elsewhere
  // in the app.

  return {
    user,
    isLoading,
    isAuthenticated,
  };
}
