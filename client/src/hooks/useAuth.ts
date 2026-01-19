import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

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

  // Periodic polling only when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    }, 5 * 60 * 1000); // Check every 5 minutes

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  return {
    user,
    isLoading,
    isAuthenticated,
  };
}
