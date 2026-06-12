import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle, AlertCircle, ChevronDown, ChevronRight, Loader2, Link2 } from "lucide-react";
import { insertAssignmentSchema, type Task, type Assignment, type Instrument, type Person, DAYS } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { startOfWeek, addDays, addWeeks, addMonths, format, parse, isToday, startOfMonth, endOfMonth, eachDayOfInterval, isBefore, isAfter } from "date-fns";
import { cn } from "@/lib/utils";

type RepeatUnit = "days" | "weeks" | "months";
type EndType = "never" | "date" | "occurrences";

// 12-hue × 3-shade palette shared with admin colour pickers
const COLOR_PALETTE: string[][] = [
  ["#FEE2E2","#FFEDD5","#FEF9C3","#ECFCCB","#DCFCE7","#CCFBF1","#CFFAFE","#E0F2FE","#DBEAFE","#E0E7FF","#F3E8FF","#FCE7F3"],
  ["#F87171","#FB923C","#FACC15","#A3E635","#4ADE80","#2DD4BF","#22D3EE","#38BDF8","#60A5FA","#818CF8","#C084FC","#F472B6"],
  ["#991B1B","#7C2D12","#713F12","#365314","#14532D","#134E4A","#164E63","#075985","#1E40AF","#3730A3","#6B21A8","#9D174D"],
];

interface AddAssignmentDialogProps {
  open: boolean;
  onClose: () => void;
  weekStartDate: string;
  personId?: string;
  people?: Person[];
  day: string;
  tasks: Task[];
  initialTaskId?: string;
  initialInstrumentId?: string;
  isMonthMode?: boolean;
  slackEnabled?: boolean;
}

const formSchema = insertAssignmentSchema.omit({ weekStartDate: true, personId: true, day: true, date: true }).extend({
  taskId: z.string().min(1, "Please select a task"),
  batchNumber: z.string().optional(),
  batchSize: z.number().int().positive().optional(),
  notes: z.string().optional(),
  customName: z.string().optional(),
  customColor: z.string().optional(),
  instrumentId: z.string().optional().nullable(),
}).refine(data => {
  if (data.batchSize !== undefined && data.batchSize !== null && !data.batchNumber) {
    return false;
  }
  return true;
}, {
  message: "Batch ID is required when a batch size is specified",
  path: ["batchNumber"],
});

type FormData = z.infer<typeof formSchema>;

