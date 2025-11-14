import { useMutation } from "@tanstack/react-query";
import { GripVertical, Copy, Trash2 } from "lucide-react";
import { type Assignment, type Person, type Task, type Day, type Period } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface TimeSlotProps {
  day: Day;
  period: Period;
  assignments: Assignment[];
  people: Person[];
  tasks: Task[];
  activePerson: string | null;
  onAssignmentClick: (assignment: Assignment) => void;
}

export function TimeSlot({ day, period, assignments, people, tasks, activePerson, onAssignmentClick }: TimeSlotProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/assignments/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (assignment: Assignment) => {
      const { id, ...data } = assignment;
      return apiRequest("POST", "/api/assignments", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
    },
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const taskId = e.dataTransfer.getData("taskId");
    
    if (!activePerson) {
      toast({
        title: "No person selected",
        description: "Please select a person from the team panel before assigning tasks.",
        variant: "destructive",
      });
      return;
    }
    
    if (taskId) {
      apiRequest("POST", "/api/assignments", {
        taskId,
        personId: activePerson,
        day,
        period,
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      });
    }
  };

  if (assignments.length === 0) {
    return (
      <div
        className={cn(
          "min-h-32 p-3 border-2 border-dashed rounded-md flex items-center justify-center",
          isDragOver ? "border-primary bg-primary/5" : "border-border/50"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid={`slot-${day.toLowerCase()}-${period.toLowerCase()}`}
      >
        <span className="text-xs text-muted-foreground/40">Drag task here</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "min-h-32 space-y-2",
        isDragOver && "opacity-50"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid={`slot-${day.toLowerCase()}-${period.toLowerCase()}`}
    >
      {assignments.map((assignment) => {
        const person = people.find((p) => p.id === assignment.personId);
        const task = tasks.find((t) => t.id === assignment.taskId);

        if (!person || !task) return null;

        return (
          <div
            key={assignment.id}
            className="group relative p-3 rounded-md border-l-4 hover-elevate active-elevate-2 cursor-pointer"
            style={{
              backgroundColor: `${task.color}33`,
              borderLeftColor: person.color,
            }}
            onClick={() => onAssignmentClick(assignment)}
            data-testid={`assignment-${assignment.id}`}
          >
            <div className="flex items-start gap-2">
              <GripVertical className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" data-testid={`text-task-name-${assignment.id}`}>
                  {task.name}
                </div>
                <div className="text-xs text-muted-foreground truncate" data-testid={`text-person-name-${assignment.id}`}>
                  {person.name}
                </div>
                {assignment.batchNumber && (
                  <div className="text-xs font-mono text-muted-foreground mt-1" data-testid={`text-batch-${assignment.id}`}>
                    Batch: {assignment.batchNumber}
                  </div>
                )}
                {assignment.notes && (
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-1" data-testid={`text-notes-${assignment.id}`}>
                    {assignment.notes}
                  </div>
                )}
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateMutation.mutate(assignment);
                  }}
                  data-testid={`button-duplicate-${assignment.id}`}
                >
                  <Copy className="w-3 h-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMutation.mutate(assignment.id);
                  }}
                  data-testid={`button-delete-${assignment.id}`}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
