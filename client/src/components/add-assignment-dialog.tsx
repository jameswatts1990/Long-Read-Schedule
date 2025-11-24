import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertAssignmentSchema, type Task } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";

interface AddAssignmentDialogProps {
  open: boolean;
  onClose: () => void;
  weekStartDate: string;
  personId: string;
  day: string;
  period: string;
  tasks: Task[];
}

const formSchema = insertAssignmentSchema.omit({ weekStartDate: true, personId: true, day: true, period: true }).extend({
  taskId: z.string().min(1, "Please select a task"),
  batchNumber: z.string().optional(),
  notes: z.string().optional(),
  date: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export function AddAssignmentDialog({ open, onClose, weekStartDate, personId, day, period, tasks }: AddAssignmentDialogProps) {
  const { toast } = useToast();
  const [conflictData, setConflictData] = useState<{ conflicts: any[], conflictCount: number } | null>(null);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);
  const [shouldCloseAfter, setShouldCloseAfter] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      taskId: "",
      batchNumber: "",
      notes: "",
      date: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async ({ data, override = false }: { data: FormData, override?: boolean }) => {
      const res = await apiRequest("POST", "/api/assignments", {
        ...data,
        personId,
        day,
        period,
        weekStartDate,
        batchNumber: data.batchNumber || undefined,
        notes: data.notes || undefined,
        date: data.date || undefined,
        override,
      });
      
      if (res.status === 409) {
        const conflictResponse = await res.json();
        throw { isConflict: true, ...conflictResponse };
      }
      
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({
        title: "Success",
        description: "Assignment created successfully",
      });
      form.reset({
        taskId: "",
        batchNumber: "",
        notes: "",
        date: "",
      });
      setConflictData(null);
      setPendingFormData(null);
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
          title: "Error",
          description: error.message || "Failed to create assignment",
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
        notes: "",
        date: "",
      });
    }
  }, [open, form]);

  const onSubmit = (data: FormData) => {
    setPendingFormData(data);
    createMutation.mutate({ data, override: false });
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent data-testid="dialog-add-assignment">
        <DialogHeader>
          <DialogTitle>Add Task Assignment</DialogTitle>
          <DialogDescription>
            Assign a task for {day} {period}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="taskId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
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

            <FormField
              control={form.control}
              name="batchNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Batch Number (Optional)</FormLabel>
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
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="date"
                      data-testid="input-date"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                <Button
                  type="button"
                  variant="outline"
                  disabled={createMutation.isPending}
                  data-testid="button-submit-and-add-another"
                  onClick={() => {
                    form.handleSubmit(onSubmit)();
                  }}
                >
                  {createMutation.isPending ? "Creating..." : "Create & Add Another"}
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
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
      </DialogContent>

      {/* Conflict Confirmation Dialog */}
      {conflictData && (
        <DialogContent data-testid="dialog-conflict-confirmation">
          <DialogHeader>
            <DialogTitle>Scheduling Conflict Detected</DialogTitle>
            <DialogDescription>
              This person already has {conflictData.conflictCount} assignment(s) in this time slot ({day} {period}).
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
