import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar as CalendarIcon, Download, Upload, ChevronLeft, ChevronRight, Settings, Minimize2, Maximize2, LogOut, CalendarDays, LayoutList, ChevronDown, Layers, Loader2, Users, BarChart3, Sun, CalendarClock, UserX, Megaphone, Building2, Bell } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { WeeklyCalendar } from "@/components/weekly-calendar";
import { MonthView } from "@/components/month-view";
import { PipelineView } from "@/components/pipeline-view";
import { TaskDetailsDrawer } from "@/components/task-details-drawer";
import { FilterMegaMenu } from "@/components/filter-mega-menu";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { NotificationBell } from "@/components/notification-bell";
import { HelpGuide } from "@/components/help-guide";
import { type Person, type Task, type Assignment, type PremadeFilter } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatWeekDisplay(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 4);
  
  const startMonth = weekStart.toLocaleDateString("en-US", { month: "short" });
  const startDay = weekStart.getDate();
  const endMonth = weekEnd.toLocaleDateString("en-US", { month: "short" });
  const endDay = weekEnd.getDate();
  
  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

type ViewMode = "week" | "month" | "pipeline";

function getWeeksInMonth(date: Date): Date[] {
  const weeks: Date[] = [];
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const lastOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  
  let current = getMonday(firstOfMonth);
  while (current <= lastOfMonth) {
    weeks.push(new Date(current));
    current = new Date(current);
    current.setDate(current.getDate() + 7);
  }
  return weeks;
}

