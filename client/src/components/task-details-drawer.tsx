import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X, Save, Copy, Trash2, CheckCircle, AlertCircle, RotateCcw } from "lucide-react";
import { type Assignment, type Person, type Task, type User } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { DuplicateAssignmentDialog } from "@/components/duplicate-assignment-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const COLOR_PALETTE: string[][] = [
  ["#FEE2E2","#FFEDD5","#FEF9C3","#ECFCCB","#DCFCE7","#CCFBF1","#CFFAFE","#E0F2FE","#DBEAFE","#E0E7FF","#F3E8FF","#FCE7F3"],
  ["#F87171","#FB923C","#FACC15","#A3E635","#4ADE80","#2DD4BF","#22D3EE","#38BDF8","#60A5FA","#818CF8","#C084FC","#F472B6"],
  ["#991B1B","#7C2D12","#713F12","#365314","#14532D","#134E4A","#164E63","#075985","#1E40AF","#3730A3","#6B21A8","#9D174D"],
];

interface TaskDetailsDrawerProps {
  assignment: Assignment | null;
  people: Person[];
  tasks: Task[];
  open: boolean;
  onClose: () => void;
  slackEnabled?: boolean;
}

export function TaskDetailsDrawer({ assignment, people, tasks, open, onClose, slackEnabled = false }: TaskDetailsDrawerProps) {
  const [batchNumber, setBatchNumber] = useState("");
  const [batchSize, setBatchSize] = useState("");
  const [notes, setNotes] = useState("");
  const [customName, setCustomName] = useState("");
  const [customColor, setCustomColor] = useState("");
  const [slackNotify, setSlackNotify] = useState(0);
  const [isGeneratingBatchId, setIsGeneratingBatchId] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { toast } = useToast();

  const { data: creator } = useQuery<User>({
    queryKey: ['/api/users', assignment?.createdById],
    enabled: !!assignment?.createdById,
  });

  useEffect(() => {
    if (assignment) {
      setBatchNumber(assignment.batchNumber || "");
      setBatchSize(assignment.batchSize ? String(assignment.batchSize) : "");
      setNotes(assignment.notes || "");
      setCustomName(assignment.customName || "");
      setCustomColor((assignment as any).customColor || "");
      setSlackNotify((assignment as any).slackNotify ?? 0);
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
        variant: "success",
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

  const restoreMutation = useMutation({
    mutationFn: async (snapshot: Assignment) => {
      return apiRequest("POST", "/api/assignments", {
        taskId: snapshot.taskId,
        personId: snapshot.personId,
        day: snapshot.day,
        weekStartDate: snapshot.weekStartDate,
        date: snapshot.date,
        batchNumber: snapshot.batchNumber,
        batchSize: snapshot.batchSize,
        notes: snapshot.notes,
        customName: snapshot.customName,
        customColor: (snapshot as any).customColor,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) =>
        typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/assignments")
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (snapshot: Assignment) => {
      return apiRequest("DELETE", `/api/assignments/${snapshot.id}`);
    },
    onSuccess: (_data, snapshot) => {
      queryClient.invalidateQueries({ predicate: (query) =>
        typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/assignments")
      });
      toast({
        title: "Assignment deleted",
        description: "The task has been removed",
        variant: "destructive",
        icon: <Trash2 className="h-4 w-4 shrink-0 mt-0.5" />,
        action: (
          <button
            className="shrink-0 rounded border border-red-300 bg-destructive-foreground px-3 py-1.5 text-xs font-medium text-destructive hover:bg-red-50 flex items-center gap-1.5"
            onClick={() => restoreMutation.mutate(snapshot)}
          >
            <RotateCcw className="h-3 w-3" />
            Undo
          </button>
        ) as any,
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
        variant: "warning",
      });
      return;
    }

    updateMutation.mutate({
      batchNumber: batchNumber || undefined,
      batchSize: batchSize ? parseInt(batchSize, 10) : undefined,
      notes: notes || undefined,
      customName: customName || undefined,
      customColor: customColor || undefined,
      weekStartDate: assignment.weekStartDate,
      slackNotify,
    });
  };

  const handleDelete = () => {
    if (!assignment) return;
    setShowDeleteConfirm(true);
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
      role="dialog"
      aria-modal="true"
      aria-label="Task details"
      className={cn(
        "fixed inset-y-0 right-0 w-full max-w-[42rem] bg-card border-l shadow-xl transform transition-transform duration-300 z-50",
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
            aria-label="Close details"
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
                backgroundColor: task ? `${(assignment as any).customColor ?? task.color}20` : undefined,
                borderLeftColor: (assignment as any).customColor ?? task?.color,
              }}
            >
              <div className="text-sm font-medium">{assignment.customName || task?.name}</div>
              {task?.description && (
                <div className="text-xs text-muted-foreground mt-1">{task.description}</div>
              )}
            </div>
          </div>

          {isCustomTask && (
            <>
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
              <div className="space-y-2">
                <Label className="text-sm font-medium">Task Colour</Label>
                <div className="grid grid-cols-12 gap-1.5">
                  {COLOR_PALETTE.flatMap((row, ri) =>
                    row.map((color, ci) => (
                      <button
                        key={`${ri}-${ci}`}
                        type="button"
                        className={cn(
                          "w-6 h-6 rounded-sm transition-all",
                          customColor === color
                            ? "ring-2 ring-offset-1 ring-foreground"
                            : "hover:ring-2 hover:ring-offset-1 hover:ring-muted-foreground"
                        )}
                        style={{ backgroundColor: color }}
                        onClick={() => setCustomColor(color)}
                        title={color}
                      />
                    ))
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded border shrink-0" style={{ backgroundColor: customColor || task?.color }} />
                  <Input
                    value={customColor}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setCustomColor(v);
                    }}
                    placeholder="#000000"
                    className="font-mono text-sm h-8"
                    maxLength={7}
                  />
                  <input
                    type="color"
                    value={customColor || task?.color || "#93C5FD"}
                    onChange={(e) => setCustomColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border p-0.5"
                    title="Custom colour"
                  />
                </div>
              </div>
            </>
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
                  disabled={isGeneratingBatchId}
                  className="h-6 px-2 text-[10px] uppercase font-bold"
                  onClick={async () => {
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
                    } finally {
                      setIsGeneratingBatchId(false);
                    }
                  }}
                >
                  {isGeneratingBatchId ? "..." : "Auto"}
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

          {slackEnabled && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="drawer-slack-notify"
                checked={slackNotify === 1}
                onCheckedChange={(checked) => setSlackNotify(checked ? 1 : 0)}
              />
              <Label htmlFor="drawer-slack-notify" className="cursor-pointer font-normal text-sm">
                Send Slack reminder on the day of this task
              </Label>
            </div>
          )}

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
                <span>
                  {(() => {
                    const linkedPerson = people.find(p => p.userId === creator.id);
                    if (linkedPerson) return linkedPerson.name;
                    const fullName = `${creator.firstName || ''} ${creator.lastName || ''}`.trim();
                    return fullName || creator.email || 'Unknown';
                  })()}
                </span>
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
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the assignment from the schedule. You can undo this immediately after.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setShowDeleteConfirm(false); deleteMutation.mutate(assignment); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