export function AddAssignmentDialog({ open, onClose, weekStartDate, personId = "", people, day, tasks, initialTaskId, initialInstrumentId, isMonthMode = false, slackEnabled = false }: AddAssignmentDialogProps) {
  const { toast } = useToast();
  const [conflictData, setConflictData] = useState<{ conflicts: any[], conflictCount: number } | null>(null);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);
  const [shouldCloseAfter, setShouldCloseAfter] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(initialTaskId || "");
  const [selectedPersonId, setSelectedPersonId] = useState(personId);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set([day]));
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  // When true, all cards created in the same calendar week share a linkedGroupId
  // so they behave as one logical piece of work (move/delete together).
  const [linkDays, setLinkDays] = useState(false);
  
  // Repeat state
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState(1);
  const [repeatUnit, setRepeatUnit] = useState<RepeatUnit>("weeks");
  const [endType, setEndType] = useState<EndType>("occurrences");
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [endOccurrences, setEndOccurrences] = useState(4);
  
  const [isGeneratingBatchId, setIsGeneratingBatchId] = useState(false);

  const effectivePersonId = personId || selectedPersonId;

  const currentMonth = useMemo(() => {
    try {
      return parse(weekStartDate, "yyyy-MM-dd", new Date());
    } catch (e) {
      return new Date();
    }
  }, [weekStartDate]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      taskId: initialTaskId || "",
      batchNumber: "",
      batchSize: undefined,
      notes: "",
      customName: "",
      customColor: undefined,
      instrumentId: initialInstrumentId || null,
      slackNotify: 0,
      slackChangeNotify: 0,
    },
  });

  // Shared react-query cache with the instrument view and admin section — no
  // extra fetch beyond the first time the dialog opens in a session.
  const { data: instruments = [] } = useQuery<Instrument[]>({
    queryKey: ["/api/instruments"],
    enabled: open,
  });

  const selectedTask = tasks.find(t => t.id === selectedTaskId);
  const isCustomTask = selectedTask?.name.toLowerCase() === "custom task";

  // Check if a date is a weekday (Mon-Fri)
  const isWeekday = (date: Date): boolean => {
    const dayOfWeek = date.getDay();
    return dayOfWeek !== 0 && dayOfWeek !== 6; // 0 = Sunday, 6 = Saturday
  };

  // Generate repeat dates based on settings (only weekdays)
  const generateRepeatDates = (startDate: Date): Date[] => {
    if (!repeatEnabled) return [startDate];

    const dates: Date[] = [];
    let current = startDate;
    let safetyCount = 0;
    const maxIterations = 1000; // Safety limit — prevents infinite loops regardless of end condition

    while (safetyCount < maxIterations) {
      // Check end conditions against actual occurrence count, not iteration count
      if (endType === "occurrences" && dates.length >= endOccurrences) break;
      if (endType === "date" && endDate && isAfter(current, endDate)) break;
      if (endType === "never" && dates.length >= 52) break; // Limit "never" to 52 occurrences

      // Only add weekdays
      if (isWeekday(current)) {
        dates.push(current);
      }

      safetyCount++;

      // Calculate next date
      switch (repeatUnit) {
        case "days":
          current = addDays(current, repeatFrequency);
          break;
        case "weeks":
          current = addWeeks(current, repeatFrequency);
          break;
        case "months":
          current = addMonths(current, repeatFrequency);
          break;
      }
    }

    return dates;
  };

  const createMutation = useMutation({
    mutationFn: async ({ data, override = false }: { data: FormData, override?: boolean }) => {
      // In month mode, use the bulk endpoint — one request regardless of date count
      if (isMonthMode && selectedDates.length > 0) {
        const items = selectedDates.map(date => ({
          ...data,
          personId: effectivePersonId,
          day: format(date, "EEEE"),
          weekStartDate: format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd"),
          date: format(date, "yyyy-MM-dd"),
          batchNumber: data.batchNumber || undefined,
          batchSize: data.batchSize || undefined,
          notes: data.notes || undefined,
          customName: data.customName || undefined,
          customColor: data.customColor || undefined,
        }));
        const res = await apiRequest("POST", "/api/assignments/bulk", items);
        const created = await res.json();
        return Array.isArray(created) ? created[0] : created;
      }

      const res = await apiRequest("POST", "/api/assignments", {
        ...data,
        personId: effectivePersonId,
        day,
        weekStartDate,
        batchNumber: data.batchNumber || undefined,
        batchSize: data.batchSize || undefined,
        notes: data.notes || undefined,
        customName: data.customName || undefined,
        customColor: data.customColor || undefined,
        override,
      });
      
      if (res.status === 409) {
        const conflictResponse = await res.json();
        throw { isConflict: true, ...conflictResponse };
      }
      
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/assignments')
      });
      toast({
        title: "Assignment created",
        description: "Task assigned successfully",
        variant: "success",
      });
      form.reset({
        taskId: "",
        batchNumber: "",
        batchSize: undefined,
        notes: "",
        customName: "",
        customColor: undefined,
        instrumentId: null,
        slackNotify: 0,
        slackChangeNotify: 0,
      });
      setSelectedTaskId("");
      setSelectedPersonId(personId);
      setConflictData(null);
      setPendingFormData(null);
      setSelectedDates([]);
      if (shouldCloseAfter) {
        setShouldCloseAfter(false);
        onClose();
      }
    },
    onError: (error: any) => {
      if (error.isConflict) {
        setConflictData({ conflicts: error.conflicts, conflictCount: error.conflictCount });
      } else {
        toast({
          title: "Failed to create assignment",
          description: error.message || "Please check your input and try again",
          variant: "destructive",
        });
      }
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        taskId: initialTaskId || "",
        batchNumber: "",
        batchSize: undefined,
        notes: "",
        customName: "",
        customColor: undefined,
        instrumentId: initialInstrumentId || null,
        slackNotify: 0,
        slackChangeNotify: 0,
      });
      setSelectedTaskId(initialTaskId || "");
      setSelectedPersonId(personId || "");
      setSelectedDays(new Set([day]));
      setLinkDays(false);
      // Reset repeat state
      setRepeatOpen(false);
      setRepeatEnabled(false);
      setRepeatFrequency(1);
      setRepeatUnit("weeks");
      setEndType("occurrences");
      setEndDate(undefined);
      setEndOccurrences(4);
      // Initialize with current date if in month mode
      if (isMonthMode) {
        try {
          const initialDate = parse(weekStartDate, "yyyy-MM-dd", new Date());
          const daysInWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
          const dayOffset = daysInWeek.indexOf(day);
          const actualDate = dayOffset !== -1 ? addDays(initialDate, dayOffset) : initialDate;
          setSelectedDates([actualDate]);
        } catch (e) {
          setSelectedDates([new Date()]);
        }
      }
    }
  }, [open, form, day, isMonthMode, weekStartDate, personId, initialTaskId, initialInstrumentId]);

  const onSubmit = async (data: FormData) => {
    if (!effectivePersonId) {
      toast({ title: "Please select a person", variant: "destructive" });
      return;
    }
    setPendingFormData(data);
    
    // Handle repeat assignments
    if (!isMonthMode && repeatEnabled) {
      const daysArray = Array.from(selectedDays);
      const weekStart = parse(weekStartDate, "yyyy-MM-dd", new Date());
      const dayIndexMap: Record<string, number> = {
        "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4
      };

      // Single UUID shared by all assignments in this series so they can be
      // deleted together via DELETE /api/assignments/series/:seriesId.
      const seriesId = crypto.randomUUID();

      // Linked groups compose with the series: one linkedGroupId per calendar
      // week, so each week's cards act as one piece of work while the series
      // still spans all weeks.
      const linkGroups = linkDays && selectedDays.size >= 2;
      const weekGroupIds = new Map<string, string>();

      // Generate all dates to create assignments for
      const allDates: { date: Date; dayName: string }[] = [];

      for (const dayName of daysArray) {
        const dayOffset = dayIndexMap[dayName] ?? 0;
        const startDate = addDays(weekStart, dayOffset);
        const repeatDates = generateRepeatDates(startDate);

        for (const date of repeatDates) {
          allDates.push({ date, dayName: format(date, "EEEE") });
        }
      }

      // Create assignments in chunks — use allSettled so a partial failure doesn't
      // discard already-created assignments or hide how many succeeded.
      const CHUNK_SIZE = 5;
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < allDates.length; i += CHUNK_SIZE) {
        const chunk = allDates.slice(i, i + CHUNK_SIZE);
        const chunkPromises = chunk.map(({ date, dayName }) => {
          const dateStr = format(date, "yyyy-MM-dd");
          const weekStartForDate = startOfWeek(date, { weekStartsOn: 1 });
          const weekStartStr = format(weekStartForDate, "yyyy-MM-dd");

          let linkedGroupId: string | undefined;
          if (linkGroups) {
            linkedGroupId = weekGroupIds.get(weekStartStr);
            if (!linkedGroupId) {
              linkedGroupId = crypto.randomUUID();
              weekGroupIds.set(weekStartStr, linkedGroupId);
            }
          }

          return apiRequest("POST", "/api/assignments", {
            ...data,
            personId: effectivePersonId,
            day: dayName,
            weekStartDate: weekStartStr,
            date: dateStr,
            seriesId,
            linkedGroupId,
            batchNumber: data.batchNumber || undefined,
            notes: data.notes || undefined,
            customName: data.customName || undefined,
            customColor: data.customColor || undefined,
          });
        });

        const results = await Promise.allSettled(chunkPromises);
        for (const r of results) {
          if (r.status === "fulfilled") successCount++;
          else failCount++;
        }

        if (i + CHUNK_SIZE < allDates.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      queryClient.invalidateQueries({ predicate: (query) =>
        typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/assignments')
      });

      if (failCount === 0) {
        toast({
          title: "Recurring assignments created",
          description: `Created ${successCount} assignment(s)`,
          variant: "success",
        });
      } else if (successCount === 0) {
        toast({
          title: "Failed to create assignments",
          description: `All ${failCount} assignment(s) failed. Please try again.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Partially created",
          description: `Created ${successCount} assignment(s) — ${failCount} failed.`,
          variant: "destructive",
        });
      }

      form.reset();
      setSelectedDays(new Set([day]));
      setRepeatEnabled(false);
      setRepeatOpen(false);
      if (shouldCloseAfter) onClose();
      return;
    }
    
    if (!isMonthMode && selectedDays.size > 1) {
      // Multiple days in week mode (non-repeat)
      const daysArray = Array.from(selectedDays);
      const linkedGroupId = linkDays ? crypto.randomUUID() : undefined;
      const promises = daysArray.map((d) =>
        apiRequest("POST", "/api/assignments", {
          ...data,
          personId: effectivePersonId,
          day: d,
          weekStartDate,
          linkedGroupId,
          batchNumber: data.batchNumber || undefined,
          notes: data.notes || undefined,
          customName: data.customName || undefined,
          customColor: data.customColor || undefined,
        })
      );

      try {
        await Promise.all(promises);
        queryClient.invalidateQueries({ predicate: (query) => 
        typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/assignments')
      });
        toast({
          title: "Assignments created",
          description: `Task assigned to ${daysArray.length} day(s)`,
          variant: "success",
        });
        form.reset();
        setSelectedDays(new Set([day]));
        if (shouldCloseAfter) onClose();
      } catch (error: any) {
        toast({
          title: "Failed to create assignments",
          description: error.message,
          variant: "destructive",
        });
      }
    } else {
      createMutation.mutate({ data, override: false });
    }
  };

  const handleConfirmOverride = () => {
    if (pendingFormData) {
      createMutation.mutate({ data: pendingFormData, override: true });
    }
  };

  const handleCancelConflict = () => {
    setConflictData(null);
    setPendingFormData(null);
  };

  const handleCreateAllWeek = async (data: FormData) => {
    if (!effectivePersonId) {
      toast({ title: "Please select a person", variant: "destructive" });
      return;
    }
    const linkedGroupId = linkDays ? crypto.randomUUID() : undefined;
    const promises = DAYS.map((d) =>
      apiRequest("POST", "/api/assignments", {
        ...data,
        personId: effectivePersonId,
        day: d,
        weekStartDate,
        linkedGroupId,
        batchNumber: data.batchNumber || undefined,
        notes: data.notes || undefined,
        customName: data.customName || undefined,
      })
    );

    try {
      await Promise.all(promises);
      queryClient.invalidateQueries({ predicate: (query) => 
        typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/assignments')
      });
      toast({
        title: "Assignments created",
        description: `Task assigned to all 5 days`,
        variant: "success",
      });
      form.reset();
      onClose();
    } catch (error: any) {
      toast({
        title: "Failed to create assignments",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={cn("max-w-xl flex flex-col max-h-[90vh]", isMonthMode && "max-w-3xl")} data-testid="dialog-add-assignment">
        <DialogHeader className="shrink-0">
          <DialogTitle>Add Task Assignment</DialogTitle>
          <DialogDescription>
            {isMonthMode ? "Assign tasks across the month" : `Assign a task for ${day} ${format(addDays(parse(weekStartDate, "yyyy-MM-dd", new Date()), ["Monday","Tuesday","Wednesday","Thursday","Friday"].indexOf(day)), "dd/MM")}`}
          </DialogDescription>
        </DialogHeader>

        <div className={cn("grid gap-6 flex-1 min-h-0 overflow-y-auto", isMonthMode && "grid-cols-[1fr_300px]")}>
          <Form {...form}>
            <form id="add-assignment-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {!personId && people && people.length > 0 && (
                <FormItem>
                  <FormLabel>Person</FormLabel>
                  <Select value={selectedPersonId} onValueChange={setSelectedPersonId}>
                    <FormControl>
                      <SelectTrigger data-testid="select-person">
                        <SelectValue placeholder="Select a person" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {people.filter(p => !p.excluded).map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: person.color }} />
                            {person.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
              <FormField
                control={form.control}
                name="taskId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Task</FormLabel>
                    <Select 
                      onValueChange={(value) => {
                        field.onChange(value);
                        setSelectedTaskId(value);
                      }} 
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-task">
                          <SelectValue placeholder="Select a task" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {tasks.map((task) => (
                          <SelectItem key={task.id} value={task.id} data-testid={`task-option-${task.id}`}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded"
                                style={{ backgroundColor: task.color }}
                              />
                              {task.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {instruments.length > 0 && (
                <FormField
                  control={form.control}
                  name="instrumentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instrument (Optional)</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === "__none__" ? null : value)}
                        value={field.value ?? "__none__"}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-instrument">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {instruments.map((instrument) => (
                            <SelectItem key={instrument.id} value={instrument.id} data-testid={`instrument-option-${instrument.id}`}>
                              {instrument.name}
                              {(instrument.type || instrument.location) && (
                                <span className="text-muted-foreground"> — {[instrument.type, instrument.location].filter(Boolean).join(" · ")}</span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isCustomTask && (
                <>
                  <FormField
                    control={form.control}
                    name="customName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custom Task Name</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Enter a name for this custom task"
                            data-testid="input-custom-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="customColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Task Colour</FormLabel>
                        <div className="space-y-2">
                          <div className="grid grid-cols-12 gap-1.5">
                            {COLOR_PALETTE.flatMap((row, ri) =>
                              row.map((color, ci) => (
                                <button
                                  key={`${ri}-${ci}`}
                                  type="button"
                                  className={cn(
                                    "w-6 h-6 rounded-sm transition-all",
                                    field.value === color
                                      ? "ring-2 ring-offset-1 ring-foreground"
                                      : "hover:ring-2 hover:ring-offset-1 hover:ring-muted-foreground"
                                  )}
                                  style={{ backgroundColor: color }}
                                  onClick={() => field.onChange(color)}
                                  title={color}
                                />
                              ))
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded border shrink-0" style={{ backgroundColor: field.value }} />
                            <Input
                              value={field.value ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) field.onChange(v);
                              }}
                              placeholder="#000000"
                              className="font-mono text-sm h-8"
                              maxLength={7}
                            />
                            <input
                              type="color"
                              value={field.value ?? "#93C5FD"}
                              onChange={(e) => field.onChange(e.target.value)}
                              className="w-8 h-8 rounded cursor-pointer border p-0.5"
                              title="Custom colour"
                            />
                          </div>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <div className="flex gap-4">
                <FormField
                  control={form.control}
                  name="batchNumber"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <div className="flex items-center justify-between">
                        <FormLabel>Batch Number (Optional)</FormLabel>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isGeneratingBatchId}
                          className="h-6 px-2 text-[10px] uppercase font-bold"
                          onClick={async () => {
                            if (!selectedTaskId) {
                              toast({
                                title: "Task required",
                                description: "Please select a task first",
                                variant: "warning",
                              });
                              return;
                            }
                            const task = tasks.find(t => t.id === selectedTaskId);
                            if (!task) return;
                            
                            try {
                              setIsGeneratingBatchId(true);
                              const res = await apiRequest("GET", "/api/assignments");
                              const allAssignments: Assignment[] = await res.json();
                              
                              // Extract 4-letter prefix
                              const words = task.name.trim().split(/\s+/);
                              let prefix = "";
                              if (words.length >= 2) {
                                prefix = (words[0].substring(0, 2) + words[1].substring(0, 2)).toUpperCase();
                              } else {
                                prefix = words[0].substring(0, 4).toUpperCase();
                              }
                              
                              if (!prefix) return;
                              
                              // Find existing sequence numbers for this task prefix
                              const sequenceNumbers = allAssignments
                                .filter(a => a.batchNumber?.startsWith(`${prefix}-`))
                                .map(a => {
                                  const parts = a.batchNumber?.split("-") || [];
                                  const lastPart = parts[parts.length - 1];
                                  return parseInt(lastPart, 10);
                                })
                                .filter(n => !isNaN(n));
                              
                              const nextSeq = sequenceNumbers.length > 0 ? Math.max(...sequenceNumbers) + 1 : 1;
                              const newBatchId = `${prefix}-${String(nextSeq).padStart(3, '0')}`;
                              
                              form.setValue("batchNumber", newBatchId);
                            } catch (e) {
                              toast({
                                title: "Error",
                                description: "Failed to generate batch ID",
                                variant: "destructive",
                              });
                            } finally {
                              setIsGeneratingBatchId(false);
                            }
                          }}
                        >
                          {isGeneratingBatchId ? <Loader2 className="h-3 w-3 animate-spin" /> : "Auto"}
                        </Button>
                      </div>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="e.g., B-2024-001"
                          data-testid="input-batch-number"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="batchSize"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <div className="flex items-center justify-between">
                        <FormLabel className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 pt-[8.5px] pb-[8.5px]">Batch Size (Optional)</FormLabel>
                        {/* Empty placeholder div to match Batch Number's header height */}
                        <div className="h-6" />
                      </div>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min="1"
                          placeholder="Enter batch size"
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                          data-testid="input-batch-size"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Additional notes..."
                        rows={3}
                        data-testid="input-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {slackEnabled && (
                <div className="space-y-2">
                  <FormField
                    control={form.control}
                    name="slackNotify"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value === 1}
                            onCheckedChange={(checked) => field.onChange(checked ? 1 : 0)}
                            id="slack-notify"
                          />
                        </FormControl>
                        <FormLabel htmlFor="slack-notify" className="cursor-pointer font-normal">
                          <span className="mr-1">
                            <svg viewBox="0 0 24 24" className="inline w-4 h-4 mb-0.5" fill="currentColor" aria-hidden="true"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>
                          </span>
                          Send Slack reminder on the day of this task
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="slackChangeNotify"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value === 1}
                            onCheckedChange={(checked) => field.onChange(checked ? 1 : 0)}
                            id="slack-change-notify"
                          />
                        </FormControl>
                        <FormLabel htmlFor="slack-change-notify" className="cursor-pointer font-normal">
                          <span className="mr-1">
                            <svg viewBox="0 0 24 24" className="inline w-4 h-4 mb-0.5" fill="currentColor" aria-hidden="true"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>
                          </span>
                          Get Slack updates when this task is assigned or removed
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {!isMonthMode && (
                <div className="space-y-2">
                  <FormLabel>Days to Assign</FormLabel>
                  <div className="flex gap-3">
                    {DAYS.map((d) => (
                      <div key={d} className="flex items-center gap-2">
                        <Checkbox
                          id={`day-${d}`}
                          checked={selectedDays.has(d)}
                          onCheckedChange={(checked) => {
                            const newDays = new Set(selectedDays);
                            if (checked) {
                              newDays.add(d);
                            } else {
                              newDays.delete(d);
                            }
                            setSelectedDays(newDays);
                          }}
                          data-testid={`checkbox-day-${d.toLowerCase()}`}
                        />
                        <label htmlFor={`day-${d}`} className="cursor-pointer flex flex-col leading-tight">
                          <span className="text-sm">{d}</span>
                          <span className="text-xs text-muted-foreground">{format(addDays(parse(weekStartDate, "yyyy-MM-dd", new Date()), ["Monday","Tuesday","Wednesday","Thursday","Friday"].indexOf(d)), "dd/MM")}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                  {selectedDays.size >= 2 && (
                    <div className="flex items-start gap-2 pt-1">
                      <Checkbox
                        id="link-days"
                        checked={linkDays}
                        onCheckedChange={(checked) => setLinkDays(checked === true)}
                        data-testid="checkbox-link-days"
                      />
                      <label htmlFor="link-days" className="cursor-pointer flex flex-col leading-tight">
                        <span className="text-sm flex items-center gap-1.5">
                          <Link2 className="w-3.5 h-3.5" />
                          Link these cards as one task group
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Linked cards can be moved and deleted together.
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {!isMonthMode && (
                <Collapsible open={repeatOpen} onOpenChange={setRepeatOpen} className="border rounded-md">
                  <CollapsibleTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full flex items-center justify-between px-4 py-3 h-auto"
                      data-testid="button-repeat-toggle"
                    >
                      <div className="flex items-center gap-2">
                        {repeatOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <span className="font-medium">Repeat</span>
                      </div>
                      {repeatEnabled && (
                        <span className="text-xs text-muted-foreground">
                          Every {repeatFrequency} {repeatUnit}
                        </span>
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-4 pb-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="repeat-enabled"
                        checked={repeatEnabled}
                        onCheckedChange={(checked) => setRepeatEnabled(!!checked)}
                        data-testid="checkbox-repeat-enabled"
                      />
                      <label htmlFor="repeat-enabled" className="text-sm cursor-pointer">
                        Enable recurring assignments
                      </label>
                    </div>
                    
                    {repeatEnabled && (
                      <>
                        <div className="space-y-2">
                          <Label className="text-sm">Repeat every</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="1"
                              max="99"
                              value={repeatFrequency}
                              onChange={(e) => setRepeatFrequency(Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-20"
                              data-testid="input-repeat-frequency"
                            />
                            <Select value={repeatUnit} onValueChange={(v) => setRepeatUnit(v as RepeatUnit)}>
                              <SelectTrigger className="w-28" data-testid="select-repeat-unit">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="days">Day(s)</SelectItem>
                                <SelectItem value="weeks">Week(s)</SelectItem>
                                <SelectItem value="months">Month(s)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm">End</Label>
                          <RadioGroup value={endType} onValueChange={(v) => setEndType(v as EndType)} className="space-y-2">
                            <div className="flex items-center gap-2">
                              <RadioGroupItem value="occurrences" id="end-occurrences" data-testid="radio-end-occurrences" />
                              <Label htmlFor="end-occurrences" className="text-sm font-normal flex items-center gap-2 cursor-pointer">
                                After
                                <Input
                                  type="number"
                                  min="1"
                                  max="365"
                                  value={endOccurrences}
                                  onChange={(e) => setEndOccurrences(Math.max(1, parseInt(e.target.value) || 1))}
                                  className="w-16 h-8"
                                  disabled={endType !== "occurrences"}
                                  data-testid="input-end-occurrences"
                                />
                                occurrence(s)
                              </Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <RadioGroupItem value="date" id="end-date" data-testid="radio-end-date" />
                              <Label htmlFor="end-date" className="text-sm font-normal flex items-center gap-2 cursor-pointer">
                                On date
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={endType !== "date"}
                                      className="h-8"
                                      data-testid="button-end-date-picker"
                                    >
                                      {endDate ? format(endDate, "MMM d, yyyy") : "Select date"}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={endDate}
                                      onSelect={setEndDate}
                                      weekStartsOn={1}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                              </Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <RadioGroupItem value="never" id="end-never" data-testid="radio-end-never" />
                              <Label htmlFor="end-never" className="text-sm font-normal cursor-pointer">
                                No end date (max 52 occurrences)
                              </Label>
                            </div>
                          </RadioGroup>
                        </div>

                        {repeatEnabled && (
                          <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 space-y-1">
                            <div>
                              {(() => {
                                if (endType === "occurrences") return `Will create ${endOccurrences} assignment${endOccurrences !== 1 ? "s" : ""}`;
                                if (endType === "never") return "Will create up to 52 assignments";
                                if (endType === "date" && endDate) {
                                  const dayIndexMap: Record<string, number> = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4 };
                                  const weekStart = parse(weekStartDate, "yyyy-MM-dd", new Date());
                                  const startDate = addDays(weekStart, dayIndexMap[day] ?? 0);
                                  const count = generateRepeatDates(startDate).length;
                                  return `Will create ${count} assignment${count !== 1 ? "s" : ""} (until ${format(endDate, "MMM d, yyyy")})`;
                                }
                                return "Select an end date above";
                              })()}
                            </div>
                            {repeatUnit === "days" && (
                              <div className="text-muted-foreground/70">
                                Note: Only weekdays (Mon-Fri) will be scheduled
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              )}

            </form>
          </Form>

          {isMonthMode && (
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Select Dates</label>
              <div className="border rounded-md p-1 shadow-sm bg-background">
                <Calendar
                  mode="multiple"
                  selected={selectedDates}
                  onSelect={(dates) => setSelectedDates(dates || [])}
                  weekStartsOn={1}
                  initialFocus
                  className="rounded-md"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 text-xs"
                  onClick={() => {
                    const start = startOfMonth(currentMonth);
                    const end = endOfMonth(currentMonth);
                    const days = eachDayOfInterval({ start, end }).filter(date => {
                      const dayName = format(date, "EEEE");
                      return dayName !== "Saturday" && dayName !== "Sunday";
                    });
                    setSelectedDates(days);
                  }}
                >
                  Select All Workdays
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 text-xs"
                  onClick={() => setSelectedDates([])}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2 pt-4 border-t shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            data-testid="button-close"
          >
            Close
          </Button>
          <div className="flex gap-2">
            {!isMonthMode && (
              <Button
                type="button"
                variant="outline"
                disabled={createMutation.isPending || !form.getValues("taskId")}
                data-testid="button-all-week"
                onClick={() => {
                  const data = form.getValues();
                  handleCreateAllWeek(data);
                }}
              >
                All Week
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              form="add-assignment-form"
              disabled={createMutation.isPending || (repeatEnabled && endType === "date" && !endDate)}
              data-testid="button-submit-and-add-another"
              onClick={() => {
                form.handleSubmit(onSubmit)();
              }}
            >
              {createMutation.isPending ? "Creating..." : "Create & Add Another"}
            </Button>
            <Button
              type="submit"
              form="add-assignment-form"
              disabled={createMutation.isPending || (repeatEnabled && endType === "date" && !endDate)}
              data-testid="button-submit-and-close"
              onClick={() => {
                setShouldCloseAfter(true);
              }}
            >
              {createMutation.isPending ? "Creating..." : "Create & Close"}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Conflict Confirmation Dialog */}
      {conflictData && (
        <DialogContent data-testid="dialog-conflict-confirmation">
          <DialogHeader>
            <DialogTitle>Scheduling Conflict Detected</DialogTitle>
            <DialogDescription>
              This person already has {conflictData.conflictCount} assignment(s) on {day}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Creating this assignment will result in a double-booking. Do you want to proceed anyway?
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleCancelConflict}
              data-testid="button-cancel-conflict"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmOverride}
              disabled={createMutation.isPending}
              data-testid="button-confirm-conflict"
            >
              {createMutation.isPending ? "Creating..." : "Create Anyway"}
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
