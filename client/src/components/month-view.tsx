import { useMutation } from "@tanstack/react-query";
import { type Person, type Task, type Assignment, DAYS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Plus, GripVertical, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AddAssignmentDialog } from "@/components/add-assignment-dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { parse, addDays, format, isToday } from "date-fns";

interface MonthViewProps {
  weeksInMonth: Date[];
  weekAssignments: Assignment[];
  people: Person[];
  tasks: Task[];
  onAssignmentClick: (assignment: Assignment) => void;
  isCompactView?: boolean;
  formatDate: (date: Date) => string;
}

interface CellData {
  personId: string;
  day: string;
  weekStartDate: string;
}

const getLuminance = (hexColor: string): number => {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const [rs, gs, bs] = [r, g, b].map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

const isDarkColor = (hexColor: string): boolean => getLuminance(hexColor) < 0.5;

export function MonthView({ 
  weeksInMonth, 
  weekAssignments, 
  people, 
  tasks, 
  onAssignmentClick, 
  isCompactView = false,
  formatDate: formatDateFn
}: MonthViewProps) {
  const [selectedCell, setSelectedCell] = useState<CellData | null>(null);
  const [draggedAssignment, setDraggedAssignment] = useState<Assignment | null>(null);
  const [dropTargetCell, setDropTargetCell] = useState<CellData | null>(null);
  const [deleteDragTarget, setDeleteDragTarget] = useState<string | null>(null);
  const { toast } = useToast();

  const updateAssignmentMutation = useMutation({
    mutationFn: async (data: { assignmentId: string; personId: string; day: string; weekStartDate: string }) => {
      const res = await apiRequest("PATCH", `/api/assignments/${data.assignmentId}`, {
        personId: data.personId,
        day: data.day,
        weekStartDate: data.weekStartDate,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/assignments')
      });
      toast({ title: "Task moved", description: "Assignment updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to move task", description: "Could not update the assignment", variant: "destructive" });
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      return apiRequest("DELETE", `/api/assignments/${assignmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/assignments')
      });
      toast({ title: "Task deleted", description: "Assignment has been removed" });
    },
    onError: () => {
      toast({ title: "Failed to delete task", description: "Could not remove the assignment", variant: "destructive" });
    },
  });

  const assignmentsByCell = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of weekAssignments) {
      const key = `${a.weekStartDate}-${a.personId}-${a.day}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    map.forEach(arr => arr.sort((x, y) => ((x as any).order ?? 0) - ((y as any).order ?? 0)));
    return map;
  }, [weekAssignments]);

  const getAssignmentsForCell = (weekStartDate: string, personId: string, day: string) => {
    return assignmentsByCell.get(`${weekStartDate}-${personId}-${day}`) || [];
  };

  const getTaskById = (taskId: string) => tasks.find(t => t.id === taskId);

  const getDateForDay = (weekStartDate: string, dayIndex: number) => {
    const startDate = parse(weekStartDate, "yyyy-MM-dd", new Date());
    const dayDate = addDays(startDate, dayIndex);
    return format(dayDate, "MMM d");
  };

  const isDayToday = (weekStartDate: string, dayIndex: number) => {
    const startDate = parse(weekStartDate, "yyyy-MM-dd", new Date());
    return isToday(addDays(startDate, dayIndex));
  };

  const totalColumns = weeksInMonth.length * 5;

  return (
    <>
      <div className="border rounded-md bg-card h-full overflow-auto relative">
        <div 
          className="grid relative"
          style={{ 
            gridTemplateColumns: `200px repeat(${totalColumns}, minmax(140px, 1fr))`,
            width: "max-content"
          }}
        >
          {/* Header Row */}
          <div 
            className="sticky top-0 left-0 z-50 border-b border-r bg-muted p-2 flex items-center shadow-[2px_2px_0_0_hsl(var(--muted))]"
            style={{ width: '200px', left: 0 }}
          >
            <span className="font-semibold text-sm text-foreground">Person</span>
          </div>
          
          {weeksInMonth.map((weekStart) => {
            const weekStr = formatDateFn(weekStart);
            return DAYS.map((day, dayIndex) => {
              const isTodayDay = isDayToday(weekStr, dayIndex);
              return (
                <div 
                  key={`${weekStr}-${day}`}
                  className={cn(
                    "sticky top-0 z-40 border-b text-center p-2",
                    isTodayDay ? "bg-blue-100 dark:bg-blue-950" : "bg-muted",
                    dayIndex === 0 && "border-l-2 border-l-border"
                  )}
                >
                  <div className={cn(
                    "font-semibold text-sm",
                    isTodayDay ? "text-blue-900 dark:text-blue-100" : "text-foreground"
                  )}>
                    {day.slice(0, 3)}
                  </div>
                  <div className={cn(
                    "text-xs mt-0.5",
                    isTodayDay ? "text-blue-800 dark:text-blue-200" : "text-muted-foreground"
                  )}>
                    {getDateForDay(weekStr, dayIndex)}
                  </div>
                </div>
              );
            });
          })}

          {/* Person Rows */}
          {people.map((person, personIndex) => (
            <div key={`person-row-${person.id}`} className="contents">
              {/* Person Name Cell */}
              <div
                className={cn(
                  "sticky left-0 z-30 border-r border-b p-2 flex items-center gap-1.5 min-w-[200px] h-full",
                  personIndex % 2 === 0 ? "bg-muted shadow-[2px_0_0_0_hsl(var(--muted))]" : "bg-card shadow-[2px_0_0_0_hsl(var(--card))]",
                  deleteDragTarget === person.id && "bg-destructive/10 border-2 border-destructive"
                )}
                style={{ width: '200px', left: 0 }}
                onDragOver={(e) => {
                  if (draggedAssignment) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDeleteDragTarget(person.id);
                  }
                }}
                onDragLeave={() => setDeleteDragTarget(null)}
                onDrop={() => {
                  if (draggedAssignment) {
                    deleteAssignmentMutation.mutate(draggedAssignment.id);
                  }
                  setDeleteDragTarget(null);
                  setDraggedAssignment(null);
                }}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: person.color }}
                />
                <span className="font-medium text-sm text-foreground truncate">
                  {person.name}
                </span>
              </div>

              {/* Day Cells for each week */}
              {weeksInMonth.map((weekStart) => {
                const weekStr = formatDateFn(weekStart);
                return DAYS.map((day, dayIndex) => {
                  const cellAssignments = getAssignmentsForCell(weekStr, person.id, day);
                  const isTodayDay = isDayToday(weekStr, dayIndex);
                  const currentCell = { personId: person.id, day, weekStartDate: weekStr };
                  const isDropTarget = dropTargetCell?.personId === person.id && 
                                       dropTargetCell?.day === day && 
                                       dropTargetCell?.weekStartDate === weekStr;

                  return (
                    <div
                      key={`${weekStr}-${person.id}-${day}`}
                      className={cn(
                        "border-b hover-elevate relative",
                        isCompactView ? "p-0.5" : "p-1.5 min-h-[100px]",
                        isTodayDay ? "bg-blue-100/50 dark:bg-blue-950/30" : 
                        personIndex % 2 === 0 ? "bg-muted/20" : "",
                        isDropTarget && "bg-primary/10 border-2 border-primary",
                        dayIndex === 0 && "border-l-2 border-l-border",
                        cellAssignments.length === 0 && "empty-cell-pattern"
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
                        if (draggedAssignment) {
                          updateAssignmentMutation.mutate({
                            assignmentId: draggedAssignment.id,
                            personId: person.id,
                            day,
                            weekStartDate: weekStr,
                          });
                        }
                        setDropTargetCell(null);
                        setDraggedAssignment(null);
                      }}
                    >
                      <div className={cn("space-y-1", isCompactView && "space-y-0.5")}>
                        {cellAssignments.map(assignment => {
                          const task = getTaskById(assignment.taskId);
                          if (!task) return null;
                          const isTaskDark = isDarkColor(task.color);

                          return (
                            <div
                              key={assignment.id}
                              className={cn(
                                "rounded-md cursor-grab active:cursor-grabbing group relative border hover-elevate active-elevate-2",
                                isCompactView ? "px-1 py-0.5" : "p-1 min-h-6",
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
                              onDragEnd={() => {
                                setDraggedAssignment(null);
                                setDeleteDragTarget(null);
                              }}
                              onClick={() => onAssignmentClick(assignment)}
                            >
                              <div className={cn("flex items-center", isCompactView ? "gap-0.5" : "gap-1")}>
                                {!isCompactView && <GripVertical className="w-2.5 h-2.5 shrink-0 opacity-50" />}
                                <div className="flex-1 min-w-0">
                                  <div className={cn("text-xs font-medium flex items-start justify-between gap-1", isTaskDark ? "text-white" : "text-foreground")}>
                                    <span className="min-w-0 flex-1 truncate leading-tight">{assignment.customName || task.name}</span>
                                    {!isCompactView && assignment.notes && (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button
                                            type="button"
                                            className={cn(
                                              "relative z-20 mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border shadow-sm backdrop-blur-[2px] transition-all duration-150",
                                              "hover:-translate-y-px hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                                              isTaskDark
                                                ? "border-white/45 bg-black/25 text-white/95 hover:border-white/70 hover:bg-black/45 focus-visible:ring-white/80 focus-visible:ring-offset-transparent"
                                                : "border-black/15 bg-white/80 text-foreground/80 hover:border-black/25 hover:bg-white focus-visible:ring-foreground/40 focus-visible:ring-offset-white/50"
                                            )}
                                            onClick={(event) => event.stopPropagation()}
                                            onPointerDown={(event) => event.stopPropagation()}
                                            aria-label="View assignment notes"
                                          >
                                            <Info className="h-3.5 w-3.5 stroke-[2.6]" />
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent
                                          className="z-[70] w-72 p-3"
                                          align="end"
                                          onClick={(event) => event.stopPropagation()}
                                        >
                                          <div className="space-y-1">
                                            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Notes</p>
                                            <p className="text-sm leading-relaxed">{assignment.notes}</p>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    )}
                                  </div>
                                  {!isCompactView && (assignment.batchNumber || assignment.batchSize) && (
                                    <div className={cn("text-xs font-mono mt-0.5 flex gap-1", isTaskDark ? "text-white/80" : "text-foreground/70")}>
                                      {assignment.batchNumber && <span>#{assignment.batchNumber}</span>}
                                      {assignment.batchSize && <span>({assignment.batchSize})</span>}
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
                            className="w-full justify-start text-muted-foreground hover:text-foreground h-auto py-1 px-1"
                            onClick={() => setSelectedCell({ personId: person.id, day, weekStartDate: weekStr })}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            <span className="text-xs">Add</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                });
              })}
            </div>
          ))}
        </div>
      </div>

      <AddAssignmentDialog
        open={!!selectedCell}
        onClose={() => setSelectedCell(null)}
        weekStartDate={selectedCell?.weekStartDate || ""}
        personId={selectedCell?.personId || ""}
        day={selectedCell?.day || ""}
        tasks={tasks}
        isMonthMode={true}
      />
    </>
  );
}
