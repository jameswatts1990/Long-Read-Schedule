import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, Filter, Layers, Download } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { type Assignment, type Task } from "@shared/schema";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, subMonths } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Reporting() {
  const { activeWorkspace } = useWorkspace();

  // Fix Issue 7: default to last 12 months so we never fetch ALL assignments ever recorded
  const defaultFrom = useMemo(() => subMonths(new Date(), 12), []);
  const defaultTo = useMemo(() => new Date(), []);

  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: defaultFrom,
    to: defaultTo,
  });

  // Build query key from date range — server handles the date filtering
  const startDate = dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : "";
  const endDate = dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : "";
  const assignmentQueryKey = startDate && endDate
    ? `/api/assignments?startDate=${startDate}&endDate=${endDate}`
    : "/api/assignments";

  const { data: assignments = [] } = useQuery<Assignment[]>({ queryKey: [assignmentQueryKey] });
  const { data: allTasks = [] } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [chartType, setChartType] = useState<"bar" | "line">("bar");

  // Filter to only production tasks
  const productionTasks = useMemo(() => allTasks.filter(t => (t as any).isProduction !== 0), [allTasks]);

  // Initialize selected tasks if empty
  useMemo(() => {
    if (selectedTaskIds.length === 0 && productionTasks.length > 0) {
      setSelectedTaskIds(productionTasks.map(t => t.id));
    }
  }, [productionTasks]);

  // Server already scoped by date range — only filter by selected tasks client-side
  const filteredAssignments = useMemo(() => {
    return assignments.filter(a => selectedTaskIds.includes(a.taskId));
  }, [assignments, selectedTaskIds]);

  // Group assignments by week
  const assignmentsByWeek = useMemo(() => {
    return filteredAssignments.reduce((acc, assignment) => {
      if (!acc[assignment.weekStartDate]) {
        acc[assignment.weekStartDate] = [];
      }
      acc[assignment.weekStartDate].push(assignment);
      return acc;
    }, {} as Record<string, Assignment[]>);
  }, [filteredAssignments]);

  // Get sorted unique weeks
  const weeks = useMemo(() => Object.keys(assignmentsByWeek).sort(), [assignmentsByWeek]);

  // Calculate totals: for each week/task combo, count unique batch IDs and their sizes
  const getWeekTotal = (weekDate: string, taskId: string): number => {
    const weekAssignments = assignmentsByWeek[weekDate] || [];
    const taskAssignments = weekAssignments.filter(a => a.taskId === taskId);
    
    const uniqueBatches = new Map<string, number>();
    
    taskAssignments.forEach(assignment => {
      // If batchNumber is provided, use it as key to count capacity once per week per batch
      // If no batchNumber, treat as unique to ensure capacity is still counted
      const batchKey = assignment.batchNumber ? `batch-${assignment.batchNumber}` : `assignment-${assignment.id}`;
      if (!uniqueBatches.has(batchKey) && assignment.batchSize) {
        uniqueBatches.set(batchKey, assignment.batchSize);
      }
    });
    
    return Array.from(uniqueBatches.values()).reduce((sum, size) => sum + size, 0);
  };

  // Format date for display (e.g., "Dec 01, 2024")
  const formatWeekDate = (dateStr: string): string => {
    const date = new Date(dateStr + "T00:00:00Z");
    return date.toLocaleDateString("en-US", { 
      month: "short", 
      day: "2-digit", 
      year: "numeric" 
    });
  };

  // Prepare chart data
  const chartData = useMemo(() => {
    return weeks.map(week => {
      const dataPoint: any = { 
        week,
        formattedDate: formatWeekDate(week)
      };
      productionTasks.forEach(task => {
        if (selectedTaskIds.includes(task.id)) {
          dataPoint[task.id] = getWeekTotal(week, task.id);
        }
      });
      return dataPoint;
    });
  }, [weeks, productionTasks, selectedTaskIds, assignmentsByWeek]);

  // Prepare chart config for Shadcn Chart
  const chartConfig = useMemo(() => {
    return productionTasks.reduce((acc, task) => {
      acc[task.id] = {
        label: task.name,
        color: task.color,
      };
      return acc;
    }, {} as any);
  }, [productionTasks]);

  const toggleTask = (taskId: string) => {
    setSelectedTaskIds(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  const exportCsv = () => {
    const visibleTasks = productionTasks.filter(t => selectedTaskIds.includes(t.id));
    const headers = ["Week", ...visibleTasks.map(t => t.name)];
    const rows = weeks.map(week => [
      formatWeekDate(week),
      ...visibleTasks.map(t => String(getWeekTotal(week, t.id))),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `capacity-report-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/admin">
              <Button variant="outline" size="icon" data-testid="button-back-to-admin">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold">Weekly Capacity Report</h1>
              {activeWorkspace && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                  <Layers className="h-3.5 w-3.5" />
                  {activeWorkspace.name}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={chartType} onValueChange={(v) => setChartType(v as any)} className="w-auto">
              <TabsList>
                <TabsTrigger value="bar">Bar</TabsTrigger>
                <TabsTrigger value="line">Line</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={weeks.length === 0} data-testid="button-export-csv">
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2" data-testid="button-date-filter">
                  <Filter className="h-4 w-4" />
                  {dateRange.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "LLL dd")} - {format(dateRange.to, "LLL dd")}
                      </>
                    ) : (
                      format(dateRange.from, "LLL dd")
                    )
                  ) : (
                    "Filter Dates"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange.from}
                  selected={{ from: dateRange.from, to: dateRange.to }}
                  onSelect={(range: any) => setDateRange(range || { from: undefined, to: undefined })}
                  numberOfMonths={2}
                  weekStartsOn={1}
                />
                <div className="p-3 border-t flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setDateRange({ from: undefined, to: undefined })}>
                    Reset
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2" data-testid="button-task-filter">
                  Tasks ({selectedTaskIds.length})
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-4" align="end">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium leading-none">Filter Tasks</h4>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setSelectedTaskIds(selectedTaskIds.length === productionTasks.length ? [] : productionTasks.map(t => t.id))}
                    >
                      {selectedTaskIds.length === productionTasks.length ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    {productionTasks.map((task) => (
                      <div key={task.id} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`task-${task.id}`} 
                          checked={selectedTaskIds.includes(task.id)}
                          onCheckedChange={() => toggleTask(task.id)}
                        />
                        <Label 
                          htmlFor={`task-${task.id}`}
                          className="text-sm font-normal cursor-pointer flex items-center gap-2"
                        >
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: task.color }} />
                          {task.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 gap-6 overflow-hidden">
          <Card className="p-6">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Production Volume by Task
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0 h-[400px] w-full">
              <ChartContainer config={chartConfig} className="w-full h-full">
                {chartType === "bar" ? (
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="formattedDate" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12 }}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend 
                      verticalAlign="top" 
                      height={36} 
                      iconType="circle"
                      formatter={(value) => <span className="text-xs font-medium">{chartConfig[value]?.label || value}</span>}
                    />
                    {productionTasks.map(task => selectedTaskIds.includes(task.id) && (
                      <Bar 
                        key={task.id} 
                        dataKey={task.id} 
                        fill={`var(--color-${task.id})`}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={40}
                      />
                    ))}
                  </BarChart>
                ) : (
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="formattedDate" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12 }}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend 
                      verticalAlign="top" 
                      height={36} 
                      iconType="circle"
                      formatter={(value) => <span className="text-xs font-medium">{chartConfig[value]?.label || value}</span>}
                    />
                    {productionTasks.map(task => selectedTaskIds.includes(task.id) && (
                      <Line 
                        key={task.id} 
                        type="monotone"
                        dataKey={task.id} 
                        stroke={`var(--color-${task.id})`}
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    ))}
                  </LineChart>
                )}
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card className="p-6">
          <CardHeader className="px-0 pt-0">
            <CardTitle>Data Table</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto overflow-y-auto max-h-96">
            {weeks.length === 0 ? (
              <p className="text-muted-foreground p-4 text-center">No assignments match your filters</p>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-background">
                    <th className="text-left p-3 font-semibold min-w-32 sticky top-0 left-0 z-20 bg-background shadow-[1px_0_0_0_rgba(0,0,0,0.1)]">Week Commencing</th>
                    {productionTasks.map((task) => selectedTaskIds.includes(task.id) && (
                      <th 
                        key={task.id} 
                        className="text-left p-3 font-semibold min-w-28 sticky top-0 z-10 bg-background"
                        data-testid={`header-task-${task.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded flex-shrink-0"
                            style={{ backgroundColor: task.color }}
                          />
                          {task.name}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((week) => (
                    <tr key={week} className="border-b hover:bg-muted/50">
                      <td className="p-3 font-medium sticky left-0 z-10 bg-background shadow-[1px_0_0_0_rgba(0,0,0,0.1)]" data-testid={`cell-week-${week}`}>
                        {formatWeekDate(week)}
                      </td>
                      {productionTasks.map((task) => selectedTaskIds.includes(task.id) && (
                        <td 
                          key={`${week}-${task.id}`} 
                          className="p-3"
                          data-testid={`cell-${week}-${task.id}`}
                        >
                          {getWeekTotal(week, task.id) > 0 ? getWeekTotal(week, task.id) : "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
