import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Calendar, Users, ListChecks, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WeeklyCalendar } from "@/components/weekly-calendar";
import { PeoplePanel } from "@/components/people-panel";
import { TaskLibrary } from "@/components/task-library";
import { TaskDetailsDrawer } from "@/components/task-details-drawer";
import { AddPersonDialog } from "@/components/add-person-dialog";
import { AddTaskDialog } from "@/components/add-task-dialog";
import { type Person, type Task, type Assignment } from "@shared/schema";

export default function Scheduler() {
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [filterPerson, setFilterPerson] = useState<string | null>(null);
  const [filterTask, setFilterTask] = useState<string | null>(null);
  const [activePerson, setActivePerson] = useState<string | null>(null);

  const { data: people = [] } = useQuery<Person[]>({ queryKey: ["/api/people"] });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: assignments = [] } = useQuery<Assignment[]>({ queryKey: ["/api/assignments"] });

  const handleExport = () => {
    const data = { people, tasks, assignments };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredAssignments = assignments.filter((assignment) => {
    if (filterPerson && assignment.personId !== filterPerson) return false;
    if (filterTask && assignment.taskId !== filterTask) return false;
    return true;
  });

  return (
    <div className="flex h-screen w-full bg-background">
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="h-16 border-b flex items-center justify-between px-6 bg-background shrink-0">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-primary" data-testid="icon-logo" />
            <h1 className="text-2xl font-semibold" data-testid="text-app-title">Lab Scheduler</h1>
          </div>

          <div className="flex items-center gap-2">
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

        <div className="flex-1 overflow-auto">
          <div className="max-w-screen-2xl mx-auto px-6 py-4">
            <WeeklyCalendar
              assignments={filteredAssignments}
              people={people}
              tasks={tasks}
              activePerson={activePerson}
              onAssignmentClick={setSelectedAssignment}
            />
          </div>
        </div>
      </div>

      <aside className="w-80 border-l bg-card shrink-0 overflow-auto">
        <div className="p-4 space-y-6">
          <PeoplePanel
            people={people}
            filterPerson={filterPerson}
            activePerson={activePerson}
            onFilterChange={setFilterPerson}
            onActivePerson={setActivePerson}
          />
          
          <TaskLibrary
            tasks={tasks}
            filterTask={filterTask}
            onFilterChange={setFilterTask}
          />
        </div>
      </aside>

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
