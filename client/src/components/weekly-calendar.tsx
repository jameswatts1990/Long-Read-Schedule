import { memo, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { type Person, type Task, type Assignment, DAYS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Plus, GripVertical, CalendarDays, FileText, Hash, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddAssignmentDialog } from "@/components/add-assignment-dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { applyAssignmentDelete, applyAssignmentReorderCell, applyAssignmentUpsert } from "@/lib/assignment-cache";
import { useToast } from "@/hooks/use-toast";
import { parse, addDays, format, isToday, startOfWeek, endOfWeek } from "date-fns";

import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CalendarDayCellProps {
  person: Person;
  day: string;
  dayIndex: number;
  personIndex: number;
  assignments: Assignment[];
  assignmentIdsKey: string;
  isCompactView: boolean;
  draggedAssignment: Assignment | null;
  onAssignmentClick: (assignment: Assignment) => void;
  onAddAssignment: (personId: string, day: string) => void;
  onDropAssignment: (personId: string, day: string, cellAssignmentIds: string[]) => void;
  onDragStartAssignment: (assignment: Assignment) => void;
  onDragEndAssignment: () => void;
  getTaskById: (taskId: string) => Task | undefined;
  getDateForDay: (dayIndex: number) => string;
  getWeekRangeLabel: () => string;
  isCurrentDay: (dayIndex: number) => boolean;
  isCurrentWeekDisplay: boolean;
  hasLeave: boolean;
}

interface CalendarPersonRowProps {
  person: Person;
  personIndex: number;
  isCompactView: boolean;
  hidePersonColumn: boolean;
  draggedAssignment: Assignment | null;
  personHasFullWeekScheduled: boolean;
  getAssignmentsForCell: (personId: string, day: string) => Assignment[];
  getTaskById: (taskId: string) => Task | undefined;
  getDateForDay: (dayIndex: number) => string;
  getWeekRangeLabel: () => string;
  isCurrentDay: (dayIndex: number) => boolean;
  isCurrentWeekDisplay: boolean;
  hasAnnualLeave: (personId: string, day: string) => boolean;
  onAssignmentClick: (assignment: Assignment) => void;
  onAddAssignment: (personId: string, day: string) => void;
  onDropAssignment: (personId: string, day: string, cellAssignmentIds: string[]) => void;
  onDragStartAssignment: (assignment: Assignment) => void;
  onDragEndAssignment: () => void;
  onDropDeleteAssignment: (assignment: Assignment) => void;
}

const CalendarDayCell = memo(function CalendarDayCell({
  person,
  day,
  dayIndex,
  personIndex,
  assignments,
  isCompactView,
  draggedAssignment,
  onAssignmentClick,
  onAddAssignment,
  onDropAssignment,
  onDragStartAssignment,
  onDragEndAssignment,
  getTaskById,
  getDateForDay,
  getWeekRangeLabel,
  isCurrentDay,
  isCurrentWeekDisplay,
  hasLeave,
}: CalendarDayCellProps) {
  const [isDropHover, setIsDropHover] = useState(false);
  const isTodayDay = isCurrentDay(dayIndex);

  useEffect(() => {
    if (!draggedAssignment) {
      setIsDropHover(false);
    }
  }, [draggedAssignment]);

  return (
    <td
      className={cn(
        "border-b border-l hover-elevate relative align-top",
        isCompactView ? "p-0.5" : "p-1.5",
        hasLeave ? "bg-red-200/80 dark:bg-red-900/50" :
        isTodayDay ? "bg-blue-100/50 dark:bg-blue-950/30" :
        (isCurrentWeekDisplay && personIndex % 2 === 0) ? "bg-green-100/20 dark:bg-green-950/20" :
        (isCurrentWeekDisplay && personIndex % 2 !== 0) ? "bg-green-50/20 dark:bg-green-950/10" :
        personIndex % 2 === 0 && "bg-muted/20",
        isDropHover && "bg-primary/10 border-2 border-primary",
        assignments.length === 0 && !hasLeave && "empty-cell-pattern"
      )}
      style={{ minHeight: isCompactView ? undefined : "120px" }}
      onDragOver={(e) => {
        if (draggedAssignment) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!isDropHover) {
            setIsDropHover(true);
          }
        }
      }}
      onDragLeave={() => {
        if (isDropHover) {
          setIsDropHover(false);
        }
      }}
      onDrop={() => {
        onDropAssignment(person.id, day, assignments.map((assignment) => assignment.id));
        setIsDropHover(false);
      }}
      data-testid={`cell-${person.id}-${day.toLowerCase()}`}
    >
      <div className={cn("space-y-1", isCompactView && "space-y-0.5")}>
        {assignments.map((assignment) => {
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
                onDragStartAssignment(assignment);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={onDragEndAssignment}
              onClick={() => onAssignmentClick(assignment)}
              data-testid={`assignment-${assignment.id}`}
            >
              <div className={cn("flex items-center", isCompactView ? "gap-0.5" : "gap-1")}>
                {!isCompactView && <GripVertical className="w-2.5 h-2.5 shrink-0 opacity-50" />}
                <div className="flex-1 min-w-0">
                  <div className={cn("text-xs font-medium truncate flex items-center justify-between gap-1", isTaskDark ? "text-white" : "text-foreground")}>
                    <span className="truncate">{assignment.customName || task.name}</span>
                    {!isCompactView && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "rounded-md border p-1 transition-colors cursor-help",
                                isTaskDark
                                  ? "border-white/30 hover:bg-white/20"
                                  : "border-foreground/15 hover:bg-black/10"
                              )}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`View quick details for ${assignment.customName || task.name}`}
                            >
                              <Info className={cn("h-3.5 w-3.5", isTaskDark ? "text-white/90" : "text-foreground/80")} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="right"
                            align="start"
                            sideOffset={10}
                            className="max-w-sm rounded-xl p-4"
                          >
                            <div className="space-y-3">
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quick overview</p>
                                <p className="text-sm font-semibold leading-tight mt-1">{assignment.customName || task.name}</p>
                              </div>

                              <div className="grid grid-cols-[auto_1fr] items-start gap-x-2 gap-y-2 text-sm">
                                <span className="text-muted-foreground mt-0.5"><User className="h-3.5 w-3.5" /></span>
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Assigned to</p>
                                  <p className="font-medium">{person.name}</p>
                                </div>

                                <span className="text-muted-foreground mt-0.5"><CalendarDays className="h-3.5 w-3.5" /></span>
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Time slot</p>
                                  <p>{day}, {getDateForDay(dayIndex)} <span className="text-muted-foreground">({getWeekRangeLabel()})</span></p>
                                </div>

                                {(assignment.batchNumber || assignment.batchSize) && (
                                  <>
                                    <span className="text-muted-foreground mt-0.5"><Hash className="h-3.5 w-3.5" /></span>
                                    <div>
                                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Batch</p>
                                      <p className="font-mono">{assignment.batchNumber ? `#${assignment.batchNumber}` : "-"} {assignment.batchSize ? `(${assignment.batchSize})` : ""}</p>
                                    </div>
                                  </>
                                )}
                              </div>

                              <div className="rounded-md border bg-muted/30 p-2.5">
                                <div className="flex items-start gap-2">
                                  <FileText className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
                                    <p className="text-sm leading-snug mt-0.5 whitespace-pre-wrap break-words">
                                      {assignment.notes?.trim() || "No notes added for this task yet."}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
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
            onClick={() => onAddAssignment(person.id, day)}
            data-testid={`button-add-${person.id}-${day.toLowerCase()}`}
          >
            <Plus className="w-3 h-3 mr-1" />
            <span className="text-xs">Add</span>
          </Button>
        )}
      </div>
    </td>
  );
}, (prev, next) => (
  prev.person.id === next.person.id
  && prev.day === next.day
  && prev.assignmentIdsKey === next.assignmentIdsKey
  && prev.isCompactView === next.isCompactView
  && prev.draggedAssignment?.id === next.draggedAssignment?.id
  && prev.person.color === next.person.color
  && prev.person.name === next.person.name
  && prev.personIndex === next.personIndex
  && prev.isCurrentWeekDisplay === next.isCurrentWeekDisplay
  && prev.hasLeave === next.hasLeave
));

