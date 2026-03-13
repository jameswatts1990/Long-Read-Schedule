import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import type { Assignment } from "@shared/schema";
import Scheduler from "@/pages/scheduler";
import Admin from "@/pages/admin";
import Reporting from "@/pages/reporting";
import ALReporting from "@/pages/al-reporting";
import MyDay from "@/pages/my-day";
import Landing from "@/pages/landing";
import WorkspacePicker from "@/pages/workspace-picker";
import NotFound from "@/pages/not-found";

// Predicate that matches any cached query whose key starts with "/api/assignments"
const isAssignmentQuery = (query: { queryKey: readonly unknown[] }) => {
  const k = query.queryKey[0];
  return typeof k === "string" && k.startsWith("/api/assignments");
};

function useRealTimeUpdates(workspaceId: string | null) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // Fix Issue 8: don't connect at all when there's no workspace (landing page,
    // unauthenticated visitors, or users who haven't picked a workspace yet)
    if (!workspaceId) return;

    const socket = io({
      path: "/socket.io",
      transports: ["websocket"],
      query: { workspaceId },
    });

    socket.on("update", (data: { type?: string; action?: string; record?: Assignment & { id: string; weekStartDate?: string } }) => {
      const { type, action, record } = data ?? {};

      if (type === "assignments") {
        if ((action === "create" || action === "update") && record?.weekStartDate) {
          // Fix Issues 1 & 2: update the specific week's cache directly — zero HTTP requests
          const weekKey = `/api/assignments?weekStartDate=${record.weekStartDate}`;
          queryClient.setQueryData<Assignment[]>([weekKey], (old) => {
            if (!old) return old; // week not in cache — nothing to update
            if (action === "create") {
              // Guard against duplicate (creator already has it via their own mutation)
              return old.some((a) => a.id === record.id) ? old : [...old, record];
            }
            return old.map((a) => (a.id === record.id ? record : a));
          });
        } else if (action === "delete" && record?.id) {
          // Remove from every cached assignment list (week view, month view, reporting)
          queryClient.setQueriesData<Assignment[]>(
            { predicate: isAssignmentQuery },
            (old) => (old ? old.filter((a) => a.id !== record.id) : old),
          );
        } else {
          // Fallback for reorder-cell and any future ops: predicate invalidation
          // Fixes Issue 2: catches all compound query keys like "?weekStartDate=..."
          queryClient.invalidateQueries({ predicate: isAssignmentQuery });
        }
      } else if (type === "people") {
        queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      } else if (type === "tasks") {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      } else if (type === "premade-filters") {
        queryClient.invalidateQueries({ queryKey: ["/api/premade-filters"] });
      }
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [workspaceId]);
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
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
}

function Router() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { activeWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const isMobile = useIsMobile();
  const [location, setLocation] = useLocation();
  const [hasRedirected, setHasRedirected] = useState(false);

  useRealTimeUpdates(activeWorkspace?.id ?? null);

  useEffect(() => {
    if (!authLoading && !workspaceLoading && isAuthenticated && activeWorkspace && isMobile && !location.startsWith("/my-day") && !hasRedirected) {
      setHasRedirected(true);
      setLocation("/my-day");
    }
  }, [authLoading, workspaceLoading, isAuthenticated, activeWorkspace, isMobile, location, hasRedirected, setLocation]);

  if (authLoading || (isAuthenticated && workspaceLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Landing />;
  }

  // Authenticated but no workspace selected
  if (!activeWorkspace) {
    return <WorkspacePicker />;
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
