import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { type Person, type Task, type Assignment, DAYS, PERIODS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Plus, GripVertical, GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddAssignmentDialog } from "@/components/add-assignment-dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface WeeklyCalendarProps {
  weekStartDate: string;
  assignments: Assignment[];
  people: Person[];
  tasks: Task[];
  onAssignmentClick: (assignment: Assignment) => void;
}

interface CellData {
  personId: string;
  day: string;
  period: string;
}

export function WeeklyCalendar({ weekStartDate, assignments, people, tasks, onAssignmentClick }: WeeklyCalendarProps) {
  const [selectedCell, setSelectedCell] = useState<CellData | null>(null);
  const [draggedAssignment, setDraggedAssignment] = useState<Assignment | null>(null);
  const [dropTargetCell, setDropTargetCell] = useState<CellData | null>(null);
  const [resizingAssignment, setResizingAssignment] = useState<{ id: string; direction: 'left' | 'right' } | null>(null);
  const [resizeStartDay, setResizeStartDay] = useState<string | null>(null);
  const { toast } = useToast();

  const updateAssignmentMutation = useMutation({
    mutationFn: async (data: { assignmentId: string; personId: string; day: string; period: string; endDay?: string }) => {
      const res = await apiRequest("PATCH", `/api/assignments/${data.assignmentId}`, {
        personId: data.personId,
        day: data.day,
        period: data.period,
        endDay: data.endDay,
        weekStartDate,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({
        title: "Task updated",
        description: "Assignment updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update assignment",
        variant: "destructive",
      });
    },
  });

  const getAssignmentsForCell = (personId: string, day: string, period: string) => {
    return assignments.filter(
      a => a.personId === personId && a.day === day && a.period === period
    );
  };

  const hasConflict = (personId: string, day: string, period: string) => {
    const cellAssignments = getAssignmentsForCell(personId, day, period);
    return cellAssignments.length > 1;
  };

  const getTaskById = (taskId: string) => tasks.find(t => t.id === taskId);

  const getDayIndex = (day: string) => DAYS.indexOf(day as any);

  const handleResizeStart = (e: React.MouseEvent, assignmentId: string, direction: 'left' | 'right', currentDay: string) => {
    e.stopPropagation();
    setResizingAssignment({ id: assignmentId, direction });
    setResizeStartDay(currentDay);
  };

  const handleResizeMove = (day: string) => {
    if (!resizingAssignment || !resizeStartDay) return;
    
    const assignment = assignments.find(a => a.id === resizingAssignment.id);
    if (!assignment) return;

    const startIdx = getDayIndex(resizeStartDay);
    const currentIdx = getDayIndex(day);

    if (resizingAssignment.direction === 'right') {
      // Dragging right edge - update endDay
      const newEndDay = day;
      updateAssignmentMutation.mutate({
        assignmentId: assignment.id,
        personId: assignment.personId,
        day: assignment.day,
        period: assignment.period,
        endDay: newEndDay === assignment.day ? undefined : newEndDay,
      });
    } else {
      // Dragging left edge - update day
      const newDay = day;
      const currentEnd = assignment.endDay || assignment.day;
      const currentEndIdx = getDayIndex(currentEnd);
      
      if (getDayIndex(newDay) <= currentEndIdx) {
        updateAssignmentMutation.mutate({
          assignmentId: assignment.id,
          personId: assignment.personId,
          day: newDay,
          period: assignment.period,
          endDay: assignment.endDay,
        });
      }
    }
  };

  return (
    <>
      <div className="border rounded-md overflow-auto bg-card">
        <div className="min-w-max">
          <div className="grid" style={{ gridTemplateColumns: "200px repeat(10, minmax(120px, 1fr))" }}>
            {/* Header Row 1: Person + Day Names */}
            <div className="sticky left-0 z-20 border-b border-r bg-muted/50 p-3">
              <span className="font-semibold text-foreground" data-testid="header-person">Person</span>
            </div>
            
            {DAYS.map((day) => (
              <div 
                key={day} 
                className="border-b col-span-2 text-center bg-muted/50"
              >
                <div className="py-3 px-2">
                  <div className="font-semibold text-foreground" data-testid={`header-day-${day.toLowerCase()}`}>
                    {day}
                  </div>
                </div>
                
                {/* Sub-header for AM/PM */}
                <div className="grid grid-cols-2 border-t">
                  {PERIODS.map(period => (
                    <div
                      key={`${day}-${period}`}
                      className={cn(
                        "py-2 px-2 text-xs font-medium bg-muted/30 text-muted-foreground",
                        period === "PM" && "border-l"
                      )}
                      data-testid={`header-period-${day.toLowerCase()}-${period.toLowerCase()}`}
                    >
                      {period}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Person Rows */}
            {people.map((person, personIndex) => (
              <div key={person.id} className="contents">
                {/* Person Name Cell - Sticky */}
                <div
                  className={cn(
                    "sticky left-0 z-10 border-r border-b p-3 flex items-center gap-2 bg-card",
                    personIndex % 2 === 0 && "bg-muted/20"
                  )}
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

                {/* Day/Period Cells */}
                {DAYS.map(day => (
                  PERIODS.map(period => {
                    const cellAssignments = getAssignmentsForCell(person.id, day, period);
                    const conflict = hasConflict(person.id, day, period);
                    
                    const currentCell = { personId: person.id, day, period };
                    const isDropTarget = dropTargetCell?.personId === person.id && dropTargetCell?.day === day && dropTargetCell?.period === period;

                    return (
                      <div
                        key={`${person.id}-${day}-${period}`}
                        className={cn(
                          "border-b p-2 min-h-24 hover-elevate relative",
                          period === "PM" && "border-l",
                          personIndex % 2 === 0 && "bg-muted/20",
                          conflict && "bg-destructive/10",
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
                          if (draggedAssignment && (draggedAssignment.personId !== person.id || draggedAssignment.day !== day || draggedAssignment.period !== period)) {
                            updateAssignmentMutation.mutate({
                              assignmentId: draggedAssignment.id,
                              personId: person.id,
                              day,
                              period,
                            });
                          }
                          setDropTargetCell(null);
                          setDraggedAssignment(null);
                        }}
                        onMouseMove={() => {
                          if (resizingAssignment) {
                            handleResizeMove(day);
                          }
                        }}
                        onMouseUp={() => {
                          setResizingAssignment(null);
                          setResizeStartDay(null);
                        }}
                        data-testid={`cell-${person.id}-${day.toLowerCase()}-${period.toLowerCase()}`}
                      >
                        {conflict && (
                          <div className="absolute top-1 right-1" title="Multiple assignments in this slot">
                            <div className="w-5 h-5 rounded-full bg-destructive/20 flex items-center justify-center">
                              <span className="text-xs font-bold text-destructive">!</span>
                            </div>
                          </div>
                        )}
                        <div className="space-y-1.5">
                          {cellAssignments.map(assignment => {
                            const task = getTaskById(assignment.taskId);
                            if (!task) return null;

                            return (
                              <div
                                key={assignment.id}
                                className={cn(
                                  "rounded-md p-2 cursor-grab active:cursor-grabbing group relative border-2 hover-elevate active-elevate-2 flex items-start gap-1",
                                  draggedAssignment?.id === assignment.id && "opacity-50"
                                )}
                                style={{ 
                                  backgroundColor: task.color,
                                  borderColor: person.color,
                                }}
                                draggable
                                onDragStart={(e) => {
                                  setDraggedAssignment(assignment);
                                  e.dataTransfer.effectAllowed = "move";
                                }}
                                onDragEnd={() => setDraggedAssignment(null)}
                                onClick={() => onAssignmentClick(assignment)}
                                data-testid={`assignment-${assignment.id}`}
                              >
                                {/* Left resize handle */}
                                <div
                                  className="cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity py-1 px-0.5"
                                  onMouseDown={(e) => handleResizeStart(e, assignment.id, 'left', assignment.day)}
                                  data-testid={`resize-handle-left-${assignment.id}`}
                                  title="Drag to expand left"
                                >
                                  <GripHorizontal className="w-2 h-3" />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <GripVertical className="w-3 h-3 shrink-0 opacity-50 mt-0.5 inline mr-1" />
                                  <div className="text-xs font-medium text-foreground truncate inline">
                                    {task.name}
                                  </div>
                                  {assignment.batchNumber && (
                                    <div className="text-xs font-mono text-foreground/70 mt-0.5">
                                      #{assignment.batchNumber}
                                    </div>
                                  )}
                                </div>

                                {/* Right resize handle */}
                                <div
                                  className="cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity py-1 px-0.5"
                                  onMouseDown={(e) => handleResizeStart(e, assignment.id, 'right', assignment.endDay || assignment.day)}
                                  data-testid={`resize-handle-right-${assignment.id}`}
                                  title="Drag to expand right"
                                >
                                  <GripHorizontal className="w-2 h-3" />
                                </div>
                              </div>
                            );
                          })}

                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-muted-foreground hover:text-foreground"
                            onClick={() => setSelectedCell({ personId: person.id, day, period })}
                            data-testid={`button-add-${person.id}-${day.toLowerCase()}-${period.toLowerCase()}`}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            <span className="text-xs">Add</span>
                          </Button>
                        </div>
                      </div>
                    );
                  })
                ))}
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
        period={selectedCell?.period || ""}
        tasks={tasks}
      />
    </>
  );
}