const CalendarPersonRow = memo(function CalendarPersonRow({
  person,
  personIndex,
  isCompactView,
  hidePersonColumn,
  draggedAssignment,
  personHasFullWeekScheduled,
  getAssignmentsForCell,
  getTaskById,
  getDateForDay,
  getWeekRangeLabel,
  isCurrentDay,
  isCurrentWeekDisplay,
  hasAnnualLeave,
  onAssignmentClick,
  onAddAssignment,
  onDropAssignment,
  onDragStartAssignment,
  onDragEndAssignment,
  onDropDeleteAssignment,
}: CalendarPersonRowProps) {
  const [isDeleteHover, setIsDeleteHover] = useState(false);

  useEffect(() => {
    if (!draggedAssignment) {
      setIsDeleteHover(false);
    }
  }, [draggedAssignment]);

  return (
    <tr style={{ minHeight: isCompactView ? undefined : "120px" }}>
      {!hidePersonColumn && (
        <td
          className={cn(
            "sticky left-0 z-30 border-r border-b p-2 align-middle cursor-pointer min-w-0",
            personIndex % 2 === 0 ? "bg-muted/50" : "bg-card",
            isDeleteHover && "bg-destructive/10 border-2 border-destructive"
          )}
          style={{ minHeight: isCompactView ? undefined : "120px" }}
          data-testid={`person-row-${person.id}`}
          onDragOver={(e) => {
            if (draggedAssignment) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (!isDeleteHover) {
                setIsDeleteHover(true);
              }
            }
          }}
          onDragLeave={() => {
            if (isDeleteHover) {
              setIsDeleteHover(false);
            }
          }}
          onDrop={() => {
            if (draggedAssignment) {
              onDropDeleteAssignment(draggedAssignment);
            }
            setIsDeleteHover(false);
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
              {personHasFullWeekScheduled && (
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              )}
            </div>
          </div>
        </td>
      )}

      {DAYS.map((day, dayIndex) => {
        const cellAssignments = getAssignmentsForCell(person.id, day);
        const assignmentIdsKey = cellAssignments.map((assignment) => assignment.id).join("|");

        return (
          <CalendarDayCell
            key={`${person.id}-${day}`}
            person={person}
            day={day}
            dayIndex={dayIndex}
            personIndex={personIndex}
            assignments={cellAssignments}
            assignmentIdsKey={assignmentIdsKey}
            isCompactView={isCompactView}
            draggedAssignment={draggedAssignment}
            onAssignmentClick={onAssignmentClick}
            onAddAssignment={onAddAssignment}
            onDropAssignment={onDropAssignment}
            onDragStartAssignment={onDragStartAssignment}
            onDragEndAssignment={onDragEndAssignment}
            getTaskById={getTaskById}
            getDateForDay={getDateForDay}
            getWeekRangeLabel={getWeekRangeLabel}
            isCurrentDay={isCurrentDay}
            isCurrentWeekDisplay={isCurrentWeekDisplay}
            hasLeave={hasAnnualLeave(person.id, day)}
          />
        );
      })}
    </tr>
  );
}, (prev, next) => (
  prev.person.id === next.person.id
  && prev.person.name === next.person.name
  && prev.person.color === next.person.color
  && prev.personIndex === next.personIndex
  && prev.isCompactView === next.isCompactView
  && prev.hidePersonColumn === next.hidePersonColumn
  && prev.draggedAssignment?.id === next.draggedAssignment?.id
  && prev.personHasFullWeekScheduled === next.personHasFullWeekScheduled
  && prev.isCurrentWeekDisplay === next.isCurrentWeekDisplay
));

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
}

