import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { type Person, type Task, type Assignment, DAYS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Plus, GripVertical, CheckCircle, ArrowRight, Trash2, AlertCircle, User, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddAssignmentDialog } from "@/components/add-assignment-dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { parse, addDays, format, isToday, isSameDay } from "date-fns";

import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

// Calculate luminance of a color to determine if text should be white or dark
const getLuminance = (hexColor: string): number => {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  
  // Apply gamma correction
  const [rs, gs, bs] = [r, g, b].map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  
  // Calculate relative luminance
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

const isDarkColor = (hexColor: string): boolean => {
  return getLuminance(hexColor) < 0.5;
};

interface WeeklyCalendarProps {
  weekStartDate: string;
  assignments: Assignment[];
  people: Person[];
  tasks: Task[];
  onAssignmentClick: (assignment: Assignment) => void;
  isCompactView?: boolean;
  hidePersonColumn?: boolean;
  showColumnHeader?: boolean;
  showOnlyCurrentPerson?: boolean;
  canToggleCurrentPerson?: boolean;
  onToggleCurrentPerson?: () => void;
}

export function WeeklyCalendar({ 
  weekStartDate, 
  assignments, 
  people, 
  tasks, 
  onAssignmentClick, 
  isCompactView = false,
  hidePersonColumn = false,
  showColumnHeader = true,
  showOnlyCurrentPerson = false,
  canToggleCurrentPerson = true,
  onToggleCurrentPerson,
}: WeeklyCalendarProps) {
  const [selectedCell, setSelectedCell] = useState<CellData | null>(null);
  const [draggedAssignment, setDraggedAssignment] = useState<Assignment | null>(null);
  const [dropTargetCell, setDropTargetCell] = useState<CellData | null>(null);
  const [deleteDragTarget, setDeleteDragTarget] = useState<string | null>(null);
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
      queryClient.invalidateQueries({ predicate: (query) => 
        typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/assignments')
      });
      toast({
        title: "Task moved",
        description: "Assignment updated successfully",
        variant: "default",
      });
    },
    onError: () => {
      toast({
        title: "Failed to move task",
        description: "Could not update the assignment",
        variant: "destructive",
      });
    },
  });

  const reorderAssignmentsMutation = useMutation({
    mutationFn: async (data: { personId: string; day: string; assignmentIds: string[] }) => {
      const res = await apiRequest("POST", `/api/assignments/reorder-cell`, {
        personId: data.personId,
        day: data.day,
        weekStartDate,
        assignmentIds: data.assignmentIds,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/assignments')
      });
    },
    onError: (error) => {
      console.error("Reorder failed:", error);
      toast({
        title: "Failed to reorder tasks",
        description: "Could not save the new task order",
        variant: "destructive",
      });
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
      toast({
        title: "Task deleted",
        description: "Assignment has been removed",
        variant: "default",
      });
    },
    onError: () => {
      toast({
        title: "Failed to delete task",
        description: "Could not remove the assignment",
        variant: "destructive",
      });
    },
  });

  // Pre-group assignments by person+day for O(1) lookup instead of O(A) per cell
  const assignmentsByCell = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const key = `${a.personId}-${a.day}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(a);
    }
    // Sort each cell's assignments by order
    map.forEach((arr: Assignment[]) => {
      arr.sort((x: Assignment, y: Assignment) => ((x as any).order ?? 0) - ((y as any).order ?? 0));
    });
    return map;
  }, [assignments]);

  const getAssignmentsForCell = (personId: string, day: string) => {
    return assignmentsByCell.get(`${personId}-${day}`) || [];
  };

  const getTaskById = (taskId: string) => tasks.find(t => t.id === taskId);

  const getDateForDay = (dayIndex: number) => {
    const startDate = parse(weekStartDate, "yyyy-MM-dd", new Date());
    const dayDate = addDays(startDate, dayIndex);
    return format(dayDate, "MMM d");
  };

  const getDateObjectForDay = (dayIndex: number) => {
    const startDate = parse(weekStartDate, "yyyy-MM-dd", new Date());
    return addDays(startDate, dayIndex);
  };

  const isCurrentDay = (dayIndex: number) => {
    const dayDate = getDateObjectForDay(dayIndex);
    return isToday(dayDate);
  };

  const isCurrentWeek = () => {
    const startDate = parse(weekStartDate, "yyyy-MM-dd", new Date());
    const endDate = addDays(startDate, 4);
    const today = new Date();
    return today >= startDate && today <= endDate;
  };

  const hasAssignmentEveryDay = (personId: string) => {
    return DAYS.every(day => {
      const cellAssignments = getAssignmentsForCell(personId, day);
      return cellAssignments.length > 0;
    });
  };

  const hasAnnualLeave = (personId: string, day: string) => {
    const cellAssignments = getAssignmentsForCell(personId, day);
    return cellAssignments.some(assignment => {
      const task = getTaskById(assignment.taskId);
      return task?.name.includes("Annual Leave");
    });
  };

  const requiredDailyTasks = useMemo(() => {
    return tasks.filter(t => (t as any).requiredDaily === 1);
  }, [tasks]);

  const getMissingRequiredTasks = (day: string) => {
    if (requiredDailyTasks.length === 0) return [];
    const scheduledTaskIds = new Set<string>();
    for (const a of assignments) {
      if (a.day === day) {
        scheduledTaskIds.add(a.taskId);
      }
    }
    return requiredDailyTasks.filter(t => !scheduledTaskIds.has(t.id));
  };

  // Number of columns: 1 for person (when shown) + 5 for days
  const numCols = hidePersonColumn ? 5 : 6;

  return (
    <>
      <div className="border rounded-md bg-card h-full flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full border-collapse min-w-fit" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              {!hidePersonColumn && <col style={{ width: '150px', minWidth: '150px' }} />}
              {DAYS.map((day) => (
                <col key={day} style={{ width: '120px', minWidth: '120px' }} />
              ))}
            </colgroup>
            
            {/* Header Row */}
            {showColumnHeader && (
              <thead>
                <tr>
                  {!hidePersonColumn && (
                    <th className="sticky top-0 left-0 z-50 border-b border-r bg-muted p-2 text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm text-foreground" data-testid="header-person">Person</span>
                        <Button
                          variant={showOnlyCurrentPerson ? "secondary" : "ghost"}
                          size="icon"
                          className="h-6 w-6"
                          onClick={onToggleCurrentPerson}
                          disabled={!canToggleCurrentPerson}
                          aria-label={showOnlyCurrentPerson ? "Show all people" : "Show only my assignments"}
                          title={canToggleCurrentPerson ? (showOnlyCurrentPerson ? "Show all people" : "Show only my assignments") : "Link your person record to your user in Admin to use this filter"}
                          data-testid="button-person-only-toggle"
                        >
                          {showOnlyCurrentPerson ? <UserCheck className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </th>
                  )}
                  {DAYS.map((day, dayIndex) => {
                    const isTodayDay = isCurrentDay(dayIndex);
                    const missingRequired = getMissingRequiredTasks(day);
                    return (
                      <th 
                        key={day} 
                        className={cn(
                          "sticky top-0 z-40 border-b text-center p-2",
                          isTodayDay ? "bg-blue-100 dark:bg-blue-950" : "bg-muted"
                        )}
                        data-testid={`header-day-${day.toLowerCase()}`}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <div className={cn(
                            "font-semibold text-sm",
                            isTodayDay ? "text-blue-900 dark:text-blue-100" : "text-foreground"
                          )}>
                            {day.slice(0, 3)}
                          </div>
                          {missingRequired.length > 0 && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="cursor-help" data-testid={`missing-required-${day.toLowerCase()}`}>
                                    <Info className="w-3.5 h-3.5 text-red-500" />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="p-3 max-w-xs">
                                  <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Unscheduled required tasks</p>
                                  <ul className="space-y-1">
                                    {missingRequired.map(t => (
                                      <li key={t.id} className="flex items-center gap-1.5 text-sm">
                                        <div className="w-2.5 h-2.5 rounded shrink-0" style={{ backgroundColor: t.color }} />
                                        {t.name}
                                      </li>
                                    ))}
                                  </ul>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <div className={cn(
                          "text-xs mt-0.5",
                          isTodayDay ? "text-blue-800 dark:text-blue-200" : "text-muted-foreground"
                        )}>
                          {getDateForDay(dayIndex)}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
            )}

            {/* Person Rows */}
            <tbody>
              {people.map((person, personIndex) => (
                <tr 
                  key={person.id}
                  style={{ minHeight: isCompactView ? undefined : '120px' }}
                >
                  {/* Person Name Cell - Sticky (Drop zone for deletion) */}
                  {!hidePersonColumn && (
                    <td
                      className={cn(
                        "sticky left-0 z-30 border-r border-b p-2 align-middle cursor-pointer min-w-0",
                        personIndex % 2 === 0 ? "bg-muted/50" : "bg-card",
                        deleteDragTarget === person.id && "bg-destructive/10 border-2 border-destructive"
                      )}
                      style={{ minHeight: isCompactView ? undefined : '120px' }}
                      data-testid={`person-row-${person.id}`}
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
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: person.color }}
                          data-testid={`person-indicator-${person.id}`}
                        />
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          <span className="font-medium text-sm text-foreground truncate" data-testid={`person-name-${person.id}`}>
                            {person.name}
                          </span>
                          {assignments.some(a => a.personId === person.id) && (
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                          )}
                        </div>
                      </div>
                    </td>
                  )}

                  {/* Day Cells */}
                  {DAYS.map((day, dayIndex) => {
                    const cellAssignments = getAssignmentsForCell(person.id, day);
                    
                    const currentCell = { personId: person.id, day };
                    const isDropTarget = dropTargetCell?.personId === person.id && dropTargetCell?.day === day;
                    const isTodayDay = isCurrentDay(dayIndex);
                    const isCurrentWeekDisplay = isCurrentWeek();
                    const hasLeave = hasAnnualLeave(person.id, day);

                    return (
                      <td
                        key={`${person.id}-${day}`}
                        className={cn(
                          "border-b border-l hover-elevate relative align-top",
                          isCompactView ? "p-0.5" : "p-1.5",
                          hasLeave ? "bg-red-200/80 dark:bg-red-900/50" :
                          isTodayDay ? "bg-blue-100/50 dark:bg-blue-950/30" : 
                          (isCurrentWeekDisplay && personIndex % 2 === 0) ? "bg-green-100/20 dark:bg-green-950/20" :
                          (isCurrentWeekDisplay && personIndex % 2 !== 0) ? "bg-green-50/20 dark:bg-green-950/10" :
                          personIndex % 2 === 0 && "bg-muted/20",
                          isDropTarget && "bg-primary/10 border-2 border-primary",
                          cellAssignments.length === 0 && !hasLeave && "empty-cell-pattern"
                        )}
                        style={{ minHeight: isCompactView ? undefined : '120px' }}
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
                            if (draggedAssignment.personId !== person.id || draggedAssignment.day !== day) {
                              updateAssignmentMutation.mutate({
                                assignmentId: draggedAssignment.id,
                                personId: person.id,
                                day,
                              });
                            } else {
                              const reorderedIds = cellAssignments.map(a => a.id);
                              const draggedIndex = reorderedIds.indexOf(draggedAssignment.id);
                              if (draggedIndex >= 0) {
                                reorderedIds.splice(draggedIndex, 1);
                                reorderedIds.unshift(draggedAssignment.id);
                                reorderAssignmentsMutation.mutate({
                                  personId: person.id,
                                  day,
                                  assignmentIds: reorderedIds,
                                });
                              }
                            }
                          }
                          setDropTargetCell(null);
                          setDraggedAssignment(null);
                        }}
                        data-testid={`cell-${person.id}-${day.toLowerCase()}`}
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
                                data-testid={`assignment-${assignment.id}`}
                              >
                                <div className={cn("flex items-center", isCompactView ? "gap-0.5" : "gap-1")}>
                                  {!isCompactView && <GripVertical className="w-2.5 h-2.5 shrink-0 opacity-50" />}
                                  <div className="flex-1 min-w-0">
                                    <div className={cn("text-xs font-medium truncate flex items-center justify-between gap-1", isTaskDark ? "text-white" : "text-foreground")}>
                                      <span className="truncate">{assignment.customName || task.name}</span>
                                      {!isCompactView && assignment.notes && (
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <button
                                              type="button"
                                              className={cn(
                                                "relative z-20 inline-flex h-5 w-5 items-center justify-center rounded-full border shadow-sm transition-all",
                                                "hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                                                isTaskDark
                                                  ? "border-white/55 bg-black/35 text-white hover:bg-black/50 focus-visible:ring-white/80 focus-visible:ring-offset-transparent"
                                                  : "border-black/25 bg-white/95 text-foreground hover:bg-white focus-visible:ring-foreground/50 focus-visible:ring-offset-white/40"
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
                              onClick={() => setSelectedCell({ personId: person.id, day })}
                              data-testid={`button-add-${person.id}-${day.toLowerCase()}`}
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              <span className="text-xs">Add</span>
                            </Button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
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
