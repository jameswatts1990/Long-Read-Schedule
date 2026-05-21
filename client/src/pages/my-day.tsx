import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Search, Bell, Calendar as CalendarIcon, Layers } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { type Person, type Task, type Assignment, DAYS } from "@shared/schema";
import { format, addDays, parse, startOfWeek, isToday, isTomorrow, isPast, isSameDay, eachDayOfInterval } from "date-fns";
import { cn } from "@/lib/utils";
import { useState, useMemo, useEffect } from "react";

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function formatDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

export default function MyDay() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const { data: people = [] } = useQuery<Person[]>({ queryKey: ["/api/people"] });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });

  const matchedPerson = useMemo(() => {
    if (!user || !people.length) return null;
    const userEmail = (user as any).email?.toLowerCase();
    const userName = `${(user as any).firstName || ''} ${(user as any).lastName || ''}`.trim().toLowerCase();
    const firstName = (user as any).firstName?.toLowerCase();
    const lastName = (user as any).lastName?.toLowerCase();
    
    // Priority 1: Exact name match (highest priority)
    let match = people.find(p => userName && p.name.toLowerCase() === userName);
    if (match) return match;
    
    // Priority 2: Full name contains both first and last name
    match = people.find(p => {
      const personName = p.name.toLowerCase();
      return lastName && firstName && personName.includes(lastName) && personName.includes(firstName);
    });
    if (match) return match;
    
    // Priority 3: Email local part match (less reliable)
    match = people.find(p => userEmail && p.name.toLowerCase().includes(userEmail.split('@')[0]));
    if (match) return match;
    
    return null;
  }, [user, people]);

  const { data: assignments = [] } = useQuery<Assignment[]>({
    queryKey: ["/api/assignments"],
    enabled: !!matchedPerson,
  });

  const myAssignments = useMemo(() => {
    if (!matchedPerson) return [];
    return assignments.filter(a => a.personId === matchedPerson.id);
  }, [assignments, matchedPerson]);

  const assignmentsByDate = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    
    myAssignments.forEach(assignment => {
      let dateKey: string;
      if (assignment.date) {
        dateKey = assignment.date;
      } else {
        const dayIndex = DAYS.indexOf(assignment.day as typeof DAYS[number]);
        if (dayIndex === -1) return;
        
        // Use the assignment's weekStartDate to calculate the specific date
        try {
          const weekStart = parse(assignment.weekStartDate, "yyyy-MM-dd", new Date());
          const assignmentDate = addDays(weekStart, dayIndex);
          dateKey = formatDateStr(assignmentDate);
        } catch (e) {
          console.error("Failed to parse date for assignment:", assignment);
          return;
        }
      }
      
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(assignment);
    });
    
    return map;
  }, [myAssignments]);

  const sortedDates = useMemo(() => {
    const dates = Array.from(assignmentsByDate.keys()).sort();
    // For the list view, we show EVERYTHING assigned to this person, not just future tasks
    // This makes it easier for them to see their whole schedule
    return dates;
  }, [assignmentsByDate]);

  const getTaskById = (taskId: string) => tasks.find(t => t.id === taskId);

  const formatDayLabel = (dateStr: string): { day: number; weekday: string; month: string; isToday: boolean; isTomorrow: boolean } => {
    const date = parse(dateStr, "yyyy-MM-dd", new Date());
    return {
      day: date.getDate(),
      weekday: format(date, "EEE"),
      month: format(date, "MMM"),
      isToday: isToday(date),
      isTomorrow: isTomorrow(date),
    };
  };

  const calendarDays = useMemo(() => {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      days.push(addDays(weekStart, i));
    }
    return days;
  }, [selectedDate]);

  const hasAssignmentsOnDate = (date: Date) => {
    return assignmentsByDate.has(formatDateStr(date));
  };

  const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (containerRef && sortedDates.length > 0) {
      const todayStr = formatDateStr(new Date());
      const todayRow = containerRef.querySelector(`[data-testid="day-row-${todayStr}"]`);
      if (todayRow) {
        todayRow.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [containerRef, sortedDates]);

  if (!matchedPerson) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-50 bg-background border-b px-4 py-3 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold flex-1">My Schedule</h1>
        </header>
        
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center space-y-4">
            <CalendarIcon className="w-16 h-16 mx-auto text-muted-foreground/50" />
            <h2 className="text-xl font-semibold">No Schedule Found</h2>
            <p className="text-muted-foreground max-w-xs">
              Your account isn't linked to a team member yet. Please contact your administrator to set up your schedule.
            </p>
            <Link href="/">
              <Button data-testid="button-go-to-scheduler">View Full Scheduler</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background border-b px-4 py-3 flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold flex-1">
          My Schedule
          {matchedPerson && (
            <span className="block text-xs font-normal text-muted-foreground -mt-1">
              {matchedPerson.name}
              {activeWorkspace && ` · ${activeWorkspace.name}`}
            </span>
          )}
        </h1>
        <Button variant="ghost" size="icon" data-testid="button-search">
          <Search className="w-5 h-5" />
        </Button>
        <Link href="/settings">
          <Button variant="ghost" size="icon" data-testid="button-settings" aria-label="Notification settings">
            <Bell className="w-5 h-5" />
          </Button>
        </Link>
      </header>
      <div className="px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center justify-between gap-1">
          {["M", "T", "W", "T", "F", "S", "S"].map((dayName, i) => {
            const date = calendarDays[i];
            const isSelected = isSameDay(date, selectedDate);
            const hasTasks = hasAssignmentsOnDate(date);
            const isTodayDate = isToday(date);
            const monthAbbrev = format(date, "MMM");
            
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(date)}
                className={cn(
                  "flex flex-col items-center py-2 px-2 rounded-lg transition-colors min-w-[40px]",
                  isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
                data-testid={`calendar-day-${i}`}
              >
                <span className={cn("text-xs", !isSelected && "text-muted-foreground")}>{dayName}</span>
                <span className={cn(
                  "text-lg font-semibold w-8 h-8 flex items-center justify-center rounded-full",
                  isTodayDate && !isSelected && "bg-primary/20 text-primary"
                )}>
                  {date.getDate()}
                </span>
                <span className={cn("text-[10px]", !isSelected && "text-muted-foreground/70")}>{monthAbbrev}</span>
                {hasTasks && (
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full mt-0.5",
                    isSelected ? "bg-primary-foreground" : "bg-primary"
                  )} />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto" ref={setContainerRef}>
        {sortedDates.length === 0 ? (
          <div className="flex items-center justify-center h-full p-6">
            <div className="text-center space-y-2">
              <CalendarIcon className="w-12 h-12 mx-auto text-muted-foreground/50" />
              <p className="text-muted-foreground">No upcoming tasks scheduled</p>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {sortedDates.map(dateStr => {
              const dayLabel = formatDayLabel(dateStr);
              const dayAssignments = assignmentsByDate.get(dateStr) || [];
              
              return (
                <div key={dateStr} className="flex" data-testid={`day-row-${dateStr}`}>
                  <div className="w-16 shrink-0 py-4 pl-4 pr-2">
                    <div className={cn(
                      "text-center",
                      dayLabel.isToday && "text-primary"
                    )}>
                      <div className="text-2xl font-bold">{dayLabel.day}</div>
                      <div className="text-xs text-muted-foreground uppercase">{dayLabel.weekday}</div>
                      <div className="text-[10px] text-muted-foreground/70 uppercase">{dayLabel.month}</div>
                    </div>
                  </div>
                  
                  <div className="flex-1 py-3 pr-4 space-y-2">
                    {dayAssignments.map(assignment => {
                      const task = getTaskById(assignment.taskId);
                      if (!task) return null;
                      
                      const isTaskDark = isDarkColor(task.color);
                      
                      return (
                        <div
                          key={assignment.id}
                          className="rounded-xl p-3 border-l-4 shadow-sm"
                          style={{ 
                            backgroundColor: task.color,
                            borderLeftColor: matchedPerson.color 
                          }}
                          data-testid={`assignment-card-${assignment.id}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className={cn(
                                "font-semibold text-base",
                                isTaskDark ? "text-white" : "text-foreground"
                              )}>
                                {assignment.customName || task.name}
                              </div>
                              
                              {(assignment.batchNumber || assignment.batchSize) && (
                                <div className={cn(
                                  "text-sm mt-0.5 font-mono",
                                  isTaskDark ? "text-white/80" : "text-foreground/70"
                                )}>
                                  {assignment.batchNumber && <span>#{assignment.batchNumber}</span>}
                                  {assignment.batchSize && <span className="ml-1">({assignment.batchSize})</span>}
                                </div>
                              )}
                              
                              {assignment.notes && (
                                <div className={cn(
                                  "text-sm mt-1.5 line-clamp-2",
                                  isTaskDark ? "text-white/70" : "text-foreground/60"
                                )}>
                                  {assignment.notes}
                                </div>
                              )}
                            </div>
                            
                            {dayAssignments.length > 1 && (
                              <div className={cn(
                                "text-xs px-2 py-0.5 rounded-full shrink-0",
                                isTaskDark ? "bg-white/20 text-white" : "bg-foreground/10 text-foreground"
                              )}>
                                {dayAssignments.indexOf(assignment) + 1} of {dayAssignments.length}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <nav className="sticky bottom-0 bg-background border-t px-4 py-2 flex justify-around pt-[2px] pb-[2px] text-[12px]">
        <Link href="/my-day">
          <Button variant="ghost" className="flex-col h-auto py-2 text-primary" data-testid="nav-my-day">
            <CalendarIcon className="w-5 h-5" />
            <span className="text-xs mt-1">My Day</span>
          </Button>
        </Link>
        <Link href="/">
          <Button variant="ghost" className="flex-col h-auto py-2 text-muted-foreground" data-testid="nav-scheduler">
            <CalendarIcon className="w-5 h-5" />
            <span className="text-xs mt-1">Schedule</span>
          </Button>
        </Link>
      </nav>
    </div>
  );
}
