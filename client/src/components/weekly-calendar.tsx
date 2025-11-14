import { Fragment } from "react";
import { DAYS, PERIODS, type Assignment, type Person, type Task } from "@shared/schema";
import { TimeSlot } from "./time-slot";
import { format, startOfWeek, addDays } from "date-fns";

interface WeeklyCalendarProps {
  assignments: Assignment[];
  people: Person[];
  tasks: Task[];
  activePerson: string | null;
  onAssignmentClick: (assignment: Assignment) => void;
}

export function WeeklyCalendar({ assignments, people, tasks, activePerson, onAssignmentClick }: WeeklyCalendarProps) {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });

  const getDateForDay = (dayIndex: number) => {
    return addDays(weekStart, dayIndex);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[auto_repeat(5,1fr)] gap-2">
        <div className="h-12" />
        {DAYS.map((day, index) => {
          const date = getDateForDay(index);
          return (
            <div
              key={day}
              className="h-12 flex flex-col items-center justify-center border-b-2 border-primary"
              data-testid={`header-day-${day.toLowerCase()}`}
            >
              <div className="text-sm font-semibold">{day}</div>
              <div className="text-xs text-muted-foreground">{format(date, "MMM d")}</div>
            </div>
          );
        })}

        {PERIODS.map((period) => (
          <Fragment key={period}>
            <div
              className="h-8 flex items-center justify-end pr-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
              data-testid={`label-period-${period.toLowerCase()}`}
            >
              {period}
            </div>
            {DAYS.map((day) => {
              const slotAssignments = assignments.filter(
                (a) => a.day === day && a.period === period
              );
              return (
                <TimeSlot
                  key={`${day}-${period}`}
                  day={day}
                  period={period}
                  assignments={slotAssignments}
                  people={people}
                  tasks={tasks}
                  activePerson={activePerson}
                  onAssignmentClick={onAssignmentClick}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
