import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Calendar as CalendarIcon, Info } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { type Assignment, type Task } from "@shared/schema";
import { useMemo, useState } from "react";
import { 
  format, 
  startOfYear, 
  endOfYear, 
  eachDayOfInterval, 
  isSameDay, 
  getDay, 
  startOfWeek, 
  endOfWeek,
  addDays,
  isWeekend
} from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export default function ALReporting() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: assignments = [] } = useQuery<Assignment[]>({ queryKey: ["/api/assignments"] });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });

  // Find the AL task
  const alTask = useMemo(() => 
    tasks.find(t => t.name.toLowerCase().includes("al") || t.name.toLowerCase().includes("annual leave")), 
  [tasks]);

  // Filter assignments for the selected year and AL task
  const alAssignments = useMemo(() => {
    if (!alTask) return [];
    const yearStart = startOfYear(new Date(year, 0, 1));
    const yearEnd = endOfYear(new Date(year, 0, 1));
    
    return assignments.filter(a => {
      const date = new Date(a.date || a.weekStartDate); // Use date if available, fallback to weekStartDate
      return a.taskId === alTask.id && date >= yearStart && date <= yearEnd;
    });
  }, [assignments, alTask, year]);

  // Count occurrences per day
  const dailyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    alAssignments.forEach(a => {
      const dateKey = a.date || a.weekStartDate;
      counts[dateKey] = (counts[dateKey] || 0) + 1;
    });
    return counts;
  }, [alAssignments]);

  const maxCount = useMemo(() => {
    const values = Object.values(dailyCounts);
    return values.length > 0 ? Math.max(...values) : 0;
  }, [dailyCounts]);

  const yearDays = useMemo(() => {
    const start = startOfYear(new Date(year, 0, 1));
    const end = endOfYear(new Date(year, 0, 1));
    return eachDayOfInterval({ start, end });
  }, [year]);

  // Group days by month for easier rendering
  const months = useMemo(() => {
    const monthData = [];
    for (let i = 0; i < 12; i++) {
      const start = new Date(year, i, 1);
      const end = new Date(year, i + 1, 0);
      monthData.push({
        name: format(start, "MMMM"),
        days: eachDayOfInterval({ start, end })
      });
    }
    return monthData;
  }, [year]);

  const getColorClass = (count: number) => {
    if (count === 0) return "bg-muted/30 text-muted-foreground/50";
    if (!maxCount) return "bg-primary/20 text-primary-foreground";
    const intensity = count / maxCount;
    if (intensity <= 0.25) return "bg-primary/20 text-primary-foreground";
    if (intensity <= 0.5) return "bg-primary/40 text-primary-foreground";
    if (intensity <= 0.75) return "bg-primary/70 text-white";
    return "bg-primary text-white";
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="outline" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl sm:text-3xl font-bold">AL Reporting</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setYear(year - 1)}>{year - 1}</Button>
            <span className="text-lg font-bold px-2">{year}</span>
            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setYear(year + 1)}>{year + 1}</Button>
          </div>
        </div>

        {!alTask ? (
          <Card className="p-12 text-center">
            <Info className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-xl text-muted-foreground">No "AL" or "Annual Leave" task found in the system.</p>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {months.map((month) => (
                <Card key={month.name} className="p-3">
                  <h3 className="text-sm font-semibold mb-2 text-center">{month.name}</h3>
                  <div className="grid grid-cols-5 gap-1">
                    {["M", "T", "W", "T", "F"].map((d, i) => (
                      <div key={i} className="text-[10px] text-muted-foreground text-center font-medium">
                        {d}
                      </div>
                    ))}
                    {/* Padding for first day of month (Monday start) */}
                    {Array.from({ length: (getDay(month.days[0]) + 6) % 7 }).map((_, i) => {
                      if (i >= 5) return null; // Skip weekend padding slots
                      return <div key={`pad-${i}`} />;
                    })}
                    {month.days.map((day) => {
                      if (isWeekend(day)) return null;
                      const dateKey = format(day, "yyyy-MM-dd");
                      const count = dailyCounts[dateKey] || 0;
                      return (
                        <TooltipProvider key={dateKey}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "aspect-square rounded-sm transition-colors flex items-center justify-center text-[10px] font-bold select-none",
                                  getColorClass(count)
                                )}
                              >
                                {count > 0 && count}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs font-medium">{format(day, "MMM d, yyyy")}</p>
                              <p className="text-xs">{count} AL event{count !== 1 ? "s" : ""}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>

            <Card className="p-3">
              <div className="flex items-center justify-center gap-3 text-[10px] sm:text-xs text-muted-foreground">
                <span>Less Leave</span>
                <div className="flex gap-1">
                  <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-sm bg-muted/30" />
                  <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-sm bg-primary/20" />
                  <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-sm bg-primary/40" />
                  <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-sm bg-primary/70" />
                  <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-sm bg-primary" />
                </div>
                <span>More Leave</span>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
