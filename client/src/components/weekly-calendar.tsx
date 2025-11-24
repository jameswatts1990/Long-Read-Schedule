import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { type Person, type Task, type Assignment, DAYS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Plus, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddAssignmentDialog } from "@/components/add-assignment-dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { parse, addDays, format } from "date-fns";

interface WeeklyCalendarProps {
  weekStartDate: string;
  assignments: Assignment[];
  people: Person[];
  tasks: Task[];
  onAssignmentClick: (assignment: Assignment) => void;
  isCompactView?: boolean;
}

interface CellData {
  personId: string;
  day: string;
}

export function WeeklyCalendar({ weekStartDate, assignments, people, tasks, onAssignmentClick, isCompactView = false }: WeeklyCalendarProps) {
  const [selectedCell, setSelectedCell] = useState<CellData | null>(null);
  const [draggedAssignment, setDraggedAssignment] = useState<Assignment | null>(null);
  const [dropTargetCell, setDropTargetCell] = useState<CellData | null>(null);
  const [isOutsideCalendar, setIsOutsideCalendar] = useState(false);
  const { toast } = useToast();

  const updateAssignmentMutation = useMutation({
    mutationFn: async (data: { assignmentId: string; personId: string; day: string }) => {
      const res = await apiRequest("PATCH", `/api/assignments/${data.assignmentId}`, {
        personId: data.personId,
        day: data.day,
        weekStartDate,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({
        title: "Task moved",
        description: "Assignment updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to move assignment",
        variant: "destructive",
      });
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      return apiRequest("DELETE", `/api/assignments/${assignmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({
        title: "Task deleted",
        description: "Assignment has been removed",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete assignment",
        variant: "destructive",
      });
    },
  });

  const getAssignmentsForCell = (personId: string, day: string) => {
    return assignments.filter(
      a => a.personId === personId && a.day === day
    );
  };

  const getTaskById = (taskId: string) => tasks.find(t => t.id === taskId);

  const getDateForDay = (dayIndex: number) => {
    const startDate = parse(weekStartDate, "yyyy-MM-dd", new Date());
    const dayDate = addDays(startDate, dayIndex);
    return format(dayDate, "MMM d");
  };

  return (
    <>
      <div className="border rounded-md bg-card h-full flex flex-col">
        <div className="overflow-auto flex-1">
          <div
            className="grid"
            style={{ gridTemplateColumns: "200px repeat(5, minmax(180px, 1fr))", minWidth: "max-content" }}
            onDragLeave={(e) => {
              if (e.target === e.currentTarget) {
                setIsOutsideCalendar(true);
              }
            }}
            onDragEnter={() => setIsOutsideCalendar(false)}
          >
            {/* Header Row: Person + Day Names */}
            <div className="sticky top-0 left-0 z-50 border-b border-r bg-muted p-3">
              <span className="font-semibold text-foreground" data-testid="header-person">Person</span>
            </div>
            
            {DAYS.map((day, dayIndex) => (
              <div 
                key={day} 
                className="sticky top-0 z-40 border-b text-center bg-muted p-3"
                data-testid={`header-day-${day.toLowerCase()}`}
              >
                <div className="font-semibold text-foreground">
                  {day}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {getDateForDay(dayIndex)}
                </div>
              </div>
            ))}

            {/* Person Rows */}
            {people.map((person, personIndex) => (
              <div key={person.id} className="contents">
                {/* Person Name Cell - Sticky */}
                <div
                  className={cn(
                    "sticky left-0 z-30 border-r border-b p-3 flex items-center gap-2 bg-card",
                    personIndex % 2 === 0 && "bg-muted"
                  )}
                  style={{ top: "57px" }}
                  data-testid={`person-row-${person.id}`}
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: person.color }}
                    data-testid={`person-indicator-${person.id}`}
                  />
                  <span className="font-medium text-foreground truncate" data-testid={`person-name-${person.id}`}>
                    {person.name}
                  </span>
                </div>

                {/* Day Cells */}
                {DAYS.map(day => {
                  const cellAssignments = getAssignmentsForCell(person.id, day);
                  
                  const currentCell = { personId: person.id, day };
                  const isDropTarget = dropTargetCell?.personId === person.id && dropTargetCell?.day === day;

                  return (
                    <div
                      key={`${person.id}-${day}`}
                      className={cn(
                        "border-b border-l p-2 hover-elevate relative",
                        personIndex % 2 === 0 && "bg-muted/20",
                        isDropTarget && "bg-primary/10 border-2 border-primary"
                      )}
                      onDragOver={(e) => {
                        if (draggedAssignment) {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          setDropTargetCell(currentCell);
                        }
                      }}
                      onDragLeave={() => setDropTargetCell(null)}
                      onDrop={() => {
                        if (draggedAssignment && (draggedAssignment.personId !== person.id || draggedAssignment.day !== day)) {
                          updateAssignmentMutation.mutate({
                            assignmentId: draggedAssignment.id,
                            personId: person.id,
                            day,
                          });
                        }
                        setDropTargetCell(null);
                        setDraggedAssignment(null);
                      }}
                      data-testid={`cell-${person.id}-${day.toLowerCase()}`}
                    >
                      <div className="space-y-1.5">
                        {cellAssignments.map(assignment => {
                          const task = getTaskById(assignment.taskId);
                          if (!task) return null;

                          return (
                            <div
                              key={assignment.id}
                              className={cn(
                                "rounded-md p-2 cursor-grab active:cursor-grabbing group relative border-2 hover-elevate active-elevate-2",
                                draggedAssignment?.id === assignment.id && "opacity-50"
                              )}
                              style={{ 
                                backgroundColor: task.color,
                                borderColor: person.color,
                              }}
                              draggable
                              onDragStart={(e) => {
                                setDraggedAssignment(assignment);
                                setIsOutsideCalendar(false);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={() => {
                                if (isOutsideCalendar && draggedAssignment) {
                                  deleteAssignmentMutation.mutate(draggedAssignment.id);
                                }
                                setDraggedAssignment(null);
                                setIsOutsideCalendar(false);
                              }}
                              onClick={() => onAssignmentClick(assignment)}
                              data-testid={`assignment-${assignment.id}`}
                            >
                              <div className="flex items-start gap-1.5">
                                <GripVertical className="w-3 h-3 shrink-0 opacity-50 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium text-foreground truncate">
                                    {task.name}
                                  </div>
                                  {assignment.batchNumber && (
                                    <div className="text-xs font-mono text-foreground/70 mt-0.5">
                                      #{assignment.batchNumber}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {!isCompactView && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-muted-foreground hover:text-foreground"
                            onClick={() => setSelectedCell({ personId: person.id, day })}
                            data-testid={`button-add-${person.id}-${day.toLowerCase()}`}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            <span className="text-xs">Add</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <AddAssignmentDialog
        open={!!selectedCell}
        onClose={() => setSelectedCell(null)}
        weekStartDate={weekStartDate}
        personId={selectedCell?.personId || ""}
        day={selectedCell?.day || ""}
        tasks={tasks}
      />
    </>
  );
}
