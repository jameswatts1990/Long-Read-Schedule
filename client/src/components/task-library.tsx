import { type Task } from "@shared/schema";
import { ListChecks, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface TaskLibraryProps {
  tasks: Task[];
  filterTask: string | null;
  onFilterChange: (taskId: string | null) => void;
}

export function TaskLibrary({ tasks, filterTask, onFilterChange }: TaskLibraryProps) {
  const handleDragStart = (e: React.DragEvent, task: Task) => {
    e.dataTransfer.setData("taskId", task.id);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Task Library</h2>
      </div>

      {filterTask && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onFilterChange(null)}
          className="w-full"
          data-testid="button-clear-task-filter"
        >
          <Filter className="w-3 h-3" />
          <span>Clear Filter</span>
        </Button>
      )}

      <Separator />

      <div className="space-y-2">
        {tasks.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-tasks">
            No tasks yet. Add one to get started.
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              draggable
              onDragStart={(e) => handleDragStart(e, task)}
              className={`p-3 rounded-md border cursor-move hover-elevate active-elevate-2 ${
                filterTask === task.id ? "bg-accent" : ""
              }`}
              style={{
                backgroundColor: filterTask === task.id ? undefined : `${task.color}20`,
              }}
              onClick={() => onFilterChange(filterTask === task.id ? null : task.id)}
              data-testid={`task-${task.id}`}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-sm shrink-0"
                  style={{ backgroundColor: task.color }}
                  data-testid={`color-swatch-${task.id}`}
                />
                <span className="text-sm font-medium flex-1 truncate" data-testid={`text-task-name-${task.id}`}>
                  {task.name}
                </span>
                {filterTask === task.id && (
                  <Badge variant="secondary" className="text-xs">Filtered</Badge>
                )}
              </div>
              {task.description && (
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2" data-testid={`text-task-description-${task.id}`}>
                  {task.description}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
