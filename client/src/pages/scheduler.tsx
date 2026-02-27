import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Calendar as CalendarIcon, Download, Upload, ChevronLeft, ChevronRight, Settings, Minimize2, Maximize2, LogOut, CalendarDays, LayoutList, MoreVertical, ChevronDown, Layers } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { WeeklyCalendar } from "@/components/weekly-calendar";
import { MonthView } from "@/components/month-view";
import { PipelineView } from "@/components/pipeline-view";
import { TaskDetailsDrawer } from "@/components/task-details-drawer";
import { FilterMegaMenu } from "@/components/filter-mega-menu";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { type Person, type Task, type Assignment, type PremadeFilter } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useWorkspace } from "@/hooks/useWorkspace";

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
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getMonday(new Date()));
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [filterPersonIds, setFilterPersonIds] = useState<Set<string>>(new Set());
  const [filterTaskIds, setFilterTaskIds] = useState<Set<string>>(new Set());
  const [isCompactView, setIsCompactView] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { activeWorkspace, availableWorkspaces, setWorkspace } = useWorkspace();

  const { data: people = [] } = useQuery<Person[]>({ queryKey: ["/api/people"] });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: premadeFilters = [] } = useQuery<PremadeFilter[]>({ queryKey: ["/api/premade-filters"] });

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
  const { data: weekAssignmentsData = [] } = useQuery<Assignment[]>({ 
    queryKey: [`/api/assignments?weekStartDate=${weekStartStr}`],
    enabled: viewMode === "week" || viewMode === "pipeline"
  });
  
  // Fetch assignments for entire month range for month view
  const { data: monthAssignmentsData = [] } = useQuery<Assignment[]>({ 
    queryKey: [`/api/assignments?startDate=${monthStartStr}&endDate=${monthEndStr}`],
    enabled: viewMode === "month"
  });
  
  let weekAssignments = viewMode === "month" ? monthAssignmentsData : weekAssignmentsData;

  // Apply filters
  if (filterPersonIds.size > 0) {
    weekAssignments = weekAssignments.filter(a => filterPersonIds.has(a.personId));
  }
  if (filterTaskIds.size > 0) {
    weekAssignments = weekAssignments.filter(a => filterTaskIds.has(a.taskId));
  }

  const hasActiveFilters = filterPersonIds.size > 0 || filterTaskIds.size > 0;

  // When filters are active, only show people who have assignments in the filtered results
  const displayPeople = hasActiveFilters
    ? people.filter(p => !p.excluded && weekAssignments.some(a => a.personId === p.id))
    : people.filter(p => !p.excluded);

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
      for (const assignment of data.assignments) {
        const newPersonId = personIdMap.get(assignment.personId);
        const newTaskId = taskIdMap.get(assignment.taskId);

        if (!newPersonId || !newTaskId) {
          console.warn("Skipping assignment with invalid person or task ID", assignment);
          continue;
        }

        // Normalize weekStartDate by trimming
        const normalizedWeekStartDate = typeof assignment.weekStartDate === "string" 
          ? assignment.weekStartDate.trim() 
          : "";

        if (!normalizedWeekStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(normalizedWeekStartDate)) {
          console.warn("Skipping assignment with invalid weekStartDate", assignment);
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

      toast({
        title: "Import successful",
        description: `Imported ${data.people.length} people, ${data.tasks.length} tasks, and ${data.assignments.length} assignments.`,
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
      <header className="h-16 border-b flex items-center justify-between px-6 bg-background shrink-0">
        <div className="flex items-center gap-3">
          <CalendarIcon className="w-6 h-6 text-primary" data-testid="icon-logo" />
          <h1 className="text-2xl font-semibold" data-testid="text-app-title">LR Lab Scheduler</h1>
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

        <div className="flex items-center gap-3">
          {/* View Mode Toggles */}
          <Button
            variant={viewMode === "pipeline" ? "default" : "outline"}
            size="default"
            onClick={togglePipelineView}
            data-testid="button-toggle-pipeline-view"
          >
            <LayoutList className="w-4 h-4" />
            <span>Pipeline View</span>
          </Button>
          <Button
            variant={viewMode === "month" ? "default" : "outline"}
            size="default"
            onClick={toggleMonthView}
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
            filterCount={filterPersonIds.size + filterTaskIds.size}
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
            variant="outline"
            size="icon"
            onClick={() => setIsCompactView(!isCompactView)}
            data-testid="button-toggle-compact"
          >
            {isCompactView ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" data-testid="button-more-actions">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleExport} data-testid="menu-item-export">
                <Download className="mr-2 h-4 w-4" />
                <span>Export</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()} data-testid="menu-item-import">
                <Upload className="mr-2 h-4 w-4" />
                <span>Import</span>
              </DropdownMenuItem>
              <Link href="/admin">
                <DropdownMenuItem data-testid="menu-item-admin">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Admin</span>
                </DropdownMenuItem>
              </Link>
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
      <div className={`flex-1 overflow-auto ${isCompactView ? "p-2" : "p-6"}`}>
        {viewMode === "week" && (
          <WeeklyCalendar
            weekStartDate={weekStartStr}
            assignments={weekAssignments}
            people={displayPeople}
            tasks={tasks}
            onAssignmentClick={setSelectedAssignment}
            isCompactView={isCompactView}
          />
        )}
        {viewMode === "month" && (
          <MonthView
            weeksInMonth={weeksInMonth}
            weekAssignments={weekAssignments}
            people={displayPeople}
            tasks={tasks}
            onAssignmentClick={setSelectedAssignment}
            isCompactView={isCompactView}
            formatDate={formatDate}
          />
        )}
        {viewMode === "pipeline" && (
          <PipelineView
            weekStartDate={weekStartStr}
            assignments={weekAssignments}
            people={people}
            tasks={tasks}
            onAssignmentClick={setSelectedAssignment}
            isCompactView={isCompactView}
          />
        )}
      </div>
      <TaskDetailsDrawer
        assignment={selectedAssignment}
        people={people}
        tasks={tasks}
        open={!!selectedAssignment}
        onClose={() => setSelectedAssignment(null)}
      />
    </div>
  );
}
