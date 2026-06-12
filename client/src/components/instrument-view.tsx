import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Person, type Task, type Assignment, type Instrument, DAYS } from "@shared/schema";
import { addDays } from "date-fns";
import { Eye, EyeOff, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InstrumentViewProps {
  weekStartDate: string;
  assignments: Assignment[];
  people: Person[];
  tasks: Task[];
  onAssignmentClick: (assignment: Assignment) => void;
  isCompactView: boolean;
  hideEmptyInstruments?: boolean;
  onToggleHideEmptyInstruments?: () => void;
}

function getDayLabel(weekStart: Date, dayIndex: number): string {
  const d = addDays(weekStart, dayIndex);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function InstrumentView({
  weekStartDate,
  assignments,
  people,
  tasks,
  onAssignmentClick,
  isCompactView,
  hideEmptyInstruments = false,
  onToggleHideEmptyInstruments,
}: InstrumentViewProps) {
  const { data: instruments = [] } = useQuery<Instrument[]>({ queryKey: ["/api/instruments"] });

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
      </div>
    );
  }

  return (
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
              title={[instrument.name, instrument.type, instrument.location].filter(Boolean).join(" · ")}
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
            </div>

            {/* Day cells for this instrument */}
            {DAYS.map((day) => {
              const dayAssignments = assignments.filter(
                (a) => a.instrumentId === instrument.id && a.day === day
              );

              return (
                <div
                  key={`${instrument.id}-${day}`}
                  className={`border-b border-r px-2 py-1.5 flex flex-col gap-1 ${cellHeight}`}
                  data-testid={`instrument-cell-${instrument.id}-${day}`}
                >
                  {dayAssignments.map((assignment) => {
                    const person = personMap.get(assignment.personId);
                    const task = taskMap.get(assignment.taskId);
                    if (!person || !task) return null;
                    return (
                      <button
                        key={assignment.id}
                        onClick={() => onAssignmentClick(assignment)}
                        className="w-full text-left rounded px-2 py-1 flex items-center gap-1.5 hover-elevate active-elevate-2 transition-colors"
                        style={{
                          backgroundColor: (assignment as any).customColor ?? task.color,
                          border: `1.5px solid ${person.color}`,
                        }}
                        title={`${person.name} — ${assignment.customName || task.name}`}
                        data-testid={`instrument-assignment-${assignment.id}`}
                      >
                        <span
                          className="flex-shrink-0 w-2 h-2 rounded-full"
                          style={{ backgroundColor: person.color }}
                        />
                        <span className={`font-medium truncate ${isCompactView ? "text-[11px]" : "text-xs"}`}>
                          {assignment.customName || task.name}
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
          </Fragment>
        ))}
      </div>
    </div>
  );
}
