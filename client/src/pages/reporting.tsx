import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, Filter, Download, Maximize2 } from "lucide-react";
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
import { type Assignment, type Task } from "@shared/schema";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  LineChart,
  Line
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  format,
  subMonths,
  startOfWeek,
  addWeeks,
  startOfMonth,
  addMonths,
  startOfYear,
  addYears
} from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";

// ── colour helpers ────────────────────────────────────────────────────────────

function hexToLinear(c: number) {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hslToRgb(h: number, s: number, l: number) {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = s === 0 ? l : hue2rgb(p, q, h + 1 / 3);
  const g = s === 0 ? l : hue2rgb(p, q, h);
  const b = s === 0 ? l : hue2rgb(p, q, h - 1 / 3);
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

// Darkens a hex colour until it reaches at least 3:1 contrast against white.
function ensureChartContrast(hex: string): string {
  if (!hex || hex.length < 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const L = 0.2126 * hexToLinear(r) + 0.7152 * hexToLinear(g) + 0.0722 * hexToLinear(b);
  if (1.05 / (L + 0.05) >= 3.0) return hex;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  for (let newL = l - 0.05; newL >= 0; newL -= 0.05) {
    const rgb = hslToRgb(h, s, newL);
    const nL = 0.2126 * hexToLinear(rgb.r / 255) + 0.7152 * hexToLinear(rgb.g / 255) + 0.0722 * hexToLinear(rgb.b / 255);
    if (1.05 / (nL + 0.05) >= 3.0) {
      return `#${rgb.r.toString(16).padStart(2, "0")}${rgb.g.toString(16).padStart(2, "0")}${rgb.b.toString(16).padStart(2, "0")}`;
    }
  }
  return "#000000";
}

// Rotates the hue of a hex colour by `degrees`. No-ops on greyscale.
function shiftHue(hex: string, degrees: number): string {
  if (!hex || hex.length < 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return hex; // greyscale — hue shift meaningless
  const l = (max + min) / 2;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  const newH = ((h + degrees / 360) % 1 + 1) % 1;
  const rgb = hslToRgb(newH, s, l);
  return `#${rgb.r.toString(16).padStart(2, "0")}${rgb.g.toString(16).padStart(2, "0")}${rgb.b.toString(16).padStart(2, "0")}`;
}

// ── shared chart panel (used in card and fullscreen dialog) ───────────────────

interface ChartPanelProps {
  chartType: "bar" | "line";
  data: any[];
  config: any;
  tasks: Task[];
  selectedIds: string[];
}

function ChartPanel({ chartType, data, config, tasks, selectedIds }: ChartPanelProps) {
  return (
    <ChartContainer config={config} className="w-full h-full">
      {chartType === "bar" ? (
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="formattedDate" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Legend
            verticalAlign="top"
            height={36}
            iconType="circle"
            formatter={(value) => <span className="text-xs font-medium">{config[value]?.label || value}</span>}
          />
          {tasks.map(task => selectedIds.includes(task.id) && (
            <Bar key={task.id} dataKey={task.id} fill={`var(--color-${task.id})`} radius={[4, 4, 0, 0]} maxBarSize={40} />
          ))}
        </BarChart>
      ) : (
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="formattedDate" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Legend
            verticalAlign="top"
            height={36}
            iconType="circle"
            formatter={(value) => <span className="text-xs font-medium">{config[value]?.label || value}</span>}
          />
          {tasks.map(task => selectedIds.includes(task.id) && (
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
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function Reporting() {
  const { activeWorkspace } = useWorkspace();
  const [, navigate] = useLocation();

  const defaultFrom = useMemo(() => subMonths(new Date(), 12), []);
  const defaultTo = useMemo(() => new Date(), []);

  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: defaultFrom,
    to: defaultTo,
  });
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  const [viewMode, setViewMode] = useState<"weekly" | "monthly" | "yearly">("weekly");
  const [showEmptyPeriods, setShowEmptyPeriods] = useState(false);
  const [chartFullscreen, setChartFullscreen] = useState(false);

  const startDate = dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : "";
  const endDate = dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : "";
  const assignmentQueryKey = startDate && endDate
    ? `/api/assignments?startDate=${startDate}&endDate=${endDate}`
    : "/api/assignments";

  const { data: assignments = [] } = useQuery<Assignment[]>({ queryKey: [assignmentQueryKey] });
  const { data: allTasks = [] } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });

  const productionTasks = useMemo(() => allTasks.filter(t => (t as any).isProduction !== 0), [allTasks]);

  const hasInitializedTasks = useRef(false);

  // Initialise from localStorage once tasks are loaded; fall back to all selected
  useEffect(() => {
    if (hasInitializedTasks.current || productionTasks.length === 0) return;
    hasInitializedTasks.current = true;
    const key = activeWorkspace ? `capacity-report-tasks-${activeWorkspace.id}` : null;
    const stored = key ? localStorage.getItem(key) : null;
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as string[];
        const valid = parsed.filter(id => productionTasks.some(t => t.id === id));
        setSelectedTaskIds(valid.length > 0 ? valid : productionTasks.map(t => t.id));
        return;
      } catch { /* fall through */ }
    }
    setSelectedTaskIds(productionTasks.map(t => t.id));
  }, [productionTasks, activeWorkspace]);

  // Persist selection whenever it changes (after initialisation)
  useEffect(() => {
    if (!hasInitializedTasks.current || !activeWorkspace) return;
    localStorage.setItem(`capacity-report-tasks-${activeWorkspace.id}`, JSON.stringify(selectedTaskIds));
  }, [selectedTaskIds, activeWorkspace]);

  const filteredAssignments = useMemo(
    () => assignments.filter(a => selectedTaskIds.includes(a.taskId)),
    [assignments, selectedTaskIds]
  );

  const assignmentsByWeek = useMemo(() => {
    return filteredAssignments.reduce((acc, assignment) => {
      if (!acc[assignment.weekStartDate]) acc[assignment.weekStartDate] = [];
      acc[assignment.weekStartDate].push(assignment);
      return acc;
    }, {} as Record<string, Assignment[]>);
  }, [filteredAssignments]);

  // Week keys — optionally padded with blank weeks across the date range
  const weeks = useMemo(() => {
    const dataWeeks = Object.keys(assignmentsByWeek);
    if (!showEmptyPeriods || !dateRange.from || !dateRange.to) return dataWeeks.sort();
    const all: string[] = [];
    let cur = startOfWeek(dateRange.from, { weekStartsOn: 1 });
    while (cur <= dateRange.to) {
      all.push(format(cur, "yyyy-MM-dd"));
      cur = addWeeks(cur, 1);
    }
    return Array.from(new Set([...dataWeeks, ...all])).sort();
  }, [assignmentsByWeek, showEmptyPeriods, dateRange]);

  const getWeekTotal = (weekDate: string, taskId: string): number => {
    const weekAssignments = assignmentsByWeek[weekDate] || [];
    const taskAssignments = weekAssignments.filter(a => a.taskId === taskId);
    const uniqueBatches = new Map<string, number>();
    taskAssignments.forEach(assignment => {
      const batchKey = assignment.batchNumber ? `batch-${assignment.batchNumber}` : `assignment-${assignment.id}`;
      if (!uniqueBatches.has(batchKey) && assignment.batchSize) {
        uniqueBatches.set(batchKey, assignment.batchSize);
      }
    });
    return Array.from(uniqueBatches.values()).reduce((sum, size) => sum + size, 0);
  };

  const formatWeekDate = (dateStr: string): string => {
    const date = new Date(dateStr + "T00:00:00Z");
    return date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  };

  // Weekly chart data
  const weeklyChartData = useMemo(() => {
    return weeks.map(week => {
      const row: any = { period: week, formattedDate: formatWeekDate(week) };
      productionTasks.forEach(task => {
        if (selectedTaskIds.includes(task.id)) row[task.id] = getWeekTotal(week, task.id);
      });
      return row;
    });
  }, [weeks, productionTasks, selectedTaskIds, assignmentsByWeek]);

  // Monthly chart data — aggregated from weekly rows
  const monthlyChartData = useMemo(() => {
    const monthMap = new Map<string, any>();

    if (showEmptyPeriods && dateRange.from && dateRange.to) {
      let cur = startOfMonth(dateRange.from);
      const end = startOfMonth(dateRange.to);
      while (cur <= end) {
        const key = format(cur, "yyyy-MM");
        const row: any = { period: key, formattedDate: format(cur, "MMM yyyy") };
        productionTasks.forEach(task => { if (selectedTaskIds.includes(task.id)) row[task.id] = 0; });
        monthMap.set(key, row);
        cur = addMonths(cur, 1);
      }
    }

    weeklyChartData.forEach(weekRow => {
      const key = weekRow.period.substring(0, 7); // "yyyy-MM-dd" → "yyyy-MM"
      if (!monthMap.has(key)) {
        const date = new Date(weekRow.period + "T00:00:00Z");
        const row: any = { period: key, formattedDate: format(date, "MMM yyyy") };
        productionTasks.forEach(task => { if (selectedTaskIds.includes(task.id)) row[task.id] = 0; });
        monthMap.set(key, row);
      }
      const row = monthMap.get(key)!;
      productionTasks.forEach(task => {
        if (selectedTaskIds.includes(task.id)) row[task.id] = (row[task.id] ?? 0) + (weekRow[task.id] ?? 0);
      });
    });

    return Array.from(monthMap.values()).sort((a, b) => a.period.localeCompare(b.period));
  }, [weeklyChartData, showEmptyPeriods, dateRange, productionTasks, selectedTaskIds]);

  // Yearly chart data — aggregated from weekly rows
  const yearlyChartData = useMemo(() => {
    const yearMap = new Map<string, any>();

    if (showEmptyPeriods && dateRange.from && dateRange.to) {
      let cur = startOfYear(dateRange.from);
      const end = startOfYear(dateRange.to);
      while (cur <= end) {
        const key = format(cur, "yyyy");
        const row: any = { period: key, formattedDate: key };
        productionTasks.forEach(task => { if (selectedTaskIds.includes(task.id)) row[task.id] = 0; });
        yearMap.set(key, row);
        cur = addYears(cur, 1);
      }
    }

    weeklyChartData.forEach(weekRow => {
      const key = weekRow.period.substring(0, 4); // "yyyy-MM-dd" → "yyyy"
      if (!yearMap.has(key)) {
        const row: any = { period: key, formattedDate: key };
        productionTasks.forEach(task => { if (selectedTaskIds.includes(task.id)) row[task.id] = 0; });
        yearMap.set(key, row);
      }
      const row = yearMap.get(key)!;
      productionTasks.forEach(task => {
        if (selectedTaskIds.includes(task.id)) row[task.id] = (row[task.id] ?? 0) + (weekRow[task.id] ?? 0);
      });
    });

    return Array.from(yearMap.values()).sort((a, b) => a.period.localeCompare(b.period));
  }, [weeklyChartData, showEmptyPeriods, dateRange, productionTasks, selectedTaskIds]);

  const activeChartData = useMemo(() => {
    if (viewMode === "monthly") return monthlyChartData;
    if (viewMode === "yearly") return yearlyChartData;
    return weeklyChartData;
  }, [viewMode, weeklyChartData, monthlyChartData, yearlyChartData]);

  // Chart config with contrast guarantee and same-colour differentiation
  const chartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    productionTasks.forEach(task => {
      config[task.id] = { label: task.name, color: ensureChartContrast(task.color) };
    });
    const seenColors = new Map<string, number>();
    selectedTaskIds.forEach(id => {
      if (!config[id]) return;
      const base = config[id].color.toLowerCase();
      const count = seenColors.get(base) ?? 0;
      if (count > 0) {
        config[id] = { ...config[id], color: ensureChartContrast(shiftHue(config[id].color, 30 * count)) };
      }
      seenColors.set(base, count + 1);
    });
    return config;
  }, [productionTasks, selectedTaskIds]);

  const toggleTask = (taskId: string) => {
    setSelectedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const exportCsv = () => {
    const visibleTasks = productionTasks.filter(t => selectedTaskIds.includes(t.id));
    const periodLabel = viewMode === "weekly" ? "Week" : viewMode === "monthly" ? "Month" : "Year";
    const headers = [periodLabel, ...visibleTasks.map(t => t.name)];
    const rows = activeChartData.map(row => [
      row.formattedDate,
      ...visibleTasks.map(t => String(row[t.id] ?? 0)),
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

  const periodColumnLabel =
    viewMode === "weekly" ? "Week Commencing" : viewMode === "monthly" ? "Month" : "Year";

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="outline" size="icon" data-testid="button-back-to-admin">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-3xl sm:text-4xl font-bold">Reporting</h1>
            <Select value="capacity" onValueChange={(v) => {
              if (v === "al") navigate("/al-reporting");
              if (v === "absence") navigate("/absence-reporting");
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
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View granularity */}
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="w-auto">
              <TabsList>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
                <TabsTrigger value="yearly">Yearly</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Show empty periods toggle */}
            <div className="flex items-center gap-1.5">
              <Checkbox
                id="show-empty-periods"
                checked={showEmptyPeriods}
                onCheckedChange={(v) => setShowEmptyPeriods(!!v)}
              />
              <Label htmlFor="show-empty-periods" className="text-sm cursor-pointer whitespace-nowrap">
                Show empty periods
              </Label>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2" data-testid="button-date-filter">
                  <Filter className="h-4 w-4" />
                  {dateRange.from ? (
                    dateRange.to ? (
                      <>{format(dateRange.from, "LLL dd")} - {format(dateRange.to, "LLL dd")}</>
                    ) : (
                      format(dateRange.from, "LLL dd")
                    )
                  ) : "Filter Dates"}
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
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: chartConfig[task.id]?.color ?? ensureChartContrast(task.color) }} />
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

        {/* Chart card */}
        <div className="grid grid-cols-1 gap-6 overflow-hidden">
          <Card className="p-6">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Production Volume by Task
                </div>
                <div className="flex items-center gap-2">
                  <Tabs value={chartType} onValueChange={(v) => setChartType(v as any)} className="w-auto">
                    <TabsList>
                      <TabsTrigger value="bar">Bar</TabsTrigger>
                      <TabsTrigger value="line">Line</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Button variant="ghost" size="icon" onClick={() => setChartFullscreen(true)} title="Fullscreen">
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0 h-[400px] w-full">
              <ChartPanel
                chartType={chartType}
                data={activeChartData}
                config={chartConfig}
                tasks={productionTasks}
                selectedIds={selectedTaskIds}
              />
            </CardContent>
          </Card>
        </div>

        {/* Fullscreen chart dialog */}
        <Dialog open={chartFullscreen} onOpenChange={setChartFullscreen}>
          <DialogContent className="w-[95vw] max-w-[95vw] h-[90vh] flex flex-col p-6">
            <div className="flex items-center gap-2 mb-4 shrink-0">
              <BarChart3 className="h-5 w-5 text-primary" />
              <span className="font-semibold">Production Volume by Task</span>
            </div>
            <div className="flex-1 min-h-0">
              <ChartPanel
                chartType={chartType}
                data={activeChartData}
                config={chartConfig}
                tasks={productionTasks}
                selectedIds={selectedTaskIds}
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Data table — auto-expands vertically */}
        <Card className="p-6">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="flex items-center justify-between">
              Data Table
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={activeChartData.length === 0} data-testid="button-export-csv">
                <Download className="h-4 w-4 mr-1.5" />
                Export CSV
              </Button>
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            {activeChartData.length === 0 ? (
              <p className="text-muted-foreground p-4 text-center">No assignments match your filters</p>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-background">
                    <th className="text-left p-3 font-semibold min-w-32 sticky top-0 left-0 z-20 bg-background shadow-[1px_0_0_0_rgba(0,0,0,0.1)]">
                      {periodColumnLabel}
                    </th>
                    {productionTasks.map((task) => selectedTaskIds.includes(task.id) && (
                      <th
                        key={task.id}
                        className="text-left p-3 font-semibold min-w-28 sticky top-0 z-10 bg-background"
                        data-testid={`header-task-${task.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded flex-shrink-0"
                            style={{ backgroundColor: chartConfig[task.id]?.color ?? ensureChartContrast(task.color) }}
                          />
                          {task.name}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeChartData.map((row) => (
                    <tr key={row.period} className="border-b hover:bg-muted/50">
                      <td
                        className="p-3 font-medium sticky left-0 z-10 bg-background shadow-[1px_0_0_0_rgba(0,0,0,0.1)]"
                        data-testid={`cell-week-${row.period}`}
                      >
                        {row.formattedDate}
                      </td>
                      {productionTasks.map((task) => selectedTaskIds.includes(task.id) && (
                        <td
                          key={`${row.period}-${task.id}`}
                          className="p-3"
                          data-testid={`cell-${row.period}-${task.id}`}
                        >
                          {(row[task.id] ?? 0) > 0 ? (row[task.id] ?? 0) : "-"}
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
