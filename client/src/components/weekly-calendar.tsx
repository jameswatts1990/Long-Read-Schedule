import { useState, useMemo, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type Person, type Task, type Assignment, DAYS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Plus, GripVertical, CheckCircle, ArrowRight, Trash2, AlertCircle, User, UserCheck, Copy, MoreHorizontal, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddAssignmentDialog } from "@/components/add-assignment-dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { parse, addDays, format, isToday, isSameDay } from "date-fns";

import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

// Day column color configuration (Mon=0 through Fri=4)
const DAY_HEADER_COLORS = [
  "bg-red-200 dark:bg-red-900",
  "bg-gradient-to-b from-yellow-200 to-orange-200 dark:from-yellow-900 dark:to-orange-900",
  "bg-green-200 dark:bg-green-900",
  "bg-blue-200 dark:bg-blue-900",
  "bg-gradient-to-b from-purple-200 to-pink-200 dark:from-purple-900 dark:to-pink-900",
];

const DAY_HEADER_TODAY_COLORS = [
  "bg-red-300 dark:bg-red-800",
  "bg-gradient-to-b from-yellow-300 to-orange-300 dark:from-yellow-800 dark:to-orange-800",
  "bg-green-300 dark:bg-green-800",
  "bg-blue-300 dark:bg-blue-800",
  "bg-gradient-to-b from-purple-300 to-pink-300 dark:from-purple-800 dark:to-pink-800",
];

const DAY_HEADER_TEXT_COLORS = [
  "text-red-900 dark:text-red-100",
  "text-amber-900 dark:text-amber-100",
  "text-green-900 dark:text-green-100",
  "text-blue-900 dark:text-blue-100",
  "text-purple-900 dark:text-purple-100",
];

const DAY_HEADER_DATE_COLORS = [
  "text-red-800 dark:text-red-200",
  "text-amber-800 dark:text-amber-200",
  "text-green-800 dark:text-green-200",
  "text-blue-800 dark:text-blue-200",
  "text-purple-800 dark:text-purple-200",
];

const DAY_CELL_COLORS = [
  "bg-red-50/60 dark:bg-red-950/20",
  "bg-gradient-to-b from-yellow-50/60 to-orange-50/60 dark:from-yellow-950/20 dark:to-orange-950/20",
  "bg-green-50/60 dark:bg-green-950/20",
  "bg-blue-50/60 dark:bg-blue-950/20",
  "bg-gradient-to-b from-purple-50/60 to-pink-50/60 dark:from-purple-950/20 dark:to-pink-950/20",
];

