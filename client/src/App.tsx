import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
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
import AbsenceReporting from "@/pages/absence-reporting";
import MyDay from "@/pages/my-day";
import Landing from "@/pages/landing";
import WorkspacePicker from "@/pages/workspace-picker";
import FirstLoginOnboarding from "@/pages/first-login-onboarding";
import NotFound from "@/pages/not-found";
import Settings from "@/pages/settings";
import { SiteAnnouncementBar } from "@/components/site-announcement-bar";
import { SessionExpiredBanner } from "@/components/session-expired-banner";

// Predicate that matches any cached query whose key starts with "/api/assignments"
const isAssignmentQuery = (query: { queryKey: readonly unknown[] }) => {
  const k = query.queryKey[0];
  return typeof k === "string" && k.startsWith("/api/assignments");
};

function useRealTimeUpdates(workspaceId: string | null) {
  const socketRef = useRef<Socket | null>(null);

  const handleUpdate = (data: { type?: string; action?: string; record?: Assignment & { id: string; weekStartDate?: string } }) => {
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
      } else if (action === "delete-group" && Array.isArray((record as any)?.ids)) {
        // Linked-group delete: remove every member id from cached lists — zero refetches
        const ids = new Set((record as any).ids as string[]);
        queryClient.setQueriesData<Assignment[]>(
          { predicate: isAssignmentQuery },
          (old) => (old ? old.filter((a) => !ids.has(a.id)) : old),
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
    } else if (type === "instruments") {
      queryClient.invalidateQueries({ queryKey: ["/api/instruments"] });
    } else if (type === "rota-tasks") {
      queryClient.invalidateQueries({ queryKey: ["/api/rota-tasks"] });
    } else if (type === "premade-filters") {
      queryClient.invalidateQueries({ queryKey: ["/api/premade-filters"] });
    }
  };

  useEffect(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // Fix Issue 8: don't connect at all when there's no workspace (landing page,
    // unauthenticated visitors, or users who haven't picked a workspace yet)
    if (!workspaceId) return;

    const connect = () => {
      if (socketRef.current?.connected) return; // already live

      const socket = io({
        path: "/socket.io",
        transports: ["websocket"],
        query: { workspaceId },
      });

      socket.on("update", handleUpdate);
      socketRef.current = socket;
    };

    const disconnect = () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };

    // Fix 4: pause the socket while the tab is hidden so the server stops
    // sending heartbeats to a screen nobody is looking at. Reconnect the
    // moment the tab becomes visible again (and refetch stale data so the
    // user sees fresh content immediately).
    const onVisibilityChange = () => {
      if (document.hidden) {
        disconnect();
      } else {
        connect();
        // Check auth first so an expired session surfaces immediately on tab
        // focus rather than mid-interaction after a long absence.
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        // Refresh everything that may have changed while the tab was away
        queryClient.invalidateQueries({ predicate: isAssignmentQuery });
        queryClient.invalidateQueries({ queryKey: ["/api/people"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/instruments"] });
        queryClient.invalidateQueries({ queryKey: ["/api/premade-filters"] });
      }
    };

    // Only connect if the tab is currently visible
    if (!document.hidden) {
      connect();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      disconnect();
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
  const { isAuthenticated, isLoading: authLoading, user, sessionExpired } = useAuth();
  const isAdminUser = (user as any)?.role === 'admin' || (user as any)?.role === 'super_admin' || (user as any)?.isSuperAdmin === true;
  const { activeWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const { data: onboardingStatus, isLoading: onboardingLoading } = useQuery<{ needsOnboarding: boolean }>({
    queryKey: ["/api/auth/onboarding-status"],
    enabled: isAuthenticated,
    retry: false,
  });
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

  // Show spinner only while genuinely loading (not when session has just expired —
  // in that case we want to keep the last rendered content visible).
  if (!sessionExpired && (authLoading || (isAuthenticated && (workspaceLoading || onboardingLoading)))) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // User has never authenticated in this session → show landing page
  if (!isAuthenticated && !sessionExpired) {
    return <Landing />;
  }

  // Session expired mid-use: keep last-known state visible and show banner.
  // Skip onboarding/workspace checks — the user already passed those.
  if (sessionExpired) {
    return (
      <>
        <SessionExpiredBanner sessionExpired={sessionExpired} />
        <SiteAnnouncementBar />
        <Switch>
          <Route path="/" component={Scheduler} />
          <Route path="/my-day" component={MyDay} />
          <Route path="/settings" component={Settings} />
          <Route path="/admin" component={isAdminUser ? Admin : NotFound} />
          <Route path="/reporting" component={isAdminUser ? Reporting : NotFound} />
          <Route path="/al-reporting" component={isAdminUser ? ALReporting : NotFound} />
          <Route path="/absence-reporting" component={isAdminUser ? AbsenceReporting : NotFound} />
          <Route component={NotFound} />
        </Switch>
      </>
    );
  }

  if (onboardingStatus?.needsOnboarding) {
    return <FirstLoginOnboarding />;
  }

  // Authenticated but no workspace selected
  if (!activeWorkspace) {
    return <WorkspacePicker />;
  }

  return (
    <>
      <SiteAnnouncementBar />
      <Switch>
        <Route path="/" component={Scheduler} />
        <Route path="/my-day" component={MyDay} />
        <Route path="/settings" component={Settings} />
        <Route path="/admin" component={isAdminUser ? Admin : NotFound} />
        <Route path="/reporting" component={isAdminUser ? Reporting : NotFound} />
        <Route path="/al-reporting" component={isAdminUser ? ALReporting : NotFound} />
        <Route path="/absence-reporting" component={isAdminUser ? AbsenceReporting : NotFound} />
        <Route component={NotFound} />
      </Switch>
    </>
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
