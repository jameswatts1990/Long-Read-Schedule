import { User, CalendarPlus, CalendarCheck, X } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  formatDistanceToNow,
  startOfWeek,
  addWeeks,
  addDays,
  format,
  isToday,
  parseISO,
} from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { type Person, type Task, type Assignment, DAYS } from "@shared/schema";

interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}

const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function isLeaveTask(name: string): boolean {
  const l = name.toLowerCase();
  return l.includes("annual leave") || l === "al" || /\bal\b/.test(l) || l.startsWith("al (");
}

function getLeaveDays(name: string): number {
  const l = name.toLowerCase();
  return l.includes("(am)") || l.includes("(pm)") ? 0.5 : 1;
}

function getAssignmentDate(a: Assignment): Date {
  if (a.date) return parseISO(a.date);
  const dayIndex = DAYS.indexOf(a.day as (typeof DAYS)[number]);
  return addDays(parseISO(a.weekStartDate), dayIndex < 0 ? 0 : dayIndex);
}

interface NotificationBellProps {
  onNavigateToWeek?: (weekStart: Date) => void;
}

export function NotificationBell({ onNavigateToWeek }: NotificationBellProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const futureEndStr = format(addWeeks(weekStart, 5), "yyyy-MM-dd");

  const { data: people = [] } = useQuery<Person[]>({ queryKey: ["/api/people"] });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: weekAssignments = [] } = useQuery<Assignment[]>({
    queryKey: [`/api/assignments?weekStartDate=${weekStartStr}`],
  });
  const { data: upcomingAssignments = [] } = useQuery<Assignment[]>({
    queryKey: [`/api/assignments?startDate=${weekStartStr}&endDate=${futureEndStr}`],
    staleTime: 5 * 60_000,
  });
  const { data: notifications = [] } = useQuery<AppNotification[]>({
    queryKey: ["/api/notifications"],
    staleTime: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/mark-read"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/notifications/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  // Find current user's person record
  const currentPerson = people.find((p) => p.userId === (user as any)?.id) ?? null;

  // Assignments for current user this week
  const myWeekAssignments = currentPerson
    ? weekAssignments.filter((a) => a.personId === currentPerson.id)
    : [];

  // Leave days this week
  const weekLeaveTotal = myWeekAssignments.reduce((sum, a) => {
    const task = tasks.find((t) => t.id === a.taskId);
    if (!task || !isLeaveTask(task.name)) return sum;
    return sum + getLeaveDays(task.name);
  }, 0);

  // Production task count this week (non-leave tasks)
  const productionCount = myWeekAssignments.filter((a) => {
    const task = tasks.find((t) => t.id === a.taskId);
    return task && !isLeaveTask(task.name);
  }).length;

  // Upcoming leave (weeks after this one, up to 5 weeks out)
  const nextWeekStartStr = format(addWeeks(weekStart, 1), "yyyy-MM-dd");
  const upcomingLeave = currentPerson
    ? upcomingAssignments
        .filter((a) => {
          if (a.personId !== currentPerson.id) return false;
          if (a.weekStartDate < nextWeekStartStr) return false;
          const task = tasks.find((t) => t.id === a.taskId);
          return task != null && isLeaveTask(task.name);
        })
        .map((a) => ({ a, task: tasks.find((t) => t.id === a.taskId)!, date: getAssignmentDate(a) }))
        .sort((x, y) => x.date.getTime() - y.date.getTime())
    : [];

  // Day-by-day breakdown this week
  const dayBreakdown = DAYS.map((day, dayIndex) => ({
    day,
    dayIndex,
    date: addDays(weekStart, dayIndex),
    assignments: myWeekAssignments.filter((a) => a.day === day),
  }));

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && unreadCount > 0) {
      markReadMutation.mutate();
    }
  };

  const handleNotificationClick = (n: AppNotification) => {
    if (!onNavigateToWeek || !n.body) return;
    const match = n.body.match(/Week of (\d{4}-\d{2}-\d{2})/);
    if (match) {
      onNavigateToWeek(parseISO(match[1]));
      setOpen(false);
    }
  };

  // User display
  const firstName = (user as any)?.firstName ?? "";
  const lastName = (user as any)?.lastName ?? "";
  const displayName = firstName
    ? `${firstName}${lastName ? " " + lastName : ""}`
    : ((user as any)?.email?.split("@")[0] ?? "You");
  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const email = (user as any)?.email ?? "";

  const weekEnd = addDays(weekStart, 4);
  const weekLabel = `${format(weekStart, "d MMM")} – ${format(weekEnd, "d MMM")}`;

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="Notifications"
          data-testid="button-notifications"
          className="relative"
        >
          <User className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-[10px] text-white flex items-center justify-center font-medium leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[380px] p-0 max-h-[80vh] overflow-y-auto"
        data-testid="popover-notifications"
      >
        {/* ── User Profile Header ── */}
        <div className="p-4 flex items-center gap-3 bg-muted/40 border-b">
          <div
            className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-white"
            style={{ backgroundColor: currentPerson?.color ?? "hsl(var(--primary))" }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">{displayName}</p>
            {email && <p className="text-xs text-muted-foreground truncate">{email}</p>}
          </div>
        </div>

        {/* ── This Week ── */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              This week
            </p>
            <p className="text-xs text-muted-foreground">{weekLabel}</p>
          </div>

          {!currentPerson ? (
            <p className="text-xs text-muted-foreground italic">
              No schedule linked to your account
            </p>
          ) : (
            <>
              {/* Summary pills */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-sm">
                <span>
                  <span className="font-semibold">{productionCount}</span>
                  <span className="text-muted-foreground ml-1">
                    task{productionCount !== 1 ? "s" : ""}
                  </span>
                </span>
                {weekLeaveTotal > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    <span className="font-semibold">{weekLeaveTotal}</span>
                    <span className="ml-1">day{weekLeaveTotal !== 1 ? "s" : ""} leave</span>
                  </span>
                )}
                {productionCount === 0 && weekLeaveTotal === 0 && (
                  <span className="text-muted-foreground text-xs italic">Nothing scheduled</span>
                )}
              </div>

              {/* Day breakdown */}
              <div className="space-y-1">
                {dayBreakdown.map(({ day, dayIndex, date, assignments }) => {
                  const isCurrentDay = isToday(date);
                  return (
                    <div key={day} className="flex gap-2 text-xs leading-snug">
                      <span
                        className={cn(
                          "w-7 shrink-0",
                          isCurrentDay
                            ? "font-bold text-primary"
                            : "text-muted-foreground"
                        )}
                      >
                        {DAYS_SHORT[dayIndex]}
                      </span>
                      {assignments.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="truncate">
                          {assignments
                            .map((a) => {
                              const task = tasks.find((t) => t.id === a.taskId);
                              return a.customName ?? task?.name ?? "Task";
                            })
                            .join(" · ")}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ── Upcoming Leave ── */}
        {upcomingLeave.length > 0 && (
          <div className="p-4 border-b">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Upcoming leave
            </p>
            <div className="space-y-1">
              {upcomingLeave.slice(0, 6).map(({ a, task, date }) => (
                <div key={a.id} className="flex items-center gap-2 text-xs">
                  <span className="shrink-0 text-muted-foreground w-20">
                    {format(date, "EEE d MMM")}
                  </span>
                  <span className="truncate text-amber-600 dark:text-amber-400">
                    {task.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Notifications ── */}
        <div>
          <div className="px-4 py-3 border-b">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notifications
              {notifications.length > 0 && (
                <span className="ml-1.5 font-normal text-foreground">
                  ({notifications.length})
                </span>
              )}
            </p>
          </div>
          <div className="divide-y">
            {notifications.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-5">No notifications</p>
            ) : (
              notifications.slice(0, 8).map((n) => {
                const Icon = n.type === "assignment_updated" ? CalendarCheck : CalendarPlus;
                const canNavigate = onNavigateToWeek && n.body && /Week of \d{4}-\d{2}-\d{2}/.test(n.body);
                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={cn(
                      "group px-4 py-2.5 flex items-start gap-2",
                      !n.readAt && "bg-primary/5",
                      canNavigate && "cursor-pointer hover:bg-muted/60 transition-colors"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-xs font-medium leading-snug flex-1 min-w-0">{n.title}</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); dismissMutation.mutate(n.id); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label="Dismiss notification"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      {n.body && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                          {n.body}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    {!n.readAt && (
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