function formatMonthDisplay(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function Scheduler() {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const week = params.get("week");
    if (week) {
      const d = new Date(week + "T00:00:00Z");
      if (!isNaN(d.getTime())) return d;
    }
    return getMonday(new Date());
  });
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [filterPersonIds, setFilterPersonIds] = useState<Set<string>>(new Set());
  const [filterTaskIds, setFilterTaskIds] = useState<Set<string>>(new Set());
  const [isCompactView, setIsCompactView] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [hideEmptyPipelines, setHideEmptyPipelines] = useState(false);
  const [showOnlyMyAssignments, setShowOnlyMyAssignments] = useState(false);
  const [activeTrainedFilterName, setActiveTrainedFilterName] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { activeWorkspace, availableWorkspaces, setWorkspace } = useWorkspace();
  const { user } = useAuth();
  const isAdmin = (user as any)?.role === 'admin' || (user as any)?.role === 'super_admin' || (user as any)?.isSuperAdmin === true;

  const handleTrainedFilterChange = useCallback((taskName: string | null) => {
    setActiveTrainedFilterName(taskName);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const activeEl = document.activeElement;
      if (
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl?.getAttribute("contenteditable") === "true"
      ) return;
      if (showOnlyMyAssignments) setShowOnlyMyAssignments(false);
      if (hideEmptyPipelines) setHideEmptyPipelines(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showOnlyMyAssignments, hideEmptyPipelines]);

  const { data: people = [], isLoading: peopleLoading } = useQuery<Person[]>({ queryKey: ["/api/people"] });
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const isInitialLoading = peopleLoading || tasksLoading;
  const { data: premadeFilters = [] } = useQuery<PremadeFilter[]>({ queryKey: ["/api/premade-filters"] });

  const currentPersonId = people.find((p) => p.userId === (user as any)?.id)?.id ?? null;

  const createFilterMutation = useMutation({
    mutationFn: async (data: { name: string; personIds: string[]; taskIds: string[] }) => {
      return await apiRequest("POST", "/api/premade-filters", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/premade-filters"] });
    },
  });

  const deleteFilterMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/premade-filters/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/premade-filters"] });
    },
  });

  const updateFilterMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; personIds: string[]; taskIds: string[] }) => {
      return await apiRequest("PUT", `/api/premade-filters/${data.id}`, {
        name: data.name,
        personIds: data.personIds,
        taskIds: data.taskIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/premade-filters"] });
    },
  });
  
  const weekStartStr = formatDate(currentWeekStart);
  
  // Calculate month range for month view
  const weeksInMonth = getWeeksInMonth(currentWeekStart);
  const monthStartStr = weeksInMonth.length > 0 ? formatDate(weeksInMonth[0]) : weekStartStr;
  const monthEndStr = weeksInMonth.length > 0 ? formatDate(weeksInMonth[weeksInMonth.length - 1]) : weekStartStr;
  
  // Fetch assignments filtered by week for week/pipeline view
  const weekAssignmentsQuery = useQuery<Assignment[]>({ 
    queryKey: [`/api/assignments?weekStartDate=${weekStartStr}`],
    enabled: viewMode === "week" || viewMode === "pipeline",
    placeholderData: (previousData) => previousData,
  });

  // Auto-apply rota tasks whenever the viewed week changes.
  // Idempotent on the server: only creates assignments that don't exist yet.
  // On success, newly created assignments are merged into the week query cache
  // via a functional setQueryData updater (dedupe by id).  The functional updater
  // runs against whatever the cache holds at that instant; if the week query has
  // already settled it merges the new rows in, if it hasn't resolved yet it seeds
  // the cache so the eventual query result (which includes the inserts) will be a
  // superset and the dedupe pass removes any duplicates.
  const applyRotaMutation = useMutation({
    mutationFn: async (weekStart: string) => {
      const res = await apiRequest("POST", "/api/rota-tasks/apply", { weekStartDate: weekStart });
      return res.json() as Promise<Assignment[]>;
    },
    onSuccess: (newAssignments, weekStart) => {
      if (newAssignments.length === 0) return;
      const key = `/api/assignments?weekStartDate=${weekStart}`;
      queryClient.setQueryData<Assignment[]>([key], (old) => {
        if (!old) return newAssignments;
        const existingIds = new Set(old.map((a) => a.id));
        const fresh = newAssignments.filter((a) => !existingIds.has(a.id));
        return fresh.length > 0 ? [...old, ...fresh] : old;
      });
      toast({
        title: `${newAssignments.length} rota assignment${newAssignments.length !== 1 ? "s" : ""} applied`,
        description: "Automatic rota tasks scheduled for this week",
        variant: "success",
      });
    },
    onError: (error: unknown) => {
      const raw = error instanceof Error ? error.message : "Unknown error";
      const colonIdx = raw.indexOf(": ");
      toast({
        title: "Failed to apply rota tasks",
        description: colonIdx !== -1 ? raw.slice(colonIdx + 2) : raw,
        variant: "destructive",
      });
    },
  });

  // Only auto-apply in week/pipeline views; month view fetches a date range and
  // would issue multiple redundant requests (one per visible week instead of one).
  // Guard on both user auth and workspace to avoid firing before auth resolves.
  useEffect(() => {
    if (!user || !activeWorkspace) return;
    if (viewMode !== "week" && viewMode !== "pipeline") return;
    applyRotaMutation.mutate(weekStartStr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartStr, activeWorkspace?.id, viewMode, (user as any)?.id]);
  
  // Fetch assignments for entire month range for month view
  const monthAssignmentsQuery = useQuery<Assignment[]>({ 
    queryKey: [`/api/assignments?startDate=${monthStartStr}&endDate=${monthEndStr}`],
    enabled: viewMode === "month",
    placeholderData: (previousData) => previousData,
  });

  const weekAssignmentsData = weekAssignmentsQuery.data ?? [];
  const monthAssignmentsData = monthAssignmentsQuery.data ?? [];
  const isAssignmentDataFetching = viewMode === "month"
    ? monthAssignmentsQuery.isFetching
    : weekAssignmentsQuery.isFetching;
  
  let weekAssignments = viewMode === "month" ? monthAssignmentsData : weekAssignmentsData;

  // Apply filters
  if (filterPersonIds.size > 0) {
    weekAssignments = weekAssignments.filter(a => filterPersonIds.has(a.personId));
  }
  if (filterTaskIds.size > 0) {
    weekAssignments = weekAssignments.filter(a => filterTaskIds.has(a.taskId));
  }
  if (showOnlyMyAssignments && currentPersonId) {
    weekAssignments = weekAssignments.filter((a) => a.personId === currentPersonId);
  }

  const hasActiveFilters = filterPersonIds.size > 0 || filterTaskIds.size > 0;
  const totalFilterCount = filterPersonIds.size + filterTaskIds.size +
    (showOnlyMyAssignments ? 1 : 0) +
    (activeTrainedFilterName ? 1 : 0);

  const visiblePeople = people.filter((p) => !p.excluded);

  // When showing only the signed-in person's assignments, keep only that row visible.
  // Otherwise, when filters are active, only show people who have assignments in the filtered results.
  const displayPeople = showOnlyMyAssignments && currentPersonId
    ? visiblePeople.filter((p) => p.id === currentPersonId)
    : hasActiveFilters
      ? visiblePeople.filter((p) => weekAssignments.some((a) => a.personId === p.id))
      : visiblePeople;

  const canUseMyAssignmentsToggle = !!currentPersonId;

  const toggleMyAssignmentsView = () => {
    if (!canUseMyAssignmentsToggle) {
      toast({
        title: "Person profile not linked",
        description: "Ask an admin to link your user account to a person record to use this view.",
        variant: "warning",
      });
      return;
    }
    setShowOnlyMyAssignments((prev) => !prev);
  };

  const goToPreviousWeek = () => {
    const newWeek = new Date(currentWeekStart);
    newWeek.setDate(newWeek.getDate() - 7);
    setCurrentWeekStart(newWeek);
  };

  const goToNextWeek = () => {
    const newWeek = new Date(currentWeekStart);
    newWeek.setDate(newWeek.getDate() + 7);
    setCurrentWeekStart(newWeek);
  };

  const goToCurrentWeek = () => {
    setCurrentWeekStart(getMonday(new Date()));
  };

  const goToPreviousMonth = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setMonth(newDate.getMonth() - 1);
    setCurrentWeekStart(getMonday(newDate));
  };

  const goToNextMonth = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setMonth(newDate.getMonth() + 1);
    setCurrentWeekStart(getMonday(newDate));
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setCurrentWeekStart(getMonday(date));
      setCalendarOpen(false);
    }
  };

  const togglePipelineView = () => {
    setViewMode(viewMode === "pipeline" ? "week" : "pipeline");
  };

  const toggleMonthView = () => {
    setViewMode(viewMode === "month" ? "week" : "month");
  };

  const handleExport = async () => {
    // Fetch all assignments for complete export (not just current week)
    const res = await fetch("/api/assignments", { credentials: "include" });
    const allAssignments = await res.json();
    
    const data = { people, tasks, assignments: allAssignments };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.people || !data.tasks || !data.assignments) {
        throw new Error("Invalid file format - missing required fields");
      }

      // Create ID mapping for people
      const personIdMap = new Map<string, string>();
      for (const person of data.people) {
        const res = await apiRequest("POST", "/api/people", {
          name: person.name,
          color: person.color,
        });
        const created: Person = await res.json();
        personIdMap.set(person.id, created.id);
      }

      // Create ID mapping for tasks
      const taskIdMap = new Map<string, string>();
      for (const task of data.tasks) {
        const res = await apiRequest("POST", "/api/tasks", {
          name: task.name,
          color: task.color,
        });
        const created: Task = await res.json();
        taskIdMap.set(task.id, created.id);
      }

      // Import assignments with mapped IDs and normalized weekStartDate
      let importedCount = 0;
      let skippedCount = 0;
      for (const assignment of data.assignments) {
        const newPersonId = personIdMap.get(assignment.personId);
        const newTaskId = taskIdMap.get(assignment.taskId);

        if (!newPersonId || !newTaskId) {
          skippedCount++;
          continue;
        }

        // Normalize weekStartDate by trimming
        const normalizedWeekStartDate = typeof assignment.weekStartDate === "string"
          ? assignment.weekStartDate.trim()
          : "";

        if (!normalizedWeekStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(normalizedWeekStartDate)) {
          skippedCount++;
          continue;
        }

        await apiRequest("POST", "/api/assignments", {
          personId: newPersonId,
          taskId: newTaskId,
          day: assignment.day,
          period: assignment.period,
          weekStartDate: normalizedWeekStartDate,
          batchNumber: assignment.batchNumber || "",
          notes: assignment.notes || "",
          date: assignment.date || "",
        });
        importedCount++;
      }

      // Refresh all data - use predicate to invalidate any assignment queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/people"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
        queryClient.invalidateQueries({
          predicate: (query) =>
            typeof query.queryKey[0] === 'string' &&
            query.queryKey[0].startsWith('/api/assignments')
        }),
      ]);

      const skippedNote = skippedCount > 0 ? ` (${skippedCount} skipped — unknown person or task)` : "";
      toast({
        title: "Import successful",
        description: `Imported ${data.people.length} people, ${data.tasks.length} tasks, and ${importedCount} assignments${skippedNote}.`,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Failed to import schedule",
        variant: "destructive",
      });
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const togglePersonFilter = (personId: string) => {
    const newSet = new Set(filterPersonIds);
    if (newSet.has(personId)) {
      newSet.delete(personId);
    } else {
      newSet.add(personId);
    }
    setFilterPersonIds(newSet);
  };

  const toggleTaskFilter = (taskId: string) => {
    const newSet = new Set(filterTaskIds);
    if (newSet.has(taskId)) {
      newSet.delete(taskId);
    } else {
      newSet.add(taskId);
    }
    setFilterTaskIds(newSet);
  };

  const selectAllPeople = (personIds: string[]) => {
    setFilterPersonIds(new Set(personIds));
  };

  const selectAllTasks = (taskIds: string[]) => {
    setFilterTaskIds(new Set(taskIds));
  };

  const applyPremadeFilter = (personIds: string[], taskIds: string[]) => {
    setFilterPersonIds(new Set(personIds));
    setFilterTaskIds(new Set(taskIds));
  };

  const addPremadeFilter = (name: string, personIds: string[], taskIds: string[]) => {
    createFilterMutation.mutate({ name, personIds, taskIds });
  };

  const deletePremadeFilter = (filterId: string) => {
    deleteFilterMutation.mutate(filterId);
  };

  const editPremadeFilter = (filterId: string, name: string, personIds: string[], taskIds: string[]) => {
    updateFilterMutation.mutate({ id: filterId, name, personIds, taskIds });
  };

  const clearFilters = () => {
    setFilterPersonIds(new Set());
    setFilterTaskIds(new Set());
  };

  return (
    <div className="flex flex-col h-screen w-full bg-background">
      <LoadingOverlay />
      <header className="h-16 border-b flex items-center px-6 bg-background shrink-0 gap-3 relative overflow-hidden">
        {/* Pride rainbow stripe */}
        <div
          className="absolute top-0 left-0 right-0 h-1 z-50"
          style={{ background: 'linear-gradient(to right, #E40303, #FF8C00, #FFED00, #008026, #004DFF, #750787)' }}
        />
        <div className="flex items-center gap-3 shrink-0">
          <CalendarIcon className="w-6 h-6 text-primary" data-testid="icon-logo" />
          <h1 className="text-2xl font-semibold" data-testid="text-app-title">Lab Scheduler</h1>
          {/* Workspace Switcher */}
          {activeWorkspace && (
            availableWorkspaces.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="default" className="gap-1.5" data-testid="button-workspace-switcher">
                    <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium max-w-32 truncate">{activeWorkspace.name}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {availableWorkspaces.map((ws) => (
                    <DropdownMenuItem
                      key={ws.id}
                      onClick={() => setWorkspace(ws.id)}
                      className={ws.id === activeWorkspace.id ? "bg-accent" : ""}
                      data-testid={`menu-item-workspace-${ws.id}`}
                    >
                      <Layers className="h-4 w-4 mr-2 text-muted-foreground" />
                      {ws.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground border rounded-md px-3 h-9" data-testid="text-workspace-name">
                <Layers className="h-3.5 w-3.5" />
                <span>{activeWorkspace.name}</span>
              </div>
            )
          )}
        </div>

        {/* Active view filter banners */}
        <div className="flex-1 flex items-center justify-center gap-2 px-4 min-w-0">
          {activeTrainedFilterName && (
            <div className="flex items-center gap-2 rounded-full border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 px-3 py-1 text-sm font-medium shrink-0" data-testid="banner-trained-filter">
              <span>Highlight trained: {activeTrainedFilterName}</span>
              <span className="text-xs opacity-60">· Esc to cancel</span>
            </div>
          )}
          {showOnlyMyAssignments && (
            <div className="flex items-center gap-2 rounded-full border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 px-3 py-1 text-sm font-medium shrink-0" data-testid="banner-my-assignments">
              <span>Showing only my assignments</span>
              <span className="text-xs opacity-60">· Esc to cancel</span>
            </div>
          )}
          {hideEmptyPipelines && (
            <div className="flex items-center gap-2 rounded-full border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 px-3 py-1 text-sm font-medium shrink-0" data-testid="banner-hide-empty-pipelines">
              <span>Hiding empty pipeline rows</span>
              <span className="text-xs opacity-60">· Esc to cancel</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* View Mode Toggles */}
          <Button
            variant={viewMode === "pipeline" ? "default" : "outline"}
            size="default"
            onClick={togglePipelineView}
            title="Pipeline view — shows tasks flagged for pipeline view as rows"
            data-testid="button-toggle-pipeline-view"
          >
            <LayoutList className="w-4 h-4" />
            <span>Pipeline View</span>
          </Button>
          <Button
            variant={viewMode === "month" ? "default" : "outline"}
            size="default"
            onClick={toggleMonthView}
            title="Month view — shows all weeks in the current month"
            data-testid="button-toggle-month-view"
          >
            <CalendarDays className="w-4 h-4" />
            <span>Month View</span>
          </Button>

          {/* Navigation Controls */}
          <div className="flex items-center gap-2 border rounded-md">
            <Button
              variant="ghost"
              size="icon"
              onClick={viewMode === "month" ? goToPreviousMonth : goToPreviousWeek}
              aria-label={viewMode === "month" ? "Previous month" : "Previous week"}
              data-testid="button-previous"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            {/* Date Display with Calendar Popover */}
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="default"
                  data-testid="button-date-picker"
                  className="min-w-36"
                >
                  {viewMode === "month"
                    ? formatMonthDisplay(currentWeekStart)
                    : formatWeekDisplay(currentWeekStart)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single"
                  selected={currentWeekStart}
                  onSelect={handleDateSelect}
                  weekStartsOn={1}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={viewMode === "month" ? goToNextMonth : goToNextWeek}
              aria-label={viewMode === "month" ? "Next month" : "Next week"}
              data-testid="button-next"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          
          {/* Today Button */}
          <Button
            variant="outline"
            size="default"
            onClick={goToCurrentWeek}
            data-testid="button-today"
          >
            Today
          </Button>

          <FilterMegaMenu
            people={people}
            tasks={tasks}
            selectedPersonIds={filterPersonIds}
            selectedTaskIds={filterTaskIds}
            premadeFilters={premadeFilters}
            workspaceStorageKey={activeWorkspace?.id ?? "default"}
            onPersonToggle={togglePersonFilter}
            onPersonSelectAll={selectAllPeople}
            onTaskToggle={toggleTaskFilter}
            onTaskSelectAll={selectAllTasks}
            onApplyPremadeFilter={applyPremadeFilter}
            onAddPremadeFilter={addPremadeFilter}
            onEditPremadeFilter={editPremadeFilter}
            onDeletePremadeFilter={deletePremadeFilter}
            onClearFilters={clearFilters}
            hasActiveFilters={hasActiveFilters}
            filterCount={totalFilterCount}
          />

          {hasActiveFilters && (
            <Button
              variant="outline"
              size="default"
              onClick={clearFilters}
              data-testid="button-clear-filters"
            >
              Clear Filters
            </Button>
          )}

          <Button
            variant={isCompactView ? "default" : "outline"}
            size="icon"
            onClick={() => setIsCompactView(!isCompactView)}
            aria-label={isCompactView ? "Expand view" : "Compact view"}
            title={isCompactView ? "Expand view (show full row heights)" : "Compact view (reduce row heights)"}
            aria-pressed={isCompactView}
            data-testid="button-toggle-compact"
          >
            {isCompactView ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </Button>

          <HelpGuide />
          <NotificationBell onNavigateToWeek={setCurrentWeekStart} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Admin & settings" title="Admin, Reporting, Export, Import" data-testid="button-admin-cog">
                <Settings className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {isAdmin && (
                <>
                  <DropdownMenuLabel>Admin</DropdownMenuLabel>
                  <Link href="/admin?section=people">
                    <DropdownMenuItem data-testid="menu-item-admin-people">
                      <Users className="mr-2 h-4 w-4" />
                      <span>People</span>
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/admin?section=tasks">
                    <DropdownMenuItem data-testid="menu-item-admin-tasks">
                      <LayoutList className="mr-2 h-4 w-4" />
                      <span>Tasks</span>
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/admin?section=rota">
                    <DropdownMenuItem data-testid="menu-item-admin-rota">
                      <CalendarClock className="mr-2 h-4 w-4" />
                      <span>Rota</span>
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/admin?section=announcements">
                    <DropdownMenuItem data-testid="menu-item-admin-announcements">
                      <Megaphone className="mr-2 h-4 w-4" />
                      <span>Announcements</span>
                    </DropdownMenuItem>
                  </Link>
                  {((user as any)?.role === 'super_admin' || (user as any)?.isSuperAdmin === true) && (
                    <Link href="/admin?section=workspaces">
                      <DropdownMenuItem data-testid="menu-item-admin-workspaces">
                        <Building2 className="mr-2 h-4 w-4" />
                        <span>Workspaces</span>
                      </DropdownMenuItem>
                    </Link>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Reporting</DropdownMenuLabel>
                  <Link href="/reporting">
                    <DropdownMenuItem data-testid="menu-item-capacity-reporting">
                      <BarChart3 className="mr-2 h-4 w-4" />
                      <span>Capacity Reporting</span>
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/al-reporting">
                    <DropdownMenuItem data-testid="menu-item-al-reporting">
                      <Sun className="mr-2 h-4 w-4" />
                      <span>AL Reporting</span>
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/absence-reporting">
                    <DropdownMenuItem data-testid="menu-item-absence-reporting">
                      <UserX className="mr-2 h-4 w-4" />
                      <span>Absence Reporting</span>
                    </DropdownMenuItem>
                  </Link>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Data</DropdownMenuLabel>
              <DropdownMenuItem onClick={handleExport} data-testid="menu-item-export">
                <Download className="mr-2 h-4 w-4" />
                <span>Export</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()} data-testid="menu-item-import">
                <Upload className="mr-2 h-4 w-4" />
                <span>Import</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Settings</DropdownMenuLabel>
              <Link href="/settings">
                <DropdownMenuItem data-testid="menu-item-notification-settings">
                  <Bell className="mr-2 h-4 w-4" />
                  <span>Notification Settings</span>
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => window.location.href = "/api/logout"}
                className="text-destructive focus:text-destructive"
                data-testid="menu-item-logout"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
            data-testid="input-import-file"
          />
        </div>
      </header>
      <div className={cn("relative flex-1 overflow-auto", isCompactView ? "p-2" : "p-6")}>
        {isAssignmentDataFetching && (
          <div
            className="absolute inset-x-2 top-2 z-20 flex justify-center pointer-events-none"
            data-testid="week-transition-spinner"
          >
            <div className="flex items-center gap-2 rounded-full border bg-background/95 px-4 py-2 shadow-lg backdrop-blur-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium text-foreground">Loading assignments...</span>
            </div>
          </div>
        )}

        {isInitialLoading && (
          <div className="space-y-2" aria-label="Loading schedule" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-2">
                <Skeleton className="h-10 w-32 shrink-0" />
                {Array.from({ length: 5 }).map((_, j) => (
                  <Skeleton key={j} className="h-10 flex-1" />
                ))}
              </div>
            ))}
          </div>
        )}
        {!isInitialLoading && (viewMode === "week" || viewMode === "month") && people.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <Users className="h-10 w-10 opacity-40" />
            <p className="text-sm font-medium">No team members yet</p>
            <p className="text-xs">Add people in <Link href="/admin" className="underline underline-offset-2">Admin</Link> to start scheduling.</p>
          </div>
        )}
        {!isInitialLoading && viewMode === "week" && people.length > 0 && (
          <WeeklyCalendar
            weekStartDate={weekStartStr}
            assignments={weekAssignments}
            people={displayPeople}
            tasks={tasks}
            onAssignmentClick={setSelectedAssignment}
            isCompactView={isCompactView}
            showOnlyCurrentPerson={showOnlyMyAssignments}
            canToggleCurrentPerson={canUseMyAssignmentsToggle}
            onToggleCurrentPerson={toggleMyAssignmentsView}
            onTrainedFilterChange={handleTrainedFilterChange}
            slackEnabled={!!(user as any)?.slackEnabled}
          />
        )}
        {!isInitialLoading && viewMode === "month" && people.length > 0 && (
          <MonthView
            weeksInMonth={weeksInMonth}
            weekAssignments={weekAssignments}
            people={displayPeople}
            tasks={tasks}
            onAssignmentClick={setSelectedAssignment}
            isCompactView={isCompactView}
            formatDate={formatDate}
            slackEnabled={!!(user as any)?.slackEnabled}
          />
        )}
        {!isInitialLoading && viewMode === "pipeline" && (
          <PipelineView
            weekStartDate={weekStartStr}
            assignments={weekAssignments}
            people={people}
            tasks={tasks}
            onAssignmentClick={setSelectedAssignment}
            isCompactView={isCompactView}
            hideEmptyPipelines={hideEmptyPipelines}
            onToggleHideEmptyPipelines={() => setHideEmptyPipelines((prev) => !prev)}
          />
        )}
      </div>
      <TaskDetailsDrawer
        assignment={selectedAssignment}
        people={people}
        tasks={tasks}
        open={!!selectedAssignment}
        onClose={() => setSelectedAssignment(null)}
        slackEnabled={!!(user as any)?.slackEnabled}
      />
    </div>
  );
}
