import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import Scheduler from "@/pages/scheduler";
import Admin from "@/pages/admin";
import Reporting from "@/pages/reporting";
import ALReporting from "@/pages/al-reporting";
import MyDay from "@/pages/my-day";
import Landing from "@/pages/landing";
import NotFound from "@/pages/not-found";

function useRealTimeUpdates() {
  useEffect(() => {
    const socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });

    socket.on("update", (data) => {
      console.log("Real-time update received:", data);
      // Invalidate all queries to refresh data across the app
      queryClient.invalidateQueries();
    });

    return () => {
      socket.disconnect();
    };
  }, []);
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
      const isMobileDevice = mobileRegex.test(userAgent.toLowerCase());
      const isSmallScreen = window.innerWidth < 768;
      setIsMobile(isMobileDevice || isSmallScreen);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const isMobile = useIsMobile();
  const [location, setLocation] = useLocation();
  const [hasRedirected, setHasRedirected] = useState(false);

  useRealTimeUpdates();

  useEffect(() => {
    if (!isLoading && isAuthenticated && isMobile && !location.startsWith("/my-day") && !hasRedirected) {
      setHasRedirected(true);
      setLocation("/my-day");
    }
  }, [isLoading, isAuthenticated, isMobile, location, hasRedirected, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Landing />;
  }

  return (
    <Switch>
      <Route path="/" component={Scheduler} />
      <Route path="/my-day" component={MyDay} />
      <Route path="/admin" component={Admin} />
      <Route path="/reporting" component={Reporting} />
      <Route path="/al-reporting" component={ALReporting} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
