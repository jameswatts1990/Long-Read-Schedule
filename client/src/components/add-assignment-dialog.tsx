import { useState, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { insertAssignmentSchema, type Task, type Assignment, DAYS } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { applyAssignmentUpsert } from "@/lib/assignment-cache";
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
import { assignmentKeys } from "@/lib/queryKeys";

type RepeatUnit = "days" | "weeks" | "months";
type EndType = "never" | "date" | "occurrences";

interface AddAssignmentDialogProps {
  open: boolean;
  onClose: () => void;
  weekStartDate: string;
  personId: string;
  day: string;
  tasks: Task[];
  isMonthMode?: boolean;
}

const formSchema = insertAssignmentSchema.omit({ weekStartDate: true, personId: true, day: true, date: true }).extend({
  taskId: z.string().min(1, "Please select a task"),
  batchNumber: z.string().optional(),
  batchSize: z.number().int().positive().optional(),
  notes: z.string().optional(),
  customName: z.string().optional(),
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

export function AddAssignmentDialog({ open, onClose, weekStartDate, personId, day, tasks, isMonthMode = false }: AddAssignmentDialogProps) {
  const { toast } = useToast();
  const [conflictData, setConflictData] = useState<{ conflicts: any[], conflictCount: number } | null>(null);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);
  const [shouldCloseAfter, setShouldCloseAfter] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set([day]));
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  
  // Repeat state
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState(1);
  const [repeatUnit, setRepeatUnit] = useState<RepeatUnit>("weeks");
  const [endType, setEndType] = useState<EndType>("occurrences");
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [endOccurrences, setEndOccurrences] = useState(4);
  
  const [isGeneratingBatchId, setIsGeneratingBatchId] = useState(false);
  
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
      taskId: "",
      batchNumber: "",
      batchSize: undefined,
      notes: "",
      customName: "",
    },
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
    let count = 0;
    const maxOccurrences = 365; // Safety limit
    
    while (count < maxOccurrences) {
      // Check end conditions
      if (endType === "occurrences" && dates.length >= endOccurrences) break;
      if (endType === "date" && endDate && isAfter(current, endDate)) break;
      if (endType === "never" && dates.length >= 52) break; // Limit "never" to 52 occurrences
      
      // Only add weekdays
      if (isWeekday(current)) {
        dates.push(current);
      }
      
      count++; // Safety counter to prevent infinite loops
      
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
      // In month mode, we might be creating for multiple dates
      if (isMonthMode && selectedDates.length > 0) {
        // Chunk requests to avoid overwhelming the server or hitting rate limits
        const CHUNK_SIZE = 5;
        const results = [];
        
        for (let i = 0; i < selectedDates.length; i += CHUNK_SIZE) {
          const chunk = selectedDates.slice(i, i + CHUNK_SIZE);
          const chunkPromises = chunk.map(date => {
            const dateStr = format(date, "yyyy-MM-dd");
            const dayName = format(date, "EEEE");
            // Calculate week start date (Monday)
            const weekStart = startOfWeek(date, { weekStartsOn: 1 });
            const weekStartStr = format(weekStart, "yyyy-MM-dd");
            
            return apiRequest("POST", "/api/assignments", {
              ...data,
              personId,
              day: dayName,
              weekStartDate: weekStartStr,
              date: dateStr,
              batchNumber: data.batchNumber || undefined,
              batchSize: data.batchSize || undefined,
              notes: data.notes || undefined,
              customName: data.customName || undefined,
              override,
            });
          });
          
          const chunkResults = await Promise.all(chunkPromises);
          results.push(...chunkResults);
          
          // Small delay between chunks to be safe
          if (i + CHUNK_SIZE < selectedDates.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
        
        const firstRes = results[0];
        return firstRes.json();
      }

      const res = await apiRequest("POST", "/api/assignments", {
        ...data,
        personId,
        day,
        weekStartDate,
        batchNumber: data.batchNumber || undefined,
        batchSize: data.batchSize || undefined,
        notes: data.notes || undefined,
        customName: data.customName || undefined,
        override,
      });
      
      if (res.status === 409) {
        const conflictResponse = await res.json();
        throw { isConflict: true, ...conflictResponse };
      }
      
      return res.json();
    },
    onSuccess: (createdAssignment: Assignment) => {
      applyAssignmentUpsert(queryClient, createdAssignment);
      toast({
        title: "Assignment created",
        description: "Task assigned successfully",
        variant: "default",
      });
      form.reset({
        taskId: "",
        batchNumber: "",
        batchSize: undefined,
        notes: "",
        customName: "",
      });
      setSelectedTaskId("");
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
        taskId: "",
        batchNumber: "",
        batchSize: undefined,
        notes: "",
        customName: "",
      });
      setSelectedTaskId("");
      setSelectedDays(new Set([day]));
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
  }, [open, form, day, isMonthMode, weekStartDate]);

  const onSubmit = async (data: FormData) => {
    setPendingFormData(data);
    
    // Handle repeat assignments
    if (!isMonthMode && repeatEnabled) {
      const daysArray = Array.from(selectedDays);
      const weekStart = parse(weekStartDate, "yyyy-MM-dd", new Date());
      const dayIndexMap: Record<string, number> = {
        "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4
      };
      
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
      
      // Create assignments in chunks
      const CHUNK_SIZE = 5;
      try {
        for (let i = 0; i < allDates.length; i += CHUNK_SIZE) {
          const chunk = allDates.slice(i, i + CHUNK_SIZE);
          const chunkPromises = chunk.map(({ date, dayName }) => {
            const dateStr = format(date, "yyyy-MM-dd");
            const weekStartForDate = startOfWeek(date, { weekStartsOn: 1 });
            const weekStartStr = format(weekStartForDate, "yyyy-MM-dd");
            
            return apiRequest("POST", "/api/assignments", {
              ...data,
              personId,
              day: dayName,
              weekStartDate: weekStartStr,
              date: dateStr,
              batchNumber: data.batchNumber || undefined,
              notes: data.notes || undefined,
              customName: data.customName || undefined,
            });
          });
          
          await Promise.all(chunkPromises);
          
          if (i + CHUNK_SIZE < allDates.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
        
        queryClient.invalidateQueries({ queryKey: assignmentKeys.all });
        toast({
          title: "Recurring assignments created",
          description: `Created ${allDates.length} assignment(s)`,
          variant: "default",
        });
        form.reset();
        setSelectedDays(new Set([day]));
        setRepeatEnabled(false);
        setRepeatOpen(false);
        if (shouldCloseAfter) onClose();
      } catch (error: any) {
        toast({
          title: "Failed to create assignments",
          description: error.message,
          variant: "destructive",
        });
      }
      return;
    }
    
    if (!isMonthMode && selectedDays.size > 1) {
      // Multiple days in week mode (non-repeat)
      const daysArray = Array.from(selectedDays);
      const promises = daysArray.map((d) =>
        apiRequest("POST", "/api/assignments", {
          ...data,
          personId,
          day: d,
          weekStartDate,
          batchNumber: data.batchNumber || undefined,
          notes: data.notes || undefined,
          customName: data.customName || undefined,
        })
      );

      try {
        await Promise.all(promises);
        queryClient.invalidateQueries({ queryKey: assignmentKeys.all });
        toast({
          title: "Assignments created",
          description: `Task assigned to ${daysArray.length} day(s)`,
          variant: "default",
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
    const promises = DAYS.map((d) =>
      apiRequest("POST", "/api/assignments", {
        ...data,
        personId,
        day: d,
        weekStartDate,
        batchNumber: data.batchNumber || undefined,
        notes: data.notes || undefined,
        customName: data.customName || undefined,
      })
    );

    try {
      await Promise.all(promises);
      queryClient.invalidateQueries({ queryKey: assignmentKeys.all });
      toast({
        title: "Assignments created",
        description: `Task assigned to all 5 days`,
        variant: "default",
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
      <DialogContent className={cn("max-w-xl", isMonthMode && "max-w-3xl")} data-testid="dialog-add-assignment">
        <DialogHeader>
          <DialogTitle>Add Task Assignment</DialogTitle>
          <DialogDescription>
            {isMonthMode ? "Assign tasks across the month" : `Assign a task for ${day}`}
          </DialogDescription>
        </DialogHeader>

        <div className={cn("grid gap-6", isMonthMode && "grid-cols-[1fr_300px]")}>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

              {isCustomTask && (
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
                                variant: "destructive",
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
                          {isGeneratingBatchId ? "..." : "Auto"}
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

              {!isMonthMode && (
                <div className="space-y-2">
                  <FormLabel>Days to Assign</FormLabel>
                  <div className="flex flex-wrap gap-3">
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
                        <label htmlFor={`day-${d}`} className="text-sm cursor-pointer">{d}</label>
                      </div>
                    ))}
                  </div>
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
                              This will create {
                                endType === "occurrences" ? endOccurrences :
                                endType === "never" ? "up to 52" : 
                                endDate ? "multiple" : "(select an end date)"
                              } assignments
                            </div>
                            {repeatUnit === "days" && (
                              <div className="text-muted-foreground/70">
                                Note: Only weekdays (Mon-Fri) will be scheduled
                              </div>
                            )}
                            {endType === "date" && !endDate && (
                              <div className="text-destructive">
                                Please select an end date
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              )}

              <div className="flex justify-between gap-2 pt-4">
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
