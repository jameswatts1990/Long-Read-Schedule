import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Calendar, Users, ListChecks, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WeeklyCalendar } from "@/components/weekly-calendar";
import { TaskDetailsDrawer } from "@/components/task-details-drawer";
import { AddPersonDialog } from "@/components/add-person-dialog";
import { AddTaskDialog } from "@/components/add-task-dialog";
import { type Person, type Task, type Assignment } from "@shared/schema";

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

  const { data: people = [] } = useQuery<Person[]>({ queryKey: ["/api/people"] });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: assignments = [] } = useQuery<Assignment[]>({ queryKey: ["/api/assignments"] });

  const weekStartStr = formatDate(currentWeekStart);
  const weekAssignments = assignments.filter(a => a.weekStartDate === weekStartStr);

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
          <Button
            variant="outline"
            size="default"
            onClick={handleExport}
            data-testid="button-export"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <WeeklyCalendar
          weekStartDate={weekStartStr}
          assignments={weekAssignments}
          people={people}
          tasks={tasks}
          onAssignmentClick={setSelectedAssignment}
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
