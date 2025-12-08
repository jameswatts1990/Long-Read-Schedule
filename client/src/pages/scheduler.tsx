import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Calendar, Download, Upload, ChevronLeft, ChevronRight, Settings, Minimize2, Maximize2, LogOut } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { WeeklyCalendar } from "@/components/weekly-calendar";
import { TaskDetailsDrawer } from "@/components/task-details-drawer";
import { FilterMegaMenu } from "@/components/filter-mega-menu";
import { type Person, type Task, type Assignment, type PremadeFilter } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
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

export default function Scheduler() {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getMonday(new Date()));
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [filterPersonIds, setFilterPersonIds] = useState<Set<string>>(new Set());
  const [filterTaskIds, setFilterTaskIds] = useState<Set<string>>(new Set());
  const [isCompactView, setIsCompactView] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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
  
  const weekStartStr = formatDate(currentWeekStart);
  
  // Fetch assignments filtered by week for better performance
  const { data: weekAssignmentsData = [] } = useQuery<Assignment[]>({ 
    queryKey: [`/api/assignments?weekStartDate=${weekStartStr}`] 
  });
  
  let weekAssignments = weekAssignmentsData;

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

  const clearFilters = () => {
    setFilterPersonIds(new Set());
    setFilterTaskIds(new Set());
  };

  return (
    <div className="flex flex-col h-screen w-full bg-background">
      <header className="h-16 border-b flex items-center justify-between px-6 bg-background shrink-0">
        <div className="flex items-center gap-3">
          <Calendar className="w-6 h-6 text-primary" data-testid="icon-logo" />
          <h1 className="text-2xl font-semibold" data-testid="text-app-title">Lab Scheduler</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border rounded-md">
            <Button
              variant="ghost"
              size="icon"
              onClick={goToPreviousWeek}
              data-testid="button-previous-week"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="default"
              onClick={goToCurrentWeek}
              data-testid="button-current-week"
              className="min-w-32"
            >
              {formatWeekDisplay(currentWeekStart)}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={goToNextWeek}
              data-testid="button-next-week"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <FilterMegaMenu
            people={people}
            tasks={tasks}
            selectedPersonIds={filterPersonIds}
            selectedTaskIds={filterTaskIds}
            premadeFilters={premadeFilters}
            onPersonToggle={togglePersonFilter}
            onTaskToggle={toggleTaskFilter}
            onApplyPremadeFilter={applyPremadeFilter}
            onAddPremadeFilter={addPremadeFilter}
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

          <Button
            variant="outline"
            size="default"
            onClick={handleExport}
            data-testid="button-export"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </Button>
          <Button
            variant="outline"
            size="default"
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-import"
          >
            <Upload className="w-4 h-4" />
            <span>Import</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
            data-testid="input-import-file"
          />
          <Link href="/admin">
            <Button variant="outline" size="default" data-testid="button-admin">
              <Settings className="w-4 h-4" />
              <span>Admin</span>
            </Button>
          </Link>
          <Button
            variant="outline"
            size="default"
            onClick={() => window.location.href = "/api/logout"}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </Button>
        </div>
      </header>

      <div className={`flex-1 overflow-auto ${isCompactView ? "p-2" : "p-6"}`}>
        <WeeklyCalendar
          weekStartDate={weekStartStr}
          assignments={weekAssignments}
          people={displayPeople}
          tasks={tasks}
          onAssignmentClick={setSelectedAssignment}
          isCompactView={isCompactView}
        />
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
