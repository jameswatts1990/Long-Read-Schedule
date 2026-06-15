import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X, Save, Copy, Trash2, CheckCircle, AlertCircle, RotateCcw, Link2, Unlink } from "lucide-react";
import { type Assignment, type Person, type Task, type User, type Instrument } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { extractErrorMessage } from "@/lib/extract-error";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { InstrumentMultiSelect } from "@/components/instrument-multi-select";
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
  // Current view's assignments — used to show the linked-group member count.
  assignments?: Assignment[];
}

export function TaskDetailsDrawer({ assignment, people, tasks, open, onClose, slackEnabled = false, assignments = [] }: TaskDetailsDrawerProps) {
  const [batchNumber, setBatchNumber] = useState("");
  const [batchSize, setBatchSize] = useState("");
  const [notes, setNotes] = useState("");
  const [customName, setCustomName] = useState("");
  const [customColor, setCustomColor] = useState("");
  const [slackNotify, setSlackNotify] = useState(0);
  const [slackChangeNotify, setSlackChangeNotify] = useState(0);
  const [instrumentIds, setInstrumentIds] = useState<string[]>([]);
  const [isGeneratingBatchId, setIsGeneratingBatchId] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteGroupConfirm, setShowDeleteGroupConfirm] = useState(false);
  const [showApplyToGroupPrompt, setShowApplyToGroupPrompt] = useState(false);
  const { toast } = useToast();

  const { data: creator } = useQuery<User>({
    queryKey: ['/api/users', assignment?.createdById],
    enabled: !!assignment?.createdById,
  });

  // Shared react-query cache with the instrument view and add dialog.
  const { data: instruments = [] } = useQuery<Instrument[]>({
    queryKey: ["/api/instruments"],
    enabled: open,
  });

  useEffect(() => {
    if (assignment) {
      setBatchNumber(assignment.batchNumber || "");
      setBatchSize(assignment.batchSize ? String(assignment.batchSize) : "");
      setNotes(assignment.notes || "");
      setCustomName(assignment.customName || "");
      setCustomColor((assignment as any).customColor || "");
      setSlackNotify((assignment as any).slackNotify ?? 0);
      setSlackChangeNotify((assignment as any).slackChangeNotify ?? 0);
      setInstrumentIds(assignment.instrumentIds ?? []);
      setShowApplyToGroupPrompt(false);
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
        instrumentIds: snapshot.instrumentIds ?? [],
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

  const groupUpdateMutation = useMutation({
    mutationFn: async (data: { groupId: string; fields: Record<string, unknown> }) => {
      return apiRequest("PATCH", `/api/assignments/group/${data.groupId}`, data.fields);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) =>
        typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/assignments")
      });
      toast({
        title: "Group updated",
        description: "Changes applied to all linked cards",
        variant: "success",
      });
      onClose();
    },
    onError: (error) => {
      toast({ title: "Failed to update group", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/assignments/unlink", { assignmentId: assignment!.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) =>
        typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/assignments")
      });
      toast({ title: "Card unlinked", description: "Removed from its task group" });
      onClose();
    },
    onError: (error) => {
      toast({ title: "Failed to unlink card", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const res = await apiRequest("DELETE", `/api/assignments/group/${groupId}`);
      return res.json() as Promise<{ deletedCount: number }>;
    },
    onSuccess: ({ deletedCount }) => {
      queryClient.invalidateQueries({ predicate: (query) =>
        typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/assignments")
      });
      toast({
        title: "Group deleted",
        description: `${deletedCount} linked assignment${deletedCount !== 1 ? "s" : ""} removed`,
        variant: "destructive",
        icon: <Trash2 className="h-4 w-4 shrink-0 mt-0.5" />,
      });
      onClose();
    },
    onError: (error) => {
      toast({ title: "Failed to delete group", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  const saveSingleCard = () => {
    if (!assignment) return;
    updateMutation.mutate({
      batchNumber: batchNumber || undefined,
      batchSize: batchSize ? parseInt(batchSize, 10) : undefined,
      notes: notes || undefined,
      customName: customName || undefined,
      customColor: customColor || undefined,
      weekStartDate: assignment.weekStartDate,
      slackNotify,
      slackChangeNotify,
      instrumentIds,
    } as any);
  };

  const saveWholeGroup = () => {
    if (!assignment?.linkedGroupId) return;
    const taskForSave = tasks.find((t) => t.id === assignment.taskId);
    const isCustom = taskForSave?.name.toLowerCase() === "custom task";
    // Group updates send null (not undefined) for cleared fields so the
    // clear propagates to every member.
    groupUpdateMutation.mutate({
      groupId: assignment.linkedGroupId,
      fields: {
        batchNumber: batchNumber || null,
        batchSize: batchSize ? parseInt(batchSize, 10) : null,
        notes: notes || null,
        ...(isCustom ? { customName: customName || null, customColor: customColor || null } : {}),
        slackNotify,
        slackChangeNotify,
        instrumentIds,
      },
    });
  };

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

    const hasChanges =
      batchNumber !== (assignment.batchNumber || "") ||
      batchSize !== (assignment.batchSize ? String(assignment.batchSize) : "") ||
      notes !== (assignment.notes || "") ||
      customName !== (assignment.customName || "") ||
      customColor !== ((assignment as any).customColor || "") ||
      slackNotify !== ((assignment as any).slackNotify ?? 0) ||
      slackChangeNotify !== ((assignment as any).slackChangeNotify ?? 0) ||
      JSON.stringify(instrumentIds) !== JSON.stringify(assignment.instrumentIds ?? []);

    // Grouped card with real changes: ask whether to apply them to every
    // linked card before saving anything.
    if (assignment.linkedGroupId && hasChanges) {
      setShowApplyToGroupPrompt(true);
      return;
    }

    saveSingleCard();
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

          {assignment.linkedGroupId && (
            <div className="space-y-2 rounded-md border p-3" data-testid="group-info-block">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Link2 className="w-4 h-4 shrink-0" />
                  <span>
                    Part of a linked group
                    {(() => {
                      const n = assignments.filter((a) => a.linkedGroupId === assignment.linkedGroupId).length;
                      return n > 0 ? ` — ${n} card${n !== 1 ? "s" : ""}` : "";
                    })()}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => unlinkMutation.mutate()}
                  disabled={unlinkMutation.isPending}
                  data-testid="button-unlink-card"
                >
                  <Unlink className="w-3.5 h-3.5 mr-1" />
                  Unlink
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                When you save, you'll be asked whether to apply your changes to all linked cards.
              </p>
            </div>
          )}

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

          {instruments.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Instrument</Label>
              <InstrumentMultiSelect
                instruments={instruments}
                value={instrumentIds}
                onChange={setInstrumentIds}
              />
            </div>
          )}

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
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="drawer-slack-notify"
                  checked={slackNotify === 1}
                  onCheckedChange={(checked) => setSlackNotify(checked ? 1 : 0)}
                />
                <Label htmlFor="drawer-slack-notify" className="cursor-pointer font-normal text-sm flex items-center gap-1">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="currentColor" aria-hidden="true"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>
                  Send Slack reminder on the day of this task
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="drawer-slack-change-notify"
                  checked={slackChangeNotify === 1}
                  onCheckedChange={(checked) => setSlackChangeNotify(checked ? 1 : 0)}
                />
                <Label htmlFor="drawer-slack-change-notify" className="cursor-pointer font-normal text-sm flex items-center gap-1">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="currentColor" aria-hidden="true"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>
                  Get Slack updates when this task is assigned or removed
                </Label>
              </div>
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
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              data-testid="button-delete"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
            </Button>
            {assignment.linkedGroupId && (
              <Button
                variant="outline"
                onClick={() => setShowDeleteGroupConfirm(true)}
                disabled={deleteGroupMutation.isPending}
                data-testid="button-delete-group"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete group</span>
              </Button>
            )}
          </div>
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
      <AlertDialog open={showDeleteGroupConfirm} onOpenChange={setShowDeleteGroupConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete linked task group?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every assignment in the group, including any on other weeks. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setShowDeleteGroupConfirm(false);
                if (assignment.linkedGroupId) deleteGroupMutation.mutate(assignment.linkedGroupId);
              }}
            >
              Delete group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showApplyToGroupPrompt} onOpenChange={setShowApplyToGroupPrompt}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply changes to all linked cards?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const n = assignments.filter((a) => a.linkedGroupId === assignment.linkedGroupId).length;
                return `This card is part of a linked group${n > 0 ? ` of ${n} cards` : ""}. Save your changes to just this card, or to every card in the group.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setShowApplyToGroupPrompt(false);
                saveSingleCard();
              }}
              data-testid="button-save-single-card"
            >
              Only this card
            </Button>
            <AlertDialogAction
              onClick={() => {
                setShowApplyToGroupPrompt(false);
                saveWholeGroup();
              }}
              data-testid="button-save-whole-group"
            >
              All linked cards
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