const DAY_CELL_TODAY_COLORS = [
  "bg-red-100/70 dark:bg-red-900/30",
  "bg-gradient-to-b from-yellow-100/70 to-orange-100/70 dark:from-yellow-900/30 dark:to-orange-900/30",
  "bg-green-100/70 dark:bg-green-900/30",
  "bg-blue-100/70 dark:bg-blue-900/30",
  "bg-gradient-to-b from-purple-100/70 to-pink-100/70 dark:from-purple-900/30 dark:to-pink-900/30",
];

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
  onTrainedFilterChange?: (taskName: string | null) => void;
  slackEnabled?: boolean;
  rainbowMode?: boolean;
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
  onTrainedFilterChange,
  slackEnabled = false,
  rainbowMode = true,
}: WeeklyCalendarProps) {
  const [selectedCell, setSelectedCell] = useState<CellData | null>(null);
  const [draggedAssignment, setDraggedAssignment] = useState<Assignment | null>(null);
  const [draggedAssignmentIds, setDraggedAssignmentIds] = useState<string[]>([]);
  const [dropTargetCell, setDropTargetCell] = useState<CellData | null>(null);
  const [deleteDragTarget, setDeleteDragTarget] = useState<string | null>(null);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<Set<string>>(new Set());
  const [clipboardAssignments, setClipboardAssignments] = useState<Assignment[]>([]);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [trainedTaskId, setTrainedTaskId] = useState<string | null>(null);
  const { data: trainedPersonIds = [] } = useQuery<string[]>({
    queryKey: [`/api/assignments/trained-persons?taskId=${trainedTaskId}`],
    enabled: trainedTaskId !== null,
  });

  useEffect(() => {
    if (!onTrainedFilterChange) return;
    if (trainedTaskId === null) {
      onTrainedFilterChange(null);
    } else {
      const task = tasks.find((t) => t.id === trainedTaskId);
      onTrainedFilterChange(task?.name ?? null);
    }
  }, [trainedTaskId, tasks, onTrainedFilterChange]);

  const pasteTargetCellRef = useRef<CellData | null>(null);
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
        variant: "success",
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

  const clearSelection = () => {
    setSelectedAssignmentIds(new Set());
  };

  const deleteAssignments = async (assignmentIds: string[]) => {
    const idsToDelete = Array.from(new Set(assignmentIds));
    if (idsToDelete.length === 0) return;

    try {
      await Promise.all(idsToDelete.map((assignmentId) => apiRequest("DELETE", `/api/assignments/${assignmentId}`)));
      await queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/assignments"),
      });
      toast({
        title: idsToDelete.length > 1 ? "Tasks deleted" : "Task deleted",
        description:
          idsToDelete.length > 1
            ? `${idsToDelete.length} assignments have been removed`
            : "Assignment has been removed",
        variant: "destructive",
        icon: <Trash2 className="h-4 w-4 shrink-0 mt-0.5" />,
      });
      clearSelection();
    } catch {
      toast({
        title: "Failed to delete tasks",
        description: "Could not remove one or more assignments",
        variant: "destructive",
      });
    }
  };

  const deleteAssignmentSeries = async (seriesId: string) => {
    try {
      const res = await apiRequest("DELETE", `/api/assignments/series/${seriesId}`);
      const { deletedCount } = await res.json();
      await queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/assignments"),
      });
      toast({
        title: "Series deleted",
        description: `${deletedCount} recurring assignment${deletedCount !== 1 ? "s" : ""} removed`,
        variant: "destructive",
        icon: <Trash2 className="h-4 w-4 shrink-0 mt-0.5" />,
      });
    } catch {
      toast({
        title: "Failed to delete series",
        description: "Could not remove the recurring series",
        variant: "destructive",
      });
    }
  };

  const handleCopy = (toCopy: Assignment[]) => {
    setClipboardAssignments(toCopy);
    toast({
      title: `${toCopy.length} assignment${toCopy.length !== 1 ? "s" : ""} copied`,
      icon: <Copy className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />,
    });
  };

  const handlePaste = async (targetCell: CellData) => {
    const dayIndex = DAYS.indexOf(targetCell.day as typeof DAYS[number]);
    const targetDate = format(
      addDays(parse(weekStartDate, "yyyy-MM-dd", new Date()), dayIndex),
      "yyyy-MM-dd"
    );
    const items = clipboardAssignments.map((a) => ({
      taskId: a.taskId,
      personId: targetCell.personId,
      day: targetCell.day,
      weekStartDate,
      batchNumber: a.batchNumber,
      batchSize: a.batchSize,
      notes: a.notes,
      customName: a.customName,
      customColor: (a as any).customColor ?? null,
      date: targetDate,
    }));
    try {
      if (items.length === 1) {
        await apiRequest("POST", "/api/assignments", items[0]);
      } else {
        await apiRequest("POST", "/api/assignments/bulk", items);
      }
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" &&
          query.queryKey[0].startsWith("/api/assignments"),
      });
    } catch {
      toast({ title: "Failed to paste", variant: "destructive" });
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isTypingElement =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement?.getAttribute("contenteditable") === "true";

      // Escape — clear task highlight and trained filter
      if (event.key === "Escape") {
        setHighlightedTaskId(null);
        setTrainedTaskId(null);
        return;
      }

      // Ctrl/Cmd + C — copy selected assignments
      if ((event.ctrlKey || event.metaKey) && event.key === "c") {
        if (selectedAssignmentIds.size === 0 || isTypingElement) return;
        event.preventDefault();
        handleCopy(assignments.filter((a) => selectedAssignmentIds.has(a.id)));
        return;
      }

      // Ctrl/Cmd + V — paste to last right-clicked cell
      if ((event.ctrlKey || event.metaKey) && event.key === "v") {
        if (clipboardAssignments.length === 0 || isTypingElement) return;
        event.preventDefault();
        const target = pasteTargetCellRef.current;
        if (target) {
          void handlePaste(target);
        } else {
          toast({ title: "Right-click a cell to paste", icon: <CheckCircle className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" /> });
        }
        return;
      }

      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (selectedAssignmentIds.size === 0 || isTypingElement) return;

      event.preventDefault();
      void deleteAssignments(Array.from(selectedAssignmentIds));
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedAssignmentIds, clipboardAssignments]);

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
                          rainbowMode
                            ? (isTodayDay ? DAY_HEADER_TODAY_COLORS[dayIndex] : DAY_HEADER_COLORS[dayIndex])
                            : (isTodayDay ? "bg-blue-100 dark:bg-blue-950" : "bg-muted")
                        )}
                        data-testid={`header-day-${day.toLowerCase()}`}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <div className={cn(
                            "font-semibold text-sm",
                            rainbowMode
                              ? DAY_HEADER_TEXT_COLORS[dayIndex]
                              : (isTodayDay ? "text-blue-900 dark:text-blue-100" : "text-foreground")
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
                          rainbowMode
                            ? DAY_HEADER_DATE_COLORS[dayIndex]
                            : (isTodayDay ? "text-blue-800 dark:text-blue-200" : "text-muted-foreground")
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
              {(trainedTaskId ? people.filter(p => trainedPersonIds.includes(p.id)) : people).map((person, personIndex) => (
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
                        const assignmentsToDelete = draggedAssignmentIds.length > 0
                          ? draggedAssignmentIds
                          : draggedAssignment
                            ? [draggedAssignment.id]
                            : [];
                        if (assignmentsToDelete.length > 0) {
                          void deleteAssignments(assignmentsToDelete);
                        }
                        setDeleteDragTarget(null);
                        setDraggedAssignment(null);
                        setDraggedAssignmentIds([]);
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: person.color }}
                          data-testid={`person-indicator-${person.id}`}
                        />
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-sm text-foreground truncate" data-testid={`person-name-${person.id}`}>
                              {person.name}
                            </span>
                            {hasAssignmentEveryDay(person.id) && (
                              <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                            )}
                          </div>
                          {draggedAssignment && (
                            <span className="text-[9px] text-destructive/70 font-medium leading-none">Drop here to delete</span>
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
                    const hasLeave = hasAnnualLeave(person.id, day);

                    return (
                      <td
                        key={`${person.id}-${day}`}
                        className={cn(
                          "border-b border-l hover-elevate relative align-top",
                          isCompactView ? "p-0" : "p-1.5",
                          hasLeave ? "bg-red-200/80 dark:bg-red-900/50" :
                          rainbowMode
                            ? (isTodayDay ? DAY_CELL_TODAY_COLORS[dayIndex] : DAY_CELL_COLORS[dayIndex])
                            : isTodayDay ? "bg-blue-100/50 dark:bg-blue-950/30"
                            : (isCurrentWeek() && personIndex % 2 === 0) ? "bg-green-100/20 dark:bg-green-950/20"
                            : (isCurrentWeek() && personIndex % 2 !== 0) ? "bg-green-50/20 dark:bg-green-950/10"
                            : personIndex % 2 === 0 ? "bg-muted/20" : undefined,
                          isDropTarget && "bg-primary/10 border-2 border-primary",
                          cellAssignments.length === 0 && !hasLeave && "empty-cell-pattern"
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
                            if (draggedAssignmentIds.length > 1) {
                              toast({
                                title: "Multiple tasks selected",
                                description: "Drag selected tasks to a person name to delete them together",
                                variant: "warning",
                              });
                              setDropTargetCell(null);
                              setDraggedAssignment(null);
                              setDraggedAssignmentIds([]);
                              return;
                            }
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
                          setDraggedAssignmentIds([]);
                        }}
                        data-testid={`cell-${person.id}-${day.toLowerCase()}`}
                      >
                        <ContextMenu
                          onOpenChange={(open) => {
                            if (open) pasteTargetCellRef.current = currentCell;
                          }}
                        >
                          <ContextMenuTrigger asChild>
                            <div
                              className={cn("h-full w-full", isCompactView ? "space-y-0" : "space-y-1")}
                              style={{ minHeight: isCompactView ? undefined : "120px" }}
                            >
                          {cellAssignments.map(assignment => {
                            const task = getTaskById(assignment.taskId);
                            if (!task) return null;
                            
                            const isTaskDark = isDarkColor((assignment as any).customColor ?? task.color);

                            return (
                              <ContextMenu key={assignment.id}>
                                <ContextMenuTrigger asChild>
                                  <div
                                    className={cn(
                                      "cursor-grab active:cursor-grabbing group relative transition-opacity duration-150",
                                      isCompactView
                                        ? "px-1 py-px"
                                        : "rounded-md border hover-elevate active-elevate-2 p-1 min-h-6",
                                      draggedAssignment?.id === assignment.id && "opacity-50",
                                      highlightedTaskId && task.id !== highlightedTaskId && "opacity-20",
                                      selectedAssignmentIds.has(assignment.id) && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                                    )}
                                    style={{
                                      backgroundColor: (assignment as any).customColor ?? task.color,
                                      ...(isCompactView ? {} : { borderColor: person.color }),
                                    }}
                                    draggable
                                    onDragStart={(e) => {
                                      setDraggedAssignment(assignment);
                                      const assignmentIdsToDrag = selectedAssignmentIds.has(assignment.id)
                                        ? Array.from(selectedAssignmentIds)
                                        : [assignment.id];
                                      setDraggedAssignmentIds(assignmentIdsToDrag);
                                      e.dataTransfer.effectAllowed = "move";
                                    }}
                                    onDragEnd={() => {
                                      setDraggedAssignment(null);
                                      setDraggedAssignmentIds([]);
                                      setDeleteDragTarget(null);
                                    }}
                                    onClick={(event) => {
                                      const isMultiSelect = event.ctrlKey || event.metaKey;
                                      if (isMultiSelect) {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setSelectedAssignmentIds((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(assignment.id)) {
                                            next.delete(assignment.id);
                                          } else {
                                            next.add(assignment.id);
                                          }
                                          return next;
                                        });
                                        return;
                                      }

                                      setSelectedAssignmentIds(new Set([assignment.id]));
                                      onAssignmentClick(assignment);
                                    }}
                                    data-testid={`assignment-${assignment.id}`}
                                  >
                                    <div className={cn("flex items-start", isCompactView ? "gap-0.5" : "gap-1")}>
                                      {!isCompactView && <GripVertical className="w-2.5 h-2.5 shrink-0 opacity-50 mt-0.5" />}
                                      <div className="flex-1 min-w-0">
                                        <div className={cn("text-xs font-medium flex items-center justify-between gap-1", isTaskDark ? "text-white" : "text-foreground")}>
                                          <span className="min-w-0 flex-1 truncate leading-tight">{assignment.customName || task.name}</span>
                                          {!isCompactView && (
                                            <div className="flex items-center gap-0.5 shrink-0">
                                              {assignment.notes && (
                                                <Popover>
                                                  <PopoverTrigger asChild>
                                                    <button
                                                      type="button"
                                                      className={cn(
                                                        "relative z-20 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border shadow-sm backdrop-blur-[2px] transition-all duration-150",
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
                                              <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                  <button
                                                    type="button"
                                                    className={cn(
                                                      "relative z-20 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border shadow-sm backdrop-blur-[2px] transition-all duration-150",
                                                      "opacity-0 group-hover:opacity-100 hover:-translate-y-px hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                                                      isTaskDark
                                                        ? "border-white/45 bg-black/25 text-white/95 hover:border-white/70 hover:bg-black/45 focus-visible:ring-white/80 focus-visible:ring-offset-transparent"
                                                        : "border-black/15 bg-white/80 text-foreground/80 hover:border-black/25 hover:bg-white focus-visible:ring-foreground/40 focus-visible:ring-offset-white/50"
                                                    )}
                                                    onClick={(event) => event.stopPropagation()}
                                                    onPointerDown={(event) => event.stopPropagation()}
                                                    aria-label="Assignment options"
                                                  >
                                                    <MoreHorizontal className="h-3.5 w-3.5 stroke-[2.6]" />
                                                  </button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent className="z-[80]" align="end" onClick={(e) => e.stopPropagation()}>
                                                  <DropdownMenuItem
                                                    onSelect={() => {
                                                      const toCopy = selectedAssignmentIds.has(assignment.id)
                                                        ? assignments.filter((a) => selectedAssignmentIds.has(a.id))
                                                        : [assignment];
                                                      handleCopy(toCopy);
                                                    }}
                                                  >
                                                    <Copy className="w-4 h-4 mr-2" />
                                                    Copy
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem onSelect={() => onAssignmentClick(assignment)}>
                                                    Edit Details
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem
                                                    onSelect={() => setHighlightedTaskId(highlightedTaskId === task.id ? null : task.id)}
                                                  >
                                                    {highlightedTaskId === task.id ? "Clear Highlight" : `Highlight ${task.name}`}
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem
                                                    onSelect={() => setTrainedTaskId(trainedTaskId === task.id ? null : task.id)}
                                                  >
                                                    {trainedTaskId === task.id ? "Clear trained filter" : "Highlight trained"}
                                                  </DropdownMenuItem>
                                                  <DropdownMenuSeparator />
                                                  <DropdownMenuItem
                                                    className="text-destructive focus:text-destructive"
                                                    onSelect={() => {
                                                      const idsToDelete = selectedAssignmentIds.has(assignment.id)
                                                        ? Array.from(selectedAssignmentIds)
                                                        : [assignment.id];
                                                      void deleteAssignments(idsToDelete);
                                                    }}
                                                  >
                                                    Delete
                                                  </DropdownMenuItem>
                                                  {assignment.seriesId && (
                                                    <DropdownMenuItem
                                                      className="text-destructive focus:text-destructive"
                                                      onSelect={() => void deleteAssignmentSeries(assignment.seriesId!)}
                                                    >
                                                      Delete Series
                                                    </DropdownMenuItem>
                                                  )}
                                                </DropdownMenuContent>
                                              </DropdownMenu>
                                            </div>
                                          )}
                                        </div>
                                        {!isCompactView && (assignment.batchNumber || assignment.batchSize) && (
                                          <div className={cn("text-xs font-mono mt-px flex gap-1", isTaskDark ? "text-white/80" : "text-foreground/70")}>
                                            {assignment.batchNumber && <span>#{assignment.batchNumber}</span>}
                                            {assignment.batchSize && <span>({assignment.batchSize})</span>}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </ContextMenuTrigger>
                                <ContextMenuContent className="z-[80]">
                                  <ContextMenuItem
                                    onSelect={() => {
                                      const toCopy = selectedAssignmentIds.has(assignment.id)
                                        ? assignments.filter((a) => selectedAssignmentIds.has(a.id))
                                        : [assignment];
                                      handleCopy(toCopy);
                                    }}
                                  >
                                    <Copy className="w-4 h-4 mr-2" />
                                    Copy
                                  </ContextMenuItem>
                                  <ContextMenuItem onSelect={() => onAssignmentClick(assignment)}>
                                    Edit Details
                                  </ContextMenuItem>
                                  <ContextMenuItem
                                    onSelect={() =>
                                      setHighlightedTaskId(
                                        highlightedTaskId === task.id ? null : task.id
                                      )
                                    }
                                  >
                                    {highlightedTaskId === task.id ? "Clear Highlight" : `Highlight ${task.name}`}
                                  </ContextMenuItem>
                                  <ContextMenuItem
                                    onSelect={() =>
                                      setTrainedTaskId(trainedTaskId === task.id ? null : task.id)
                                    }
                                  >
                                    {trainedTaskId === task.id ? "Clear trained filter" : "Highlight trained"}
                                  </ContextMenuItem>
                                  <ContextMenuSeparator />
                                  <ContextMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onSelect={() => {
                                      const idsToDelete = selectedAssignmentIds.has(assignment.id)
                                        ? Array.from(selectedAssignmentIds)
                                        : [assignment.id];
                                      void deleteAssignments(idsToDelete);
                                    }}
                                  >
                                    Delete
                                  </ContextMenuItem>
                                  {assignment.seriesId && (
                                    <ContextMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onSelect={() => void deleteAssignmentSeries(assignment.seriesId!)}
                                    >
                                      Delete Series
                                    </ContextMenuItem>
                                  )}
                                </ContextMenuContent>
                              </ContextMenu>
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
                          </ContextMenuTrigger>
                          <ContextMenuContent className="z-[80]">
                            <ContextMenuItem onSelect={() => setSelectedCell(currentCell)}>
                              Add Task
                            </ContextMenuItem>
                            {clipboardAssignments.length > 0 && (
                              <ContextMenuItem onSelect={() => void handlePaste(currentCell)}>
                                Paste
                              </ContextMenuItem>
                            )}
                          </ContextMenuContent>
                        </ContextMenu>
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
        slackEnabled={slackEnabled}
      />
    </>
  );
}
