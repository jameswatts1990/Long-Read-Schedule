import { Fragment, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type Person, type Task, type Assignment, type Instrument, DAYS } from "@shared/schema";
import { addDays } from "date-fns";
import { Eye, EyeOff, Link2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AddAssignmentDialog } from "@/components/add-assignment-dialog";

interface InstrumentViewProps {
  weekStartDate: string;
  assignments: Assignment[];
  people: Person[];
  tasks: Task[];
  onAssignmentClick: (assignment: Assignment) => void;
  isCompactView: boolean;
  hideEmptyInstruments?: boolean;
  onToggleHideEmptyInstruments?: () => void;
  slackEnabled?: boolean;
}

function getDayLabel(weekStart: Date, dayIndex: number): string {
  const d = addDays(weekStart, dayIndex);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

const getLuminance = (hexColor: string): number => {
  const hex = hexColor.replace("#", "");
  if (hex.length !== 6) return 1;
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

const isDarkColor = (hexColor: string): boolean => getLuminance(hexColor) < 0.5;

export function InstrumentView({
  weekStartDate,
  assignments,
  people,
  tasks,
  onAssignmentClick,
  isCompactView,
  hideEmptyInstruments = false,
  onToggleHideEmptyInstruments,
  slackEnabled = false,
}: InstrumentViewProps) {
  const { data: instruments = [] } = useQuery<Instrument[]>({ queryKey: ["/api/instruments"] });
  const { toast } = useToast();

  const [draggedAssignment, setDraggedAssignment] = useState<Assignment | null>(null);
  const [dropTarget, setDropTarget] = useState<{ instrumentId: string; day: string } | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ instrumentId: string; day: string } | null>(null);

  const moveAssignmentMutation = useMutation({
    mutationFn: async (data: { assignmentId: string; instrumentId: string; day: string }) => {
      const res = await apiRequest("PATCH", `/api/assignments/${data.assignmentId}`, {
        instrumentId: data.instrumentId,
        day: data.day,
        weekStartDate,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) =>
        typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/assignments")
      });
      toast({
        title: "Booking moved",
        description: "Assignment updated successfully",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to move booking",
        description: error instanceof Error ? error.message : "Could not update the assignment",
        variant: "destructive",
      });
    },
  });

  const visibleInstruments = hideEmptyInstruments
    ? instruments.filter((instrument) => assignments.some((a) => a.instrumentId === instrument.id))
    : instruments;

  const weekStart = new Date(weekStartDate + "T00:00:00");

  const personMap = new Map<string, Person>(people.map((p) => [p.id, p]));
  const taskMap = new Map<string, Task>(tasks.map((t) => [t.id, t]));

  const cellHeight = isCompactView ? "min-h-[56px]" : "min-h-[80px]";
  const nameColWidth = isCompactView ? "140px" : "200px";

  if (instruments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-24">
        <p className="text-base">No instruments are configured for this workspace.</p>
        <p className="text-sm">Go to Admin → Instruments to add equipment that assignments can be booked onto.</p>
      </div>
    );
  }

  if (hideEmptyInstruments && visibleInstruments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-24">
        <p className="text-base">No instruments have bookings this week.</p>
        <p className="text-sm">Turn off the visibility filter to show all instruments.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleHideEmptyInstruments}
          data-testid="button-show-all-instruments"
        >
          <Eye className="h-3.5 w-3.5" />
          <span>Show all instruments</span>
        </Button>
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
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Instrument</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-1 h-6 w-6"
            onClick={onToggleHideEmptyInstruments}
            aria-label={hideEmptyInstruments ? "Show all instruments" : "Hide empty instruments"}
            title={hideEmptyInstruments ? "Show all instruments" : "Hide empty instruments"}
            data-testid="button-instrument-hide-empty"
          >
            {hideEmptyInstruments ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </Button>
        </div>
        {DAYS.map((day, idx) => (
          <div
            key={day}
            className="border-b border-r bg-background px-3 py-2"
            data-testid={`instrument-header-${day}`}
          >
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {getDayLabel(weekStart, idx)}
            </span>
          </div>
        ))}

        {/* Instrument rows */}
        {visibleInstruments.map((instrument) => (
          <Fragment key={instrument.id}>
            {/* Instrument name cell */}
            <div
              className={`sticky left-0 z-10 border-b border-r flex flex-col px-3 py-2 ${cellHeight}`}
              style={{ backgroundColor: "hsl(var(--background))" }}
              title={[instrument.name, instrument.type, instrument.location, instrument.assetNumber ? `Asset: ${instrument.assetNumber}` : null].filter(Boolean).join(" · ")}
              data-testid={`instrument-label-${instrument.id}`}
            >
              <span className={`font-medium leading-tight ${isCompactView ? "text-xs" : "text-sm"}`}>
                {instrument.name}
              </span>
              {(instrument.type || instrument.location) && (
                <span className="text-[11px] text-muted-foreground leading-tight truncate">
                  {[instrument.type, instrument.location].filter(Boolean).join(" · ")}
                </span>
              )}
              {instrument.assetNumber && (
                <span className="text-[11px] text-muted-foreground/70 leading-tight truncate font-mono">
                  {instrument.assetNumber}
                </span>
              )}
            </div>

            {/* Day cells for this instrument */}
            {DAYS.map((day) => {
              const dayAssignments = assignments.filter(
                (a) => a.instrumentId === instrument.id && a.day === day
              );
              const isDropTarget =
                dropTarget?.instrumentId === instrument.id && dropTarget?.day === day;

              return (
                <div
                  key={`${instrument.id}-${day}`}
                  className={cn(
                    "group border-b border-r px-2 py-1.5 flex flex-col gap-1",
                    cellHeight,
                    isDropTarget && "bg-primary/10 ring-2 ring-inset ring-primary"
                  )}
                  onDragOver={(e) => {
                    if (draggedAssignment) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDropTarget({ instrumentId: instrument.id, day });
                    }
                  }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={() => {
                    if (
                      draggedAssignment &&
                      (draggedAssignment.instrumentId !== instrument.id || draggedAssignment.day !== day)
                    ) {
                      moveAssignmentMutation.mutate({
                        assignmentId: draggedAssignment.id,
                        instrumentId: instrument.id,
                        day,
                      });
                    }
                    setDropTarget(null);
                    setDraggedAssignment(null);
                  }}
                  data-testid={`instrument-cell-${instrument.id}-${day}`}
                >
                  {dayAssignments.map((assignment) => {
                    const person = personMap.get(assignment.personId);
                    const task = taskMap.get(assignment.taskId);
                    if (!person || !task) return null;
                    const cardColor = (assignment as any).customColor ?? task.color;
                    const isTaskDark = isDarkColor(cardColor);
                    return (
                      <button
                        key={assignment.id}
                        onClick={() => onAssignmentClick(assignment)}
                        draggable
                        onDragStart={(e) => {
                          setDraggedAssignment(assignment);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDraggedAssignment(null);
                          setDropTarget(null);
                        }}
                        className={cn(
                          "w-full text-left rounded px-2 py-1 hover-elevate active-elevate-2 transition-colors cursor-grab active:cursor-grabbing",
                          draggedAssignment?.id === assignment.id && "opacity-50"
                        )}
                        style={{
                          backgroundColor: cardColor,
                          border: `1.5px solid ${person.color}`,
                        }}
                        title={`${person.name} — ${assignment.customName || task.name}`}
                        data-testid={`instrument-assignment-${assignment.id}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="flex-shrink-0 w-2 h-2 rounded-full"
                            style={{ backgroundColor: person.color }}
                          />
                          <span
                            className={cn(
                              "font-medium truncate",
                              isCompactView ? "text-[11px]" : "text-xs",
                              isTaskDark ? "text-white" : "text-foreground"
                            )}
                          >
                            {person.name}
                          </span>
                          {assignment.linkedGroupId && (
                            <Link2
                              className={cn(
                                "ml-auto h-3 w-3 flex-shrink-0 opacity-70",
                                isTaskDark ? "text-white" : "text-foreground"
                              )}
                              aria-label="Part of a linked task group"
                            />
                          )}
                        </div>
                        <div
                          className={cn(
                            "truncate leading-tight",
                            isCompactView ? "text-[10px]" : "text-[11px]",
                            isTaskDark ? "text-white/80" : "text-foreground/70"
                          )}
                        >
                          {assignment.customName || task.name}
                        </div>
                        {(assignment.batchNumber || assignment.batchSize) && (
                          <div
                            className={cn(
                              "text-xs font-mono mt-px flex gap-1",
                              isTaskDark ? "text-white/80" : "text-foreground/70"
                            )}
                          >
                            {assignment.batchNumber && <span>#{assignment.batchNumber}</span>}
                            {assignment.batchSize && <span>({assignment.batchSize})</span>}
                          </div>
                        )}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setSelectedCell({ instrumentId: instrument.id, day })}
                    className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-opacity px-1 py-0.5 rounded hover:bg-black/5"
                    data-testid={`instrument-cell-add-${instrument.id}-${day}`}
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add</span>
                  </button>
                </div>
              );
            })}
          </Fragment>
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
        initialInstrumentId={selectedCell?.instrumentId}
        slackEnabled={slackEnabled}
      />
    </>
  );
}
