import { useState } from "react";
import { type Person, type Task, type Assignment, DAYS } from "@shared/schema";
import { addDays } from "date-fns";
import { Eye, EyeOff, Link2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddAssignmentDialog } from "@/components/add-assignment-dialog";

interface PipelineViewProps {
  weekStartDate: string;
  assignments: Assignment[];
  people: Person[];
  tasks: Task[];
  onAssignmentClick: (assignment: Assignment) => void;
  isCompactView: boolean;
  hideEmptyPipelines?: boolean;
  onToggleHideEmptyPipelines?: () => void;
  slackEnabled?: boolean;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDayDate(weekStart: Date, dayIndex: number): string {
  return formatDate(addDays(weekStart, dayIndex));
}

function getDayLabel(weekStart: Date, dayIndex: number): string {
  const d = addDays(weekStart, dayIndex);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function PipelineView({
  weekStartDate,
  assignments,
  people,
  tasks,
  onAssignmentClick,
  isCompactView,
  hideEmptyPipelines = false,
  onToggleHideEmptyPipelines,
  slackEnabled = false,
}: PipelineViewProps) {
  const [selectedCell, setSelectedCell] = useState<{ taskId: string; day: string } | null>(null);
  const pipelineTasks = tasks.filter((t) => t.showInPipelineView);
  const visiblePipelineTasks = hideEmptyPipelines
    ? pipelineTasks.filter((task) => assignments.some((a) => a.taskId === task.id))
    : pipelineTasks;

  const weekStart = new Date(weekStartDate + "T00:00:00");

  const personMap = new Map<string, Person>(people.map((p) => [p.id, p]));
  const taskMap = new Map<string, Task>(tasks.map((t) => [t.id, t]));

  const cellHeight = isCompactView ? "min-h-[56px]" : "min-h-[80px]";
  const nameColWidth = isCompactView ? "140px" : "200px";

  if (pipelineTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-24">
        <p className="text-base">No tasks are configured for the pipeline view.</p>
        <p className="text-sm">Go to Admin and enable "Show in pipeline view" on the tasks you want to see here.</p>
      </div>
    );
  }

  if (hideEmptyPipelines && visiblePipelineTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-24">
        <p className="text-base">No pipeline rows have assignments this week.</p>
        <p className="text-sm">Turn off the visibility filter to show all configured pipeline rows.</p>
      </div>
    );
  }

  return (
    <>
    <div className="overflow-auto">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${nameColWidth} repeat(5, minmax(140px, 1fr))`,
          minWidth: `calc(${nameColWidth} + 700px)`,
        }}
      >
        {/* Header row */}
        <div className="sticky left-0 z-20 bg-background border-b border-r flex items-center px-3 py-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pipeline</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-1 h-6 w-6"
            onClick={onToggleHideEmptyPipelines}
            aria-label={hideEmptyPipelines ? "Show all pipeline rows" : "Hide empty pipeline rows"}
            title={hideEmptyPipelines ? "Show all pipeline rows" : "Hide empty pipeline rows"}
            data-testid="button-pipeline-hide-empty"
          >
            {hideEmptyPipelines ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </Button>
        </div>
        {DAYS.map((day, idx) => (
          <div
            key={day}
            className="border-b border-r bg-background px-3 py-2"
            data-testid={`pipeline-header-${day}`}
          >
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {getDayLabel(weekStart, idx)}
            </span>
          </div>
        ))}

        {/* Task rows */}
        {visiblePipelineTasks.map((task) => (
          <>
            {/* Task name cell */}
            <div
              key={`task-${task.id}`}
              className={`sticky left-0 z-10 border-b border-r flex items-start gap-2 px-3 py-2 ${cellHeight}`}
              style={{ backgroundColor: "hsl(var(--background))" }}
              data-testid={`pipeline-task-label-${task.id}`}
            >
              <span
                className="mt-1 flex-shrink-0 w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: task.color }}
              />
              <span className={`font-medium leading-tight ${isCompactView ? "text-xs" : "text-sm"}`}>
                {task.name}
              </span>
            </div>

            {/* Day cells for this task */}
            {DAYS.map((day, idx) => {
              const dayAssignments = assignments.filter(
                (a) => a.taskId === task.id && a.day === day
              );

              return (
                <div
                  key={`${task.id}-${day}`}
                  className={`group border-b border-r px-2 py-1.5 flex flex-col gap-1 ${cellHeight}`}
                  style={{ backgroundColor: `${task.color}18` }}
                  data-testid={`pipeline-cell-${task.id}-${day}`}
                >
                  <button
                    onClick={() => setSelectedCell({ taskId: task.id, day })}
                    className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-opacity px-1 py-0.5 rounded hover:bg-black/5"
                    data-testid={`pipeline-cell-add-${task.id}-${day}`}
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add</span>
                  </button>
                  {dayAssignments.map((assignment) => {
                    const person = personMap.get(assignment.personId);
                    if (!person) return null;
                    return (
                      <button
                        key={assignment.id}
                        onClick={() => onAssignmentClick(assignment)}
                        className="w-full text-left rounded px-2 py-1 flex items-center gap-1.5 hover-elevate active-elevate-2 transition-colors"
                        style={{
                          backgroundColor: task.color,
                          border: `1.5px solid ${person.color}`,
                        }}
                        data-testid={`pipeline-assignment-${assignment.id}`}
                      >
                        <span
                          className="flex-shrink-0 w-2 h-2 rounded-full"
                          style={{ backgroundColor: person.color }}
                        />
                        <span className={`font-medium truncate ${isCompactView ? "text-[11px]" : "text-xs"}`}>
                          {assignment.customName || person.name}
                        </span>
                        {assignment.linkedGroupId && (
                          <Link2 className="ml-auto h-3 w-3 flex-shrink-0 opacity-70" aria-label="Part of a linked task group" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </>
        ))}
      </div>
    </div>
      <AddAssignmentDialog
        open={!!selectedCell}
        onClose={() => setSelectedCell(null)}
        weekStartDate={weekStartDate}
        day={selectedCell?.day || "Monday"}
        tasks={tasks}
        people={people}
        initialTaskId={selectedCell?.taskId}
        slackEnabled={slackEnabled}
      />
    </>
  );
}
