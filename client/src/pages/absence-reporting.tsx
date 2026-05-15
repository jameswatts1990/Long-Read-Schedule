import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Info, Users, Layers } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { type Assignment, type Task, type Person } from "@shared/schema";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useMemo, useState } from "react";
import {
  format,
  parse,
  eachDayOfInterval,
  getDay,
  addDays,
  isWeekend,
} from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export default function AbsenceReporting() {
  const { activeWorkspace } = useWorkspace();
  const [, navigate] = useLocation();
  const [year, setYear] = useState(new Date().getFullYear());

  const { data: assignments = [] } = useQuery<Assignment[]>({
    queryKey: [`/api/assignments?startDate=${year}-01-01&endDate=${year}-12-31`],
  });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: people = [] } = useQuery<Person[]>({ queryKey: ["/api/people"] });

  // Match any task whose name contains "absent" or "absence"
  const absenceTask = useMemo(() =>
    tasks.find(t => {
      const n = t.name.toLowerCase();
      return n.includes("absent") || n.includes("absence");
    }),
  [tasks]);

  const absenceAssignments = useMemo(() => {
    if (!absenceTask) return [];
    return assignments.filter(a => a.taskId === absenceTask.id);
  }, [assignments, absenceTask]);

  // Resolve each assignment to a calendar date
  const resolveDate = (a: Assignment): string | null => {
    if (a.date) return a.date;
    if (a.weekStartDate && a.day) {
      const weekStart = parse(a.weekStartDate, "yyyy-MM-dd", new Date());
      const daysInWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
      const offset = daysInWeek.indexOf(a.day);
      if (offset !== -1) return format(addDays(weekStart, offset), "yyyy-MM-dd");
    }
    return null;
  };

  // Count absences per day (number of people absent)
  const dailyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    absenceAssignments.forEach(a => {
      const dateKey = resolveDate(a);
      if (dateKey) counts[dateKey] = (counts[dateKey] || 0) + 1;
    });
    return counts;
  }, [absenceAssignments]);

  // Total absence days per person
  const absencePerPerson = useMemo(() => {
    const totals: Record<string, number> = {};
    people.forEach(p => { totals[p.id] = 0; });
    absenceAssignments.forEach(a => {
      totals[a.personId] = (totals[a.personId] || 0) + 1;
    });
    return people
      .map(p => ({ name: p.name, days: totals[p.id] || 0, color: p.color }))
      .filter(p => p.days > 0)
      .sort((a, b) => b.days - a.days);
  }, [absenceAssignments, people]);

  const chartConfig = useMemo(() => ({
    days: { label: "Absent Days", color: "hsl(25 95% 53%)" },
  }), []);

  const months = useMemo(() => {
    const data = [];
    for (let i = 0; i < 12; i++) {
      const start = new Date(year, i, 1);
      const end = new Date(year, i + 1, 0);
      data.push({ name: format(start, "MMMM"), days: eachDayOfInterval({ start, end }) });
    }
    return data;
  }, [year]);

  const getColorClass = (count: number) => {
    if (count === 0) return "bg-muted/30 text-muted-foreground/50";
    if (count === 1) return "bg-orange-200 text-orange-900";
    if (count === 2) return "bg-orange-400 text-white";
    if (count === 3) return "bg-orange-600 text-white";
    return "bg-orange-800 text-white";
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin">
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-3xl sm:text-4xl font-bold">Reporting</h1>
            <Select value="absence" onValueChange={(v) => {
              if (v === "capacity") navigate("/reporting");
              if (v === "al") navigate("/al-reporting");
            }}>
              <SelectTrigger className="w-44" data-testid="select-report-section">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="capacity">Capacity</SelectItem>
                <SelectItem value="al">Annual Leave</SelectItem>
                <SelectItem value="absence">Absence</SelectItem>
              </SelectContent>
            </Select>
            {activeWorkspace && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                {activeWorkspace.name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setYear(year - 1)}>{year - 1}</Button>
            <span className="text-lg font-bold px-2">{year}</span>
            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setYear(year + 1)}>{year + 1}</Button>
          </div>
        </div>

        {!absenceTask ? (
          <Card className="p-12 text-center">
            <Info className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-xl text-muted-foreground">No "Absent" or "Absence" task found in the system.</p>
          </Card>
        ) : (
          <>
            {/* Monthly heatmap */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {months.map((month) => (
                <Card key={month.name} className="p-3">
                  <h3 className="text-sm font-semibold mb-2 text-center">{month.name}</h3>
                  <div className="grid grid-cols-5 gap-1">
                    {["M", "T", "W", "T", "F"].map((d, i) => (
                      <div key={i} className="text-[10px] text-muted-foreground text-center font-medium">{d}</div>
                    ))}
                    {Array.from({ length: (getDay(month.days[0]) + 6) % 7 }).map((_, i) => {
                      if (i >= 5) return null;
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
                              <div className={cn(
                                "aspect-square rounded-sm transition-colors flex items-center justify-center text-[10px] font-bold select-none",
                                getColorClass(count)
                              )}>
                                {count > 0 && count}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs font-medium">{format(day, "MMM d, yyyy")}</p>
                              <p className="text-xs">{count} absent{count !== 1 ? "" : ""}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>

            {/* Legend */}
            <Card className="p-3">
              <div className="flex items-center justify-center gap-3 text-[10px] sm:text-xs text-muted-foreground">
                <span>Fewer absent</span>
                <div className="flex gap-1">
                  <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-sm bg-muted/30" />
                  <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-sm bg-orange-200" />
                  <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-sm bg-orange-400" />
                  <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-sm bg-orange-600" />
                  <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-sm bg-orange-800" />
                </div>
                <span>More absent</span>
              </div>
            </Card>

            {/* Per-person bar chart */}
            <Card className="p-4 sm:p-6">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                  <Users className="h-5 w-5 text-orange-500" />
                  Absence Summary per Person ({year})
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0 min-h-[300px]">
                {absencePerPerson.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground italic">
                    No absence data recorded for this year.
                  </div>
                ) : (
                  <ChartContainer config={chartConfig} className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={absencePerPerson}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} className="stroke-muted" />
                        <XAxis
                          type="number"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 12 }}
                          label={{ value: "Days", position: "insideBottom", offset: -5, fontSize: 12 }}
                          allowDecimals={false}
                        />
                        <YAxis
                          dataKey="name"
                          type="category"
                          axisLine={false}
                          tickLine={false}
                          width={120}
                          tick={{ fontSize: 11 }}
                          interval={0}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="days" radius={[0, 4, 4, 0]} barSize={24}>
                          {absencePerPerson.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
