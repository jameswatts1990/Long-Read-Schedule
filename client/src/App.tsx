import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import type { Assignment, Person, PremadeFilter, Task } from "@shared/schema";
import { applyAssignmentDelete, applyAssignmentUpsert, isAssignmentQuery } from "@/lib/assignment-cache";
import Scheduler from "@/pages/scheduler";
import Admin from "@/pages/admin";
import Reporting from "@/pages/reporting";
import ALReporting from "@/pages/al-reporting";
import MyDay from "@/pages/my-day";
import Landing from "@/pages/landing";
import WorkspacePicker from "@/pages/workspace-picker";
import NotFound from "@/pages/not-found";

function useRealTimeUpdates(workspaceId: string | null) {
  const socketRef = useRef<Socket | null>(null);

  const handleUpdate = (data: { type?: string; action?: string; record?: Record<string, unknown> & { id?: string } }) => {
    const { type, action, record } = data ?? {};

    if (type === "assignments") {
      const assignmentRecord = record as Assignment;

      if ((action === "create" || action === "update") && assignmentRecord?.weekStartDate) {
        applyAssignmentUpsert(queryClient, assignmentRecord);
      } else if (action === "delete" && record?.id) {
        applyAssignmentDelete(queryClient, record.id, (record as Assignment | undefined)?.weekStartDate);
      } else {
        // Fallback for reorder-cell and any future ops: predicate invalidation
        // Fixes Issue 2: catches all compound query keys like "?weekStartDate=..."
        queryClient.invalidateQueries({ predicate: isAssignmentQuery });
      }
    } else if (type === "people") {
      if ((action === "create" || action === "update") && record?.id) {
        const personRecord = record as Person;
        queryClient.setQueryData<Person[]>(["/api/people"], (old) => {
          if (!old) return old;
          if (action === "create") {
            return old.some((person) => person.id === personRecord.id) ? old : [...old, personRecord];
          }
          return old.map((person) => (person.id === personRecord.id ? personRecord : person));
        });
      } else if (action === "delete" && record?.id) {
        queryClient.setQueryData<Person[]>(["/api/people"], (old) =>
          old ? old.filter((person) => person.id !== record.id) : old,
        );
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      }
    } else if (type === "tasks") {
      if ((action === "create" || action === "update") && record?.id) {
        const taskRecord = record as Task;
        queryClient.setQueryData<Task[]>(["/api/tasks"], (old) => {
          if (!old) return old;
          if (action === "create") {
            return old.some((task) => task.id === taskRecord.id) ? old : [...old, taskRecord];
          }
          return old.map((task) => (task.id === taskRecord.id ? taskRecord : task));
        });
      } else if (action === "delete" && record?.id) {
        queryClient.setQueryData<Task[]>(["/api/tasks"], (old) =>
          old ? old.filter((task) => task.id !== record.id) : old,
        );
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      }
    } else if (type === "premade-filters") {
      if ((action === "create" || action === "update") && record?.id) {
        const filterRecord = record as PremadeFilter;
        queryClient.setQueryData<PremadeFilter[]>(["/api/premade-filters"], (old) => {
          if (!old) return old;
          if (action === "create") {
            return old.some((filter) => filter.id === filterRecord.id) ? old : [...old, filterRecord];
          }
          return old.map((filter) => (filter.id === filterRecord.id ? filterRecord : filter));
        });
      } else if (action === "delete" && record?.id) {
        queryClient.setQueryData<PremadeFilter[]>(["/api/premade-filters"], (old) =>
          old ? old.filter((filter) => filter.id !== record.id) : old,
        );
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/premade-filters"] });
      }
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
        // Refresh everything that may have changed while the tab was away
        queryClient.invalidateQueries({ predicate: isAssignmentQuery });
        queryClient.invalidateQueries({ queryKey: ["/api/people"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
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
