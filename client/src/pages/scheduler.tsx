import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Calendar, Users, ListChecks, Download, Upload, ChevronLeft, ChevronRight, Filter, X, Settings, Minimize2, Maximize2, LogOut } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { WeeklyCalendar } from "@/components/weekly-calendar";
import { TaskDetailsDrawer } from "@/components/task-details-drawer";
import { AddPersonDialog } from "@/components/add-person-dialog";
import { AddTaskDialog } from "@/components/add-task-dialog";
import { type Person, type Task, type Assignment } from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [filterPersonIds, setFilterPersonIds] = useState<Set<string>>(new Set());
  const [filterTaskIds, setFilterTaskIds] = useState<Set<string>>(new Set());
  const [isCompactView, setIsCompactView] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: people = [] } = useQuery<Person[]>({ queryKey: ["/api/people"] });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: assignments = [] } = useQuery<Assignment[]>({ queryKey: ["/api/assignments"] });

  const weekStartStr = formatDate(currentWeekStart);
  let weekAssignments = assignments.filter(a => a.weekStartDate === weekStartStr);

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

  const handleExport = () => {
    const data = { people, tasks, assignments };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-${weekStartStr}.json`;
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

      // Refresh all data
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/people"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/assignments"] }),
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={hasActiveFilters ? "default" : "outline"}
                size="default"
                data-testid="button-filter"
              >
                <Filter className="w-4 h-4" />
                <span>Filter</span>
                {hasActiveFilters && (
                  <span className="ml-1 text-xs">
                    ({filterPersonIds.size + filterTaskIds.size})
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Filter by Person</DropdownMenuLabel>
              {people.map(person => (
                <DropdownMenuCheckboxItem
                  key={person.id}
                  checked={filterPersonIds.has(person.id)}
                  onCheckedChange={() => togglePersonFilter(person.id)}
                  data-testid={`filter-person-${person.id}`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: person.color }}
                    />
                    <span>{person.name}</span>
                  </div>
                </DropdownMenuCheckboxItem>
              ))}
              
              <DropdownMenuSeparator />
              
              <DropdownMenuLabel>Filter by Task</DropdownMenuLabel>
              {tasks.map(task => (
                <DropdownMenuCheckboxItem
                  key={task.id}
                  checked={filterTaskIds.has(task.id)}
                  onCheckedChange={() => toggleTaskFilter(task.id)}
                  data-testid={`filter-task-${task.id}`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: task.color }}
                    />
                    <span>{task.name}</span>
                  </div>
                </DropdownMenuCheckboxItem>
              ))}

              {hasActiveFilters && (
                <>
                  <DropdownMenuSeparator />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={clearFilters}
                    data-testid="button-clear-filters"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Clear Filters
                  </Button>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsCompactView(!isCompactView)}
            data-testid="button-toggle-compact"
          >
            {isCompactView ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </Button>

          {!isCompactView && (
            <>
              <Button
                variant="outline"
                size="default"
                onClick={() => setShowAddPerson(true)}
                data-testid="button-add-person"
              >
                <Users className="w-4 h-4" />
                <span>Add Person</span>
              </Button>
              <Button
                variant="outline"
                size="default"
                onClick={() => setShowAddTask(true)}
                data-testid="button-add-task"
              >
                <ListChecks className="w-4 h-4" />
                <span>Add Task</span>
              </Button>
            </>
          )}
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

      <AddPersonDialog
        open={showAddPerson}
        onClose={() => setShowAddPerson(false)}
      />

      <AddTaskDialog
        open={showAddTask}
        onClose={() => setShowAddTask(false)}
      />
    </div>
  );
}
