import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X, Save, Copy, Trash2, CheckCircle, AlertCircle } from "lucide-react";
import { type Assignment, type Person, type Task, type User } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DuplicateAssignmentDialog } from "@/components/duplicate-assignment-dialog";

interface TaskDetailsDrawerProps {
  assignment: Assignment | null;
  people: Person[];
  tasks: Task[];
  open: boolean;
  onClose: () => void;
}

export function TaskDetailsDrawer({ assignment, people, tasks, open, onClose }: TaskDetailsDrawerProps) {
  const [batchNumber, setBatchNumber] = useState("");
  const [batchSize, setBatchSize] = useState("");
  const [notes, setNotes] = useState("");
  const [customName, setCustomName] = useState("");
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const { toast } = useToast();

  const { data: creator } = useQuery<User>({
    queryKey: [`/api/users/${assignment?.createdById}`],
    enabled: !!assignment?.createdById,
  });

  useEffect(() => {
    if (assignment) {
      setBatchNumber(assignment.batchNumber || "");
      setBatchSize(assignment.batchSize ? String(assignment.batchSize) : "");
      setNotes(assignment.notes || "");
      setCustomName(assignment.customName || "");
    }
  }, [assignment]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Assignment>) => {
      if (!assignment) return;
      return apiRequest("PATCH", `/api/assignments/${assignment.id}`, data);
    },
    onSuccess: () => {
      if (assignment) {
        queryClient.invalidateQueries({ predicate: (query) => 
          typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/assignments')
        });
      }
      toast({
        title: "Assignment updated",
        description: "Changes have been saved",
        variant: "default",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Failed to update",
        description: "Could not save your changes",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!assignment) return;
      return apiRequest("DELETE", `/api/assignments/${assignment.id}`);
    },
    onSuccess: () => {
      if (assignment) {
        queryClient.invalidateQueries({ predicate: (query) => 
          typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/assignments')
        });
      }
      toast({
        title: "Assignment deleted",
        description: "The task has been removed",
        variant: "default",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Failed to delete",
        description: "Could not remove the assignment",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (!assignment) return;
    
    // Batch validation
    if (batchSize && !batchNumber) {
      toast({
        title: "Validation error",
        description: "Batch ID is required when a batch size is specified",
        variant: "destructive",
      });
      return;
    }

    updateMutation.mutate({
      batchNumber: batchNumber || undefined,
      batchSize: batchSize ? parseInt(batchSize, 10) : undefined,
      notes: notes || undefined,
      customName: customName || undefined,
      weekStartDate: assignment.weekStartDate,
    });
  };

  const handleDelete = () => {
    if (!assignment) return;
    if (confirm("Are you sure you want to delete this assignment?")) {
      deleteMutation.mutate();
    }
  };

  if (!assignment) return null;

  const person = people.find((p) => p.id === assignment.personId);
  const task = tasks.find((t) => t.id === assignment.taskId);
  const isCustomTask = task?.name.toLowerCase() === "custom task";

  const formatDate = (date: Date | string | null) => {
    if (!date) return "N/A";
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleString();
  };

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
              <div className="text-sm font-medium">{assignment.customName || task?.name}</div>
              {task?.description && (
                <div className="text-xs text-muted-foreground mt-1">{task.description}</div>
              )}
            </div>
          </div>

          {isCustomTask && (
            <div className="space-y-2">
              <Label htmlFor="custom-name" className="text-sm font-medium">
                Custom Task Name
              </Label>
              <Input
                id="custom-name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Enter a custom name"
                data-testid="input-custom-name"
              />
            </div>
          )}

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
            <Label className="text-sm font-medium">Day</Label>
            <div className="text-sm p-3 rounded-md border">
              {assignment.day}
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="batch-number" className="text-sm font-medium">
                  Batch Number
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px] uppercase font-bold"
                  onClick={async () => {
                    if (!task) return;
                    
                    try {
                      const res = await apiRequest("GET", "/api/assignments");
                      const allAssignments: Assignment[] = await res.json();
                      
                      const prefix = task.name.split(" ")[0].toUpperCase();
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
                      
                      setBatchNumber(newBatchId);
                    } catch (e) {
                      toast({
                        title: "Error",
                        description: "Failed to generate batch ID",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Auto
                </Button>
              </div>
              <Input
                id="batch-number"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder="e.g., B2024-001"
                className="font-mono"
                data-testid="input-batch-number"
              />
            </div>

            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between pt-[3.5px] pb-[3.5px]">
                <Label htmlFor="batch-size" className="text-sm font-medium">
                  Batch Size
                </Label>
                {/* Empty placeholder div to match Batch Number's header height */}
                <div className="h-6" />
              </div>
              <Input
                id="batch-size"
                type="number"
                min="1"
                value={batchSize}
                onChange={(e) => setBatchSize(e.target.value)}
                placeholder="Enter batch size"
                data-testid="input-batch-size"
              />
            </div>
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

          <div className="pt-6 border-t space-y-4">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="font-medium">Created</span>
              <span>{formatDate(assignment.createdAt)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="font-medium">Last Updated</span>
              <span>{formatDate(assignment.updatedAt)}</span>
            </div>
            {creator && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="font-medium">Created By</span>
                <span>{creator.firstName} {creator.lastName}</span>
              </div>
            )}
          </div>
        </div>

        <div className="h-14 border-t flex items-center justify-between gap-2 px-4 shrink-0">
          <Button
            variant="outline"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            data-testid="button-delete"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDuplicateDialog(true)}
              data-testid="button-duplicate"
            >
              <Copy className="w-4 h-4" />
              <span>Duplicate</span>
            </Button>
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
      <DuplicateAssignmentDialog
        assignment={assignment}
        people={people}
        weekStartDate={assignment.weekStartDate}
        open={showDuplicateDialog}
        onClose={() => setShowDuplicateDialog(false)}
      />
    </div>
  );
}
