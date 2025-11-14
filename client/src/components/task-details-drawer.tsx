import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { X, Save } from "lucide-react";
import { type Assignment, type Person, type Task } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface TaskDetailsDrawerProps {
  assignment: Assignment | null;
  people: Person[];
  tasks: Task[];
  open: boolean;
  onClose: () => void;
}

export function TaskDetailsDrawer({ assignment, people, tasks, open, onClose }: TaskDetailsDrawerProps) {
  const [batchNumber, setBatchNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (assignment) {
      setBatchNumber(assignment.batchNumber || "");
      setNotes(assignment.notes || "");
      setDate(assignment.date || "");
    }
  }, [assignment]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Assignment>) => {
      if (!assignment) return;
      return apiRequest("PATCH", `/api/assignments/${assignment.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      onClose();
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      batchNumber: batchNumber || undefined,
      notes: notes || undefined,
      date: date || undefined,
    });
  };

  if (!assignment) return null;

  const person = people.find((p) => p.id === assignment.personId);
  const task = tasks.find((t) => t.id === assignment.taskId);

  return (
    <div
      className={cn(
        "fixed inset-y-0 right-0 w-96 bg-card border-l shadow-xl transform transition-transform duration-300 z-50",
        open ? "translate-x-0" : "translate-x-full"
      )}
      data-testid="drawer-task-details"
    >
      <div className="h-full flex flex-col">
        <div className="h-14 border-b flex items-center justify-between px-4 shrink-0">
          <h2 className="text-lg font-semibold">Task Details</h2>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            data-testid="button-close-drawer"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Task</Label>
            <div
              className="p-3 rounded-md border-l-4"
              style={{
                backgroundColor: task ? `${task.color}20` : undefined,
                borderLeftColor: task?.color,
              }}
            >
              <div className="text-sm font-medium">{task?.name}</div>
              {task?.description && (
                <div className="text-xs text-muted-foreground mt-1">{task.description}</div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Assigned To</Label>
            <div className="flex items-center gap-2 p-3 rounded-md border">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: person?.color }}
              />
              <span className="text-sm font-medium">{person?.name}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Time Slot</Label>
            <div className="text-sm p-3 rounded-md border">
              {assignment.day} - {assignment.period}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="batch-number" className="text-sm font-medium">
              Batch Number
            </Label>
            <Input
              id="batch-number"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              placeholder="e.g., B2024-001"
              className="font-mono"
              data-testid="input-batch-number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="date" className="text-sm font-medium">
              Date
            </Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              data-testid="input-date"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm font-medium">
              Notes
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any relevant notes..."
              className="h-32 resize-none"
              data-testid="input-notes"
            />
          </div>
        </div>

        <div className="h-14 border-t flex items-center justify-end gap-2 px-4 shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            data-testid="button-save"
          >
            <Save className="w-4 h-4" />
            <span>Save</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