export function WeeklyCalendar({ 
  weekStartDate, 
  assignments, 
  people, 
  tasks, 
  onAssignmentClick, 
  isCompactView = false,
  hidePersonColumn = false,
  showColumnHeader = true
}: WeeklyCalendarProps) {
  const [selectedCell, setSelectedCell] = useState<CellData | null>(null);
  const [draggedAssignment, setDraggedAssignment] = useState<Assignment | null>(null);
  const { toast } = useToast();
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const updateAssignmentMutation = useMutation({
    mutationFn: async (data: { assignmentId: string; personId: string; day: string }) => {
      const res = await apiRequest("PATCH", `/api/assignments/${data.assignmentId}`, {
        personId: data.personId,
        day: data.day,
        weekStartDate,
      });
      return res.json();
    },
    onSuccess: (updatedAssignment: Assignment) => {
      const previousWeekStartDate = draggedAssignment?.weekStartDate;
      applyAssignmentUpsert(queryClient, updatedAssignment, previousWeekStartDate);
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
    onSuccess: (_result, variables) => {
      applyAssignmentReorderCell(queryClient, {
        weekStartDate,
        personId: variables.personId,
        day: variables.day,
        assignmentIds: variables.assignmentIds,
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
    mutationFn: async (assignment: Assignment) => {
      return apiRequest("DELETE", `/api/assignments/${assignment.id}`);
    },
    onSuccess: (_data, deletedAssignment) => {
      applyAssignmentDelete(queryClient, deletedAssignment.id, deletedAssignment.weekStartDate);
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

  const scheduleIndexes = useMemo(() => {
    const assignmentsByCell = new Map<string, Assignment[]>();
    const taskIdsByDay = new Map<string, Set<string>>();
    const daysByPerson = new Map<string, Set<string>>();
    const annualLeaveByCell = new Map<string, boolean>();
    for (const assignment of assignments) {
      const cellKey = `${assignment.personId}-${assignment.day}`;
      const cellAssignments = assignmentsByCell.get(cellKey);
      if (cellAssignments) {
        cellAssignments.push(assignment);
      } else {
        assignmentsByCell.set(cellKey, [assignment]);
      }

      const taskIdsForDay = taskIdsByDay.get(assignment.day);
      if (taskIdsForDay) {
        taskIdsForDay.add(assignment.taskId);
      } else {
        taskIdsByDay.set(assignment.day, new Set([assignment.taskId]));
      }

      const personDays = daysByPerson.get(assignment.personId);
      if (personDays) {
        personDays.add(assignment.day);
      } else {
        daysByPerson.set(assignment.personId, new Set([assignment.day]));
      }

      if (!annualLeaveByCell.get(cellKey)) {
        const task = tasksById.get(assignment.taskId);
        if (task?.name.includes("Annual Leave")) {
          annualLeaveByCell.set(cellKey, true);
        }
      }
    }

    assignmentsByCell.forEach((cellAssignments) => {
      cellAssignments.sort((x: Assignment, y: Assignment) => ((x as any).order ?? 0) - ((y as any).order ?? 0));
    });

    const requiredDailyTasks = tasks.filter((task) => (task as any).requiredDaily === 1);
    const missingRequiredTasksByDay = new Map<string, Task[]>();

    for (const day of DAYS) {
      const scheduledTaskIds = taskIdsByDay.get(day) ?? new Set<string>();
      missingRequiredTasksByDay.set(
        day,
        requiredDailyTasks.filter((task) => !scheduledTaskIds.has(task.id))
      );
    }

    return {
      assignmentsByCell,
      taskIdsByDay,
      daysByPerson,
      annualLeaveByCell,
      requiredDailyTasks,
      missingRequiredTasksByDay,
    };
  }, [assignments, tasks, tasksById]);

  const getAssignmentsForCell = (personId: string, day: string) => {
    return scheduleIndexes.assignmentsByCell.get(`${personId}-${day}`) || [];
  };

  const getTaskById = (taskId: string) => tasksById.get(taskId);

  const personHasFullWeekScheduled = useMemo(() => {
    return people.reduce<Record<string, boolean>>((acc, person) => {
      const scheduledDays = scheduleIndexes.daysByPerson.get(person.id);
      acc[person.id] = DAYS.every((day) => scheduledDays?.has(day));
      return acc;
    }, {});
  }, [people, scheduleIndexes.daysByPerson]);

  const getDateForDay = (dayIndex: number) => {
    const startDate = parse(weekStartDate, "yyyy-MM-dd", new Date());
    const dayDate = addDays(startDate, dayIndex);
    return format(dayDate, "MMM d");
  };

  const getWeekRangeLabel = () => {
    const startDate = startOfWeek(parse(weekStartDate, "yyyy-MM-dd", new Date()), { weekStartsOn: 1 });
    const endDate = endOfWeek(startDate, { weekStartsOn: 1 });

    if (format(startDate, "MMM") === format(endDate, "MMM")) {
      return `${format(startDate, "MMM d")}–${format(endDate, "d")}`;
    }

    return `${format(startDate, "MMM d")}–${format(endDate, "MMM d")}`;
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

  const hasAnnualLeave = (personId: string, day: string) => {
    return scheduleIndexes.annualLeaveByCell.get(`${personId}-${day}`) ?? false;
  };

  const getMissingRequiredTasks = (day: string) => {
    if (scheduleIndexes.requiredDailyTasks.length === 0) return [];
    return scheduleIndexes.missingRequiredTasksByDay.get(day) ?? [];
  };

  // Number of columns: 1 for person (when shown) + 5 for days
  const numCols = hidePersonColumn ? 5 : 6;
  const isCurrentWeekDisplay = isCurrentWeek();

  const handleDropAssignment = (personId: string, day: string, cellAssignmentIds: string[]) => {
    if (!draggedAssignment) return;

    if (draggedAssignment.personId !== personId || draggedAssignment.day !== day) {
      updateAssignmentMutation.mutate({
        assignmentId: draggedAssignment.id,
        personId,
        day,
      });
    } else {
      const reorderedIds = [...cellAssignmentIds];
      const draggedIndex = reorderedIds.indexOf(draggedAssignment.id);
      if (draggedIndex >= 0) {
        reorderedIds.splice(draggedIndex, 1);
        reorderedIds.unshift(draggedAssignment.id);
        reorderAssignmentsMutation.mutate({
          personId,
          day,
          assignmentIds: reorderedIds,
        });
      }
    }

    setDraggedAssignment(null);
  };

  const handleDropDeleteAssignment = (assignment: Assignment) => {
    deleteAssignmentMutation.mutate(assignment);
    setDraggedAssignment(null);
  };

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
                      <span className="font-semibold text-sm text-foreground" data-testid="header-person">Person</span>
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
                <CalendarPersonRow
                  key={person.id}
                  person={person}
                  personIndex={personIndex}
                  isCompactView={isCompactView}
                  hidePersonColumn={hidePersonColumn}
                  draggedAssignment={draggedAssignment}
                  personHasFullWeekScheduled={personHasFullWeekScheduled[person.id]}
                  getAssignmentsForCell={getAssignmentsForCell}
                  getTaskById={getTaskById}
                  getDateForDay={getDateForDay}
                  getWeekRangeLabel={getWeekRangeLabel}
                  isCurrentDay={isCurrentDay}
                  isCurrentWeekDisplay={isCurrentWeekDisplay}
                  hasAnnualLeave={hasAnnualLeave}
                  onAssignmentClick={onAssignmentClick}
                  onAddAssignment={(personId, day) => setSelectedCell({ personId, day })}
                  onDropAssignment={handleDropAssignment}
                  onDragStartAssignment={setDraggedAssignment}
                  onDragEndAssignment={() => setDraggedAssignment(null)}
                  onDropDeleteAssignment={handleDropDeleteAssignment}
                />
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
