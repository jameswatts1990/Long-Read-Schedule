import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, ArrowLeft, Pencil, GripVertical, Eye, EyeOff, UserCheck, UserX, Layers, Users, X, Loader2, CalendarClock, Megaphone, CheckCircle, Info, AlertTriangle, Bell, Wrench, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DAYS, type Person, type Task, type User, type Workspace, type RotaTask, type SiteAnnouncement } from "@shared/schema";


// Full-spectrum palette: 12 hues (Red→Pink) × 3 shades (light / mid / dark)
// Columns: Red, Orange, Yellow, Lime, Green, Teal, Cyan, Sky, Blue, Indigo, Purple, Pink
const COLOR_PALETTE: string[][] = [
  ["#FEE2E2","#FFEDD5","#FEF9C3","#ECFCCB","#DCFCE7","#CCFBF1","#CFFAFE","#E0F2FE","#DBEAFE","#E0E7FF","#F3E8FF","#FCE7F3"],
  ["#F87171","#FB923C","#FACC15","#A3E635","#4ADE80","#2DD4BF","#22D3EE","#38BDF8","#60A5FA","#818CF8","#C084FC","#F472B6"],
  ["#991B1B","#7C2D12","#713F12","#365314","#14532D","#134E4A","#164E63","#075985","#1E40AF","#3730A3","#6B21A8","#9D174D"],
];

const personFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  color: z.string().min(1, "Color is required"),
});

const taskFormSchema = z.object({
  name: z.string().min(1, "Task name is required"),
  color: z.string().min(1, "Color is required"),
  description: z.string().optional(),
  isProduction: z.coerce.boolean().default(true),
  requiredDaily: z.coerce.boolean().default(false),
  showInPipelineView: z.coerce.boolean().default(false),
});

const rotaTaskFormSchema = z.object({
  name: z.string().min(1, "Rota task name is required"),
  taskId: z.string().min(1, "Task is required"),
  frequency: z.enum(["daily", "weekly"]),
  day: z.enum(DAYS),
  startDate: z.string().min(1, "Start date is required"),
  personIds: z.array(z.string()).min(1, "Add at least one person to the rota order"),
  intervalWeeks: z.preprocess(
    (value) => (value === "" || value === undefined) ? 1 : value,
    z.coerce.number().int().min(1).max(52).default(1),
  ),
  weekLimit: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.coerce.number().int().min(1, "Minimum 1 week").max(500, "Maximum 500 weeks").optional(),
  ),
});

type PersonFormData = z.infer<typeof personFormSchema>;
type TaskFormData = z.infer<typeof taskFormSchema>;
type RotaTaskFormData = z.infer<typeof rotaTaskFormSchema>;

const extractErrorMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : "Unexpected error";
  const colonIdx = raw.indexOf(": ");
  return colonIdx !== -1 ? raw.slice(colonIdx + 2) : raw;
};

type WorkspaceMember = User & { role: string };

function WorkspaceManagementSection({ currentUser }: { currentUser: User | null }) {
  const { toast } = useToast();
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [managingWorkspace, setManagingWorkspace] = useState<Workspace | null>(null);
  const [addingUserId, setAddingUserId] = useState<string>("");
  const [addingUserRole, setAddingUserRole] = useState<string>("member");

  const { data: workspaces = [], isLoading } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces"],
  });
  const { data: allUsers = [] } = useQuery<User[]>({ queryKey: ["/api/admin/users"] });
  const { data: workspaceMembers = [] } = useQuery<WorkspaceMember[]>({
    queryKey: ["/api/workspaces", managingWorkspace?.id, "members"],
    enabled: !!managingWorkspace,
  });

  const wsForm = useForm<{ name: string; description: string }>({
    defaultValues: { name: "", description: "" },
  });

  const createWsMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      const res = await apiRequest("POST", "/api/workspaces", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      toast({ title: "Workspace created" });
      wsForm.reset();
      setShowCreateWorkspace(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create workspace", 
        description: error.message || "Unknown error", 
        variant: "destructive" 
      });
    },
  });

  const updateWsMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      const res = await apiRequest("PUT", `/api/workspaces/${editingWorkspace!.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      toast({ title: "Workspace updated" });
      setEditingWorkspace(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update workspace", 
        description: error.message || "Unknown error", 
        variant: "destructive" 
      });
    },
  });

  const deleteWsMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/workspaces/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      toast({ title: "Workspace deleted" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to delete workspace", 
        description: error.message || "Unknown error", 
        variant: "destructive" 
      });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async ({ workspaceId, userId, role }: { workspaceId: string; userId: string; role: string }) => {
      const res = await apiRequest("POST", `/api/workspaces/${workspaceId}/members`, { userId, role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", managingWorkspace?.id, "members"] });
      toast({ title: "Member added" });
      setAddingUserId("");
      setAddingUserRole("member");
    },
    onError: () => toast({ title: "Failed to add member", variant: "destructive" }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({ workspaceId, userId }: { workspaceId: string; userId: string }) => {
      const res = await apiRequest("DELETE", `/api/workspaces/${workspaceId}/members/${userId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", managingWorkspace?.id, "members"] });
      toast({ title: "Member removed" });
    },
    onError: () => toast({ title: "Failed to remove member", variant: "destructive" }),
  });

  const handleEditWorkspace = (ws: Workspace) => {
    setEditingWorkspace(ws);
    wsForm.reset({ name: ws.name, description: ws.description || "" });
  };

  const nonMembers = allUsers.filter(u => !workspaceMembers.find(m => m.id === u.id));

  if (isLoading) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5" />
          <h2 className="text-2xl font-bold">Workspaces</h2>
        </div>
        <Button onClick={() => { setShowCreateWorkspace(true); wsForm.reset({ name: "", description: "" }); }} data-testid="button-create-workspace">
          <Plus className="h-4 w-4 mr-2" />
          Create Workspace
        </Button>
      </div>

      <div className="space-y-3">
        {workspaces.length === 0 ? (
          <Card className="p-6">
            <p className="text-muted-foreground text-sm">No workspaces yet. Create one to get started.</p>
          </Card>
        ) : (
          workspaces.map((ws) => (
            <Card key={ws.id} className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold" data-testid={`text-workspace-name-${ws.id}`}>{ws.name}</p>
                  {ws.description && <p className="text-sm text-muted-foreground mt-0.5">{ws.description}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="default"
                    onClick={() => setManagingWorkspace(ws)}
                    data-testid={`button-manage-members-${ws.id}`}
                  >
                    <Users className="h-4 w-4 mr-1.5" />
                    Members
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleEditWorkspace(ws)} data-testid={`button-edit-workspace-${ws.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm(`Delete workspace "${ws.name}"? This will delete all data in it.`)) {
                        deleteWsMutation.mutate(ws.id);
                      }
                    }}
                    disabled={deleteWsMutation.isPending}
                    data-testid={`button-delete-workspace-${ws.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Create/Edit Workspace Dialog */}
      <Dialog
        open={showCreateWorkspace || !!editingWorkspace}
        onOpenChange={(open) => { if (!open) { setShowCreateWorkspace(false); setEditingWorkspace(null); } }}
      >
        <DialogContent data-testid="dialog-workspace-form">
          <DialogHeader>
            <DialogTitle>{editingWorkspace ? "Edit Workspace" : "Create Workspace"}</DialogTitle>
            <DialogDescription>
              {editingWorkspace ? "Update workspace details." : "Create a new isolated workspace for a team."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={wsForm.handleSubmit((data) => {
              if (editingWorkspace) {
                updateWsMutation.mutate(data);
              } else {
                createWsMutation.mutate(data);
              }
            })}
            className="space-y-4"
          >
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input {...wsForm.register("name", { required: true })} placeholder="e.g. Genomics Lab Team" data-testid="input-workspace-name" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Textarea {...wsForm.register("description")} placeholder="Brief description of this workspace..." rows={2} data-testid="input-workspace-description" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setShowCreateWorkspace(false); setEditingWorkspace(null); }}>Cancel</Button>
              <Button type="submit" disabled={createWsMutation.isPending || updateWsMutation.isPending} data-testid="button-submit-workspace">
                {createWsMutation.isPending || updateWsMutation.isPending ? "Saving..." : editingWorkspace ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manage Members Dialog */}
      <Dialog open={!!managingWorkspace} onOpenChange={(open) => { if (!open) setManagingWorkspace(null); }}>
        <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0 overflow-hidden" data-testid="dialog-manage-members">
          <div className="p-6 pb-0">
            <DialogHeader>
              <DialogTitle>Manage Members — {managingWorkspace?.name}</DialogTitle>
              <DialogDescription>Add or remove users from this workspace.</DialogDescription>
            </DialogHeader>

            {/* Add member section at top for better usability */}
            {nonMembers.length > 0 && (
              <div className="space-y-2 py-4">
                <p className="text-sm font-medium">Add Member</p>
                <div className="flex gap-2">
                  <Select value={addingUserId} onValueChange={setAddingUserId}>
                    <SelectTrigger className="flex-1" data-testid="select-add-member-user">
                      <SelectValue placeholder="Select user..." />
                    </SelectTrigger>
                    <SelectContent>
                      {nonMembers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.email || `${u.firstName} ${u.lastName}`.trim() || u.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={addingUserRole} onValueChange={setAddingUserRole}>
                    <SelectTrigger className="w-28" data-testid="select-add-member-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => {
                      if (!addingUserId) return;
                      addMemberMutation.mutate({ workspaceId: managingWorkspace!.id, userId: addingUserId, role: addingUserRole });
                    }}
                    disabled={!addingUserId || addMemberMutation.isPending}
                    data-testid="button-confirm-add-member"
                  >
                    {addMemberMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Separator />

          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="px-6 py-3 border-b bg-muted/30">
              <p className="text-sm font-medium flex items-center justify-between">
                Current Members
                <Badge variant="outline" className="ml-2">{workspaceMembers.length}</Badge>
              </p>
            </div>
            
            <ScrollArea className="flex-1">
              <div className="p-6 pt-2 space-y-1.5">
                {workspaceMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">No members yet.</p>
                ) : (
                  workspaceMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-2 border rounded-md gap-2 hover:bg-muted/50 transition-colors" data-testid={`member-row-${member.id}`}>
                      <div className="min-w-0 flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold shrink-0">
                          {(member.email?.[0] || member.firstName?.[0] || "?").toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate leading-none mb-1">{member.email || `${member.firstName} ${member.lastName}`.trim() || member.id}</p>
                          <Badge variant="secondary" className="text-[10px] h-4 px-1 py-0 font-normal">{(member as any).role}</Badge>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeMemberMutation.mutate({ workspaceId: managingWorkspace!.id, userId: member.id })}
                        disabled={removeMemberMutation.isPending}
                        data-testid={`button-remove-member-${member.id}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RotaTasksSection({ people, tasks }: { people: Person[]; tasks: Task[] }) {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editingRotaTask, setEditingRotaTask] = useState<RotaTask | null>(null);
  const [draggedRosterPersonId, setDraggedRosterPersonId] = useState<string | null>(null);
  const [rosterSearch, setRosterSearch] = useState("");

  const { data: rotaTasks = [] } = useQuery<RotaTask[]>({ queryKey: ["/api/rota-tasks"] });

  const rotaTaskForm = useForm<RotaTaskFormData>({
    resolver: zodResolver(rotaTaskFormSchema),
    defaultValues: {
      name: "",
      taskId: "",
      frequency: "weekly",
      day: "Monday",
      startDate: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })(),
      personIds: [],
      intervalWeeks: 1,
      weekLimit: undefined,
    },
  });

  const freshStartDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const createRotaTaskMutation = useMutation({
    mutationFn: async (data: RotaTaskFormData) => {
      const res = await apiRequest("POST", "/api/rota-tasks", {
        ...data,
        weekLimit: data.weekLimit ?? null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rota-tasks"] });
      toast({ title: "Rota task created", description: "The rotation is now active for this workspace." });
      setShowDialog(false);
      rotaTaskForm.reset({
        name: "", taskId: "", frequency: "weekly", day: "Monday",
        startDate: freshStartDate(), personIds: [], intervalWeeks: 1, weekLimit: undefined,
      });
    },
    onError: (error: unknown) =>
      toast({ title: "Failed to create rota task", description: extractErrorMessage(error), variant: "destructive" }),
  });

  const updateRotaTaskMutation = useMutation({
    mutationFn: async (data: RotaTaskFormData) => {
      if (!editingRotaTask) throw new Error("No rota task selected");
      const res = await apiRequest("PUT", `/api/rota-tasks/${editingRotaTask.id}`, {
        ...data,
        weekLimit: data.weekLimit ?? null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rota-tasks"] });
      toast({ title: "Rota task updated" });
      setShowDialog(false);
      setEditingRotaTask(null);
      rotaTaskForm.reset({
        name: "", taskId: "", frequency: "weekly", day: "Monday",
        startDate: freshStartDate(), personIds: [], intervalWeeks: 1, weekLimit: undefined,
      });
    },
    onError: (error: unknown) =>
      toast({ title: "Failed to update rota task", description: extractErrorMessage(error), variant: "destructive" }),
  });

  const deleteRotaTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/rota-tasks/${id}`);
      return res.json();
    },
    onSuccess: (data: { deletedAssignments?: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rota-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      const removedAssignments = data?.deletedAssignments ?? 0;
      toast({
        title: "Rota task removed",
        description: removedAssignments > 0
          ? `${removedAssignments} scheduled assignment${removedAssignments === 1 ? "" : "s"} removed.`
          : "Future repeats will stop immediately.",
      });
    },
    onError: (error: unknown) =>
      toast({ title: "Failed to delete rota task", description: extractErrorMessage(error), variant: "destructive" }),
  });

  const personIds = rotaTaskForm.watch("personIds");
  const selectedTaskId = rotaTaskForm.watch("taskId");

  const addPersonToRoster = (personId: string) => {
    if (personIds.includes(personId)) return;
    rotaTaskForm.setValue("personIds", [...personIds, personId], { shouldValidate: true });
  };

  const removePersonFromRoster = (personId: string) => {
    rotaTaskForm.setValue("personIds", personIds.filter((id) => id !== personId), { shouldValidate: true });
  };

  const movePersonWithinRoster = (fromPersonId: string, targetPersonId: string) => {
    if (fromPersonId === targetPersonId) return;
    const next = personIds.filter((id) => id !== fromPersonId);
    const targetIndex = next.findIndex((id) => id === targetPersonId);
    if (targetIndex < 0) return;
    next.splice(targetIndex, 0, fromPersonId);
    rotaTaskForm.setValue("personIds", next, { shouldValidate: true });
  };

  const getRotationPreview = (rotaTask: RotaTask) => {
    if (rotaTask.archivedAt) return "Archived";
    const orderedPeople = rotaTask.personIds
      .map((personId) => people.find((person) => person.id === personId))
      .filter((person): person is Person => Boolean(person));

    if (!orderedPeople.length) return "No people assigned";

    // Compute Monday of rotaTask.startDate week (UTC, matching server logic)
    const getMondayOf = (d: Date): Date => {
      const copy = new Date(d);
      copy.setUTCHours(0, 0, 0, 0);
      const dow = copy.getUTCDay();
      const diff = dow === 0 ? -6 : 1 - dow;
      copy.setUTCDate(copy.getUTCDate() + diff);
      return copy;
    };

    const startMonday = getMondayOf(new Date(`${rotaTask.startDate}T00:00:00Z`));
    const thisMonday = getMondayOf(new Date());
    const diffMs = thisMonday.getTime() - startMonday.getTime();
    const weeksSinceStart = Math.max(0, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)));
    const intervalWeeks = rotaTask.intervalWeeks ?? 1;

    if (weeksSinceStart % intervalWeeks !== 0) return "Off this week";

    const turnIndex = Math.floor(weeksSinceStart / intervalWeeks);
    const person = orderedPeople[turnIndex % orderedPeople.length];
    return `This week: ${person.name}`;
  };

  const activeRotaTasks = rotaTasks.filter((rotaTask) => !rotaTask.archivedAt);
  const archivedRotaTasks = rotaTasks.filter((rotaTask) => Boolean(rotaTask.archivedAt));

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <CalendarClock className="h-6 w-6" />
            Rota Tasks
          </h2>
          <p className="text-sm text-muted-foreground">
            Build an ordered rota from workspace people and link it to an existing task.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingRotaTask(null);
            rotaTaskForm.reset({
              name: "",
              taskId: selectedTaskId || "",
              frequency: "weekly",
              day: "Monday",
              startDate: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })(),
              personIds: [],
              intervalWeeks: 1,
              weekLimit: undefined,
            });
            setShowDialog(true);
          }}
          data-testid="button-add-rota-task"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Rota Task
        </Button>
      </div>

      {rotaTasks.length === 0 ? (
        <p className="text-muted-foreground text-sm">No rota tasks configured yet.</p>
      ) : (
        <Tabs defaultValue="active" className="space-y-3">
          <TabsList>
            <TabsTrigger value="active">Active ({activeRotaTasks.length})</TabsTrigger>
            <TabsTrigger value="archived">Archive ({archivedRotaTasks.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="space-y-3">
            {activeRotaTasks.length === 0 && (
              <p className="text-muted-foreground text-sm">No active rota tasks.</p>
            )}
            {activeRotaTasks.map((rotaTask) => {
              const linkedTask = tasks.find((task) => task.id === rotaTask.taskId);
              const names = rotaTask.personIds
                .map((personId) => people.find((person) => person.id === personId)?.name)
                .filter(Boolean) as string[];
              return (
                <div key={rotaTask.id} className="rounded-lg border p-4" data-testid={`rota-task-item-${rotaTask.id}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="font-semibold">{rotaTask.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Task: {linkedTask?.name || "Unknown"} · {rotaTask.frequency === "daily" ? "Daily (all week)" : `Weekly on ${rotaTask.day}`}{(rotaTask.intervalWeeks ?? 1) > 1 ? ` · every ${rotaTask.intervalWeeks} weeks` : ""}
                      </p>
                      <p className="text-sm text-muted-foreground">Start date: {rotaTask.startDate}</p>
                      {rotaTask.weekLimit && (
                        <p className="text-sm text-muted-foreground">Ends after {rotaTask.weekLimit} week{rotaTask.weekLimit === 1 ? "" : "s"}.</p>
                      )}
                      <p className="text-sm">{getRotationPreview(rotaTask)}</p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {names.map((name) => (
                          <Badge key={name} variant="secondary">{name}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingRotaTask(rotaTask);
                          rotaTaskForm.reset({
                            name: rotaTask.name,
                            taskId: rotaTask.taskId,
                            frequency: rotaTask.frequency as "daily" | "weekly",
                            day: rotaTask.day as typeof DAYS[number],
                            startDate: rotaTask.startDate,
                            personIds: rotaTask.personIds,
                            intervalWeeks: rotaTask.intervalWeeks ?? 1,
                            weekLimit: rotaTask.weekLimit ?? undefined,
                          });
                          setShowDialog(true);
                        }}
                        data-testid={`button-edit-rota-task-${rotaTask.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (!window.confirm("Delete this rota and remove all its scheduled assignments? This cannot be undone.")) return;
                          deleteRotaTaskMutation.mutate(rotaTask.id);
                        }}
                        disabled={deleteRotaTaskMutation.isPending}
                        data-testid={`button-delete-rota-task-${rotaTask.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </TabsContent>
          <TabsContent value="archived" className="space-y-3">
            {archivedRotaTasks.length === 0 && (
              <p className="text-muted-foreground text-sm">No archived rota tasks yet.</p>
            )}
            {archivedRotaTasks.map((rotaTask) => {
            const linkedTask = tasks.find((task) => task.id === rotaTask.taskId);
            const names = rotaTask.personIds
              .map((personId) => people.find((person) => person.id === personId)?.name)
              .filter(Boolean) as string[];
            return (
              <div key={rotaTask.id} className="rounded-lg border p-4" data-testid={`rota-task-item-${rotaTask.id}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-semibold">{rotaTask.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Task: {linkedTask?.name || "Unknown"} · {rotaTask.frequency === "daily" ? "Daily (all week)" : `Weekly on ${rotaTask.day}`}{(rotaTask.intervalWeeks ?? 1) > 1 ? ` · every ${rotaTask.intervalWeeks} weeks` : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">Start date: {rotaTask.startDate}</p>
                    {rotaTask.weekLimit && (
                      <p className="text-sm text-muted-foreground">Completed after {rotaTask.weekLimit} week{rotaTask.weekLimit === 1 ? "" : "s"}.</p>
                    )}
                    <p className="text-sm">{getRotationPreview(rotaTask)}</p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {names.map((name) => (
                        <Badge key={name} variant="secondary">{name}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (!window.confirm("Delete this archived rota and remove any linked scheduled assignments? This cannot be undone.")) return;
                        deleteRotaTaskMutation.mutate(rotaTask.id);
                      }}
                      disabled={deleteRotaTaskMutation.isPending}
                      data-testid={`button-delete-rota-task-${rotaTask.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
            })}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) { setShowDialog(false); setEditingRotaTask(null); setRosterSearch(""); } }}>
        <DialogContent className="w-[95vw] max-w-4xl" data-testid="dialog-rota-task">
          <DialogHeader>
            <DialogTitle>{editingRotaTask ? "Edit Rota Task" : "Create Rota Task"}</DialogTitle>
            <DialogDescription>
              Choose a linked task, set cadence, then build the ordered list of people.
            </DialogDescription>
          </DialogHeader>
          <Form {...rotaTaskForm}>
            <form onSubmit={rotaTaskForm.handleSubmit((data) => editingRotaTask ? updateRotaTaskMutation.mutate(data) : createRotaTaskMutation.mutate(data))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={rotaTaskForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rota Task Name</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. Bench opening rota" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={rotaTaskForm.control}
                  name="taskId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Linked Task</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select a task..." /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {tasks.map((task) => <SelectItem key={task.id} value={task.id}>{task.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={rotaTaskForm.control}
                  name="frequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assignment cadence</FormLabel>
                      <Select value={field.value} onValueChange={(value: "daily" | "weekly") => field.onChange(value)}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="daily">Daily (Mon-Fri)</SelectItem>
                          <SelectItem value="weekly">Weekly (one day)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {field.value === "daily"
                          ? "On active weeks the current person is assigned Mon-Fri."
                          : "On active weeks the current person is assigned on the chosen day only."}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={rotaTaskForm.control}
                  name="intervalWeeks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Repeat every N weeks</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min={1}
                          max={52}
                          placeholder="1"
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        1 = every week; 2 = every other week; 3 = active week 1, skip 2-3, active week 4…
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {rotaTaskForm.watch("frequency") === "weekly" && (
                  <FormField
                    control={rotaTaskForm.control}
                    name="day"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assignment day</FormLabel>
                        <Select value={field.value} onValueChange={(value: typeof DAYS[number]) => field.onChange(value)}>
                          <FormControl>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {DAYS.map((day) => <SelectItem key={day} value={day}>{day}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={rotaTaskForm.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rotation start date</FormLabel>
                      <FormControl><Input {...field} type="date" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={rotaTaskForm.control}
                  name="weekLimit"
                  render={({ field }) => (
                    <FormItem className={rotaTaskForm.watch("frequency") === "weekly" ? "" : "col-span-2"}>
                      <FormLabel>End after N weeks (optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={500}
                          placeholder="Leave blank to keep repeating"
                          value={field.value ?? ""}
                          onChange={(event) => {
                            const val = event.target.value;
                            field.onChange(val === "" ? undefined : Number(val));
                          }}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Once this many scheduled assignments are created, the rota automatically moves to Archive.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Card className="p-3">
                  <p className="font-medium mb-2">Available people</p>
                  <Input
                    placeholder="Search..."
                    value={rosterSearch}
                    onChange={(e) => setRosterSearch(e.target.value)}
                    className="h-7 text-sm mb-2"
                  />
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {people
                      .filter((person) => !personIds.includes(person.id))
                      .filter((person) => rosterSearch === "" || person.name.toLowerCase().includes(rosterSearch.toLowerCase()))
                      .map((person) => (
                        <button
                          type="button"
                          key={person.id}
                          className="w-full flex items-center justify-between rounded-md border px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                          onClick={() => addPersonToRoster(person.id)}
                        >
                          <span>{person.name}</span>
                          <Plus className="h-4 w-4 text-muted-foreground" />
                        </button>
                      ))}
                    {people.filter((p) => !personIds.includes(p.id)).length > 0 &&
                      people.filter((p) => !personIds.includes(p.id)).filter((p) => p.name.toLowerCase().includes(rosterSearch.toLowerCase())).length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-2">No matches</p>
                      )}
                  </div>
                </Card>
                <Card className="p-3">
                  <FormField
                    control={rotaTaskForm.control}
                    name="personIds"
                    render={() => (
                      <FormItem>
                        <FormLabel>Rota order (drag to reorder)</FormLabel>
                        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                          {personIds.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Add people from the left.</p>
                          ) : (
                            personIds.map((personId) => {
                              const person = people.find((entry) => entry.id === personId);
                              if (!person) return null;
                              return (
                                <div
                                  key={person.id}
                                  draggable
                                  onDragStart={() => setDraggedRosterPersonId(person.id)}
                                  onDragEnd={() => setDraggedRosterPersonId(null)}
                                  onDragOver={(event) => event.preventDefault()}
                                  onDrop={() => {
                                    if (draggedRosterPersonId) {
                                      movePersonWithinRoster(draggedRosterPersonId, person.id);
                                    }
                                  }}
                                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 cursor-move hover:bg-muted/50"
                                >
                                  <div className="flex items-center gap-2">
                                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                                    <span>{person.name}</span>
                                  </div>
                                  <Button type="button" variant="ghost" size="icon" onClick={() => removePersonFromRoster(person.id)}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              );
                            })
                          )}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </Card>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => { setShowDialog(false); setEditingRotaTask(null); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createRotaTaskMutation.isPending || updateRotaTaskMutation.isPending}>
                  {createRotaTaskMutation.isPending || updateRotaTaskMutation.isPending ? "Saving..." : editingRotaTask ? "Update Rota Task" : "Create Rota Task"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const ANNOUNCEMENT_TYPE_OPTIONS = [
  { value: "info", label: "Info", icon: <Info className="h-4 w-4 text-blue-500" /> },
  { value: "warning", label: "Warning", icon: <AlertTriangle className="h-4 w-4 text-amber-500" /> },
  { value: "success", label: "Success", icon: <CheckCircle className="h-4 w-4 text-green-500" /> },
  { value: "error", label: "Alarm", icon: <Bell className="h-4 w-4 text-red-500" /> },
  { value: "announcement", label: "Announcement", icon: <Megaphone className="h-4 w-4 text-purple-500" /> },
  { value: "maintenance", label: "Maintenance", icon: <Wrench className="h-4 w-4 text-orange-500" /> },
  { value: "update", label: "Update", icon: <Sparkles className="h-4 w-4 text-teal-500" /> },
];

type AnnouncementType = "info" | "warning" | "success" | "error" | "announcement" | "maintenance" | "update";

function toDatetimeLocal(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "";
  const Y = dt.getFullYear();
  const M = String(dt.getMonth() + 1).padStart(2, "0");
  const D = String(dt.getDate()).padStart(2, "0");
  const h = String(dt.getHours()).padStart(2, "0");
  const m = String(dt.getMinutes()).padStart(2, "0");
  return `${Y}-${M}-${D}T${h}:${m}`;
}

function formatDateShort(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function AnnouncementsSection() {
  const { toast } = useToast();
  const [newMessage, setNewMessage] = useState("");
  const [newType, setNewType] = useState<AnnouncementType>("info");
  const [newStartsAt, setNewStartsAt] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [editType, setEditType] = useState<AnnouncementType>("info");
  const [editStartsAt, setEditStartsAt] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");

  const { data: announcements = [], isLoading } = useQuery<SiteAnnouncement[]>({
    queryKey: ["/api/site-announcements"],
  });

  const createMutation = useMutation({
    mutationFn: async (params: { message: string; type: string; startsAt: string | null; expiresAt: string | null }) => {
      const res = await apiRequest("POST", "/api/site-announcements", params);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/site-announcement/active"] });
      toast({ title: "Announcement created", variant: "success" });
      setNewMessage("");
      setNewStartsAt("");
      setNewExpiresAt("");
    },
    onError: (error: unknown) => {
      toast({ title: "Failed to create announcement", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/site-announcements/${id}/activate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/site-announcement/active"] });
      toast({ title: "Announcement activated", variant: "success" });
    },
    onError: (error: unknown) => {
      toast({ title: "Failed to activate", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/site-announcements/${id}/deactivate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/site-announcement/active"] });
      toast({ title: "Announcement deactivated" });
    },
    onError: (error: unknown) => {
      toast({ title: "Failed to deactivate", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/site-announcements/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/site-announcement/active"] });
      toast({ title: "Announcement deleted" });
    },
    onError: (error: unknown) => {
      toast({ title: "Failed to delete", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async (params: { id: string; message: string; type: string; startsAt: string | null; expiresAt: string | null }) => {
      const { id, ...body } = params;
      const res = await apiRequest("PATCH", `/api/site-announcements/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/site-announcement/active"] });
      toast({ title: "Announcement updated", variant: "success" });
      setEditingId(null);
    },
    onError: (error: unknown) => {
      toast({ title: "Failed to update", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!newMessage.trim()) return;
    createMutation.mutate({ message: newMessage, type: newType, startsAt: newStartsAt || null, expiresAt: newExpiresAt || null });
  };

  const handleSaveEdit = (id: string) => {
    if (!editMessage.trim()) return;
    editMutation.mutate({ id, message: editMessage, type: editType, startsAt: editStartsAt || null, expiresAt: editExpiresAt || null });
  };

  const datetimeInputClass = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <Megaphone className="h-5 w-5" />
        <h2 className="text-2xl font-bold">Announcements</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Display a sitewide notification bar for all users. Only one announcement can be active at a time. Set start/expiry dates to schedule announcements automatically.
      </p>

      {/* Create form */}
      <div className="space-y-3 mb-8 p-4 border rounded-lg bg-muted/30">
        <h3 className="text-sm font-semibold">New announcement</h3>
        <div className="flex gap-2">
          <Select value={newType} onValueChange={(v) => setNewType(v as AnnouncementType)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANNOUNCEMENT_TYPE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="flex items-center gap-2">{opt.icon}{opt.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Enter announcement message..."
            className="flex-1"
            onKeyDown={(e) => { if (e.key === "Enter" && newMessage.trim()) handleCreate(); }}
          />
          <Button onClick={handleCreate} disabled={!newMessage.trim() || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </Button>
        </div>
        <div className="flex gap-3 items-end">
          <CalendarClock className="h-4 w-4 text-muted-foreground shrink-0 mb-2" />
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-muted-foreground">Starts at (optional)</label>
            <input type="datetime-local" value={newStartsAt} onChange={(e) => setNewStartsAt(e.target.value)} className={datetimeInputClass} />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-muted-foreground">Expires at (optional)</label>
            <input type="datetime-local" value={newExpiresAt} onChange={(e) => setNewExpiresAt(e.target.value)} className={datetimeInputClass} />
          </div>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : announcements.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No announcements yet</p>
      ) : (
        <div className="space-y-2">
          {announcements.map((ann) => {
            const typeOpt = ANNOUNCEMENT_TYPE_OPTIONS.find(o => o.value === ann.type) ?? ANNOUNCEMENT_TYPE_OPTIONS[0];
            const isEditing = editingId === ann.id;
            return (
              <div
                key={ann.id}
                className={`flex flex-col gap-2 p-3 rounded-lg border ${ann.isActive ? "border-primary bg-primary/5" : ""}`}
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="flex gap-2 items-center">
                      <Select value={editType} onValueChange={(v) => setEditType(v as AnnouncementType)}>
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ANNOUNCEMENT_TYPE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <span className="flex items-center gap-2">{opt.icon}{opt.label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={editMessage}
                        onChange={(e) => setEditMessage(e.target.value)}
                        className="flex-1"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && editMessage.trim()) handleSaveEdit(ann.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <Button size="sm" onClick={() => handleSaveEdit(ann.id)} disabled={!editMessage.trim() || editMutation.isPending}>
                        {editMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                    <div className="flex gap-3 items-end pl-1">
                      <CalendarClock className="h-4 w-4 text-muted-foreground shrink-0 mb-2" />
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-muted-foreground">Starts at</label>
                        <input type="datetime-local" value={editStartsAt} onChange={(e) => setEditStartsAt(e.target.value)} className={datetimeInputClass} />
                      </div>
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-muted-foreground">Expires at</label>
                        <input type="datetime-local" value={editExpiresAt} onChange={(e) => setEditExpiresAt(e.target.value)} className={datetimeInputClass} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-3">
                      {typeOpt.icon}
                      <span className="flex-1 text-sm">{ann.message}</span>
                      {ann.isActive && (
                        <Badge variant="default" className="text-xs">Active</Badge>
                      )}
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(ann.id);
                            setEditMessage(ann.message);
                            setEditType(ann.type as AnnouncementType);
                            setEditStartsAt(toDatetimeLocal(ann.startsAt));
                            setEditExpiresAt(toDatetimeLocal(ann.expiresAt));
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {ann.isActive ? (
                          <Button size="sm" variant="outline" onClick={() => deactivateMutation.mutate(ann.id)} disabled={deactivateMutation.isPending}>
                            <EyeOff className="h-3.5 w-3.5 mr-1" />
                            Deactivate
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => activateMutation.mutate(ann.id)} disabled={activateMutation.isPending}>
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            Activate
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(ann.id)}
                          disabled={deleteMutation.isPending}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {(ann.startsAt || ann.expiresAt) && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-7">
                        <CalendarClock className="h-3 w-3 shrink-0" />
                        {ann.startsAt && <span>From {formatDateShort(ann.startsAt)}</span>}
                        {ann.startsAt && ann.expiresAt && <span>·</span>}
                        {ann.expiresAt && <span>Until {formatDateShort(ann.expiresAt)}</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function Admin() {
  const { toast } = useToast();
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskIndex, setDragOverTaskIndex] = useState<number | null>(null);
  const [activeSection, setActiveSection] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("section");
    return (s === "people" || s === "tasks" || s === "rota" || s === "workspaces" || s === "announcements") ? s : "people";
  });

  const handleSectionChange = (section: string) => {
    setActiveSection(section);
    history.replaceState(null, "", `/admin?section=${section}`);
  };

  const { data: people = [] } = useQuery<Person[]>({ queryKey: ["/api/people"] });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: allUsers = [] } = useQuery<User[]>({ queryKey: ["/api/admin/users"] });
  const { data: currentUser } = useQuery<User & { isSuperAdmin?: boolean }>({ queryKey: ["/api/auth/user"] });
  const isSuperAdmin = currentUser?.isSuperAdmin === true;
  const isAdminUser = currentUser?.role === 'admin' || currentUser?.role === 'super_admin' || currentUser?.isSuperAdmin === true;

  const personForm = useForm<PersonFormData>({
    resolver: zodResolver(personFormSchema),
    defaultValues: {
      name: "",
      color: COLOR_PALETTE[0][0], // light red
    },
  });

  const taskForm = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      name: "",
      color: COLOR_PALETTE[0][0], // light red
      description: "",
      isProduction: true,
      requiredDaily: false,
      showInPipelineView: false,
    },
  });

  const createPersonMutation = useMutation({
    mutationFn: async (data: PersonFormData) => {
      const res = await apiRequest("POST", "/api/people", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ title: "Team member added", description: "Person added to the team", variant: "success" });
      personForm.reset();
      setShowAddPerson(false);
    },
    onError: (error: unknown) => {
      toast({ title: "Failed to add person", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  const updatePersonMutation = useMutation({
    mutationFn: async (data: PersonFormData) => {
      if (!editingPerson) throw new Error("No person selected");
      const res = await apiRequest("PUT", `/api/people/${editingPerson.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ title: "Team member updated", description: "Changes have been saved", variant: "success" });
      personForm.reset();
      setEditingPerson(null);
    },
    onError: (error: unknown) => {
      toast({ title: "Failed to update person", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: TaskFormData) => {
      const res = await apiRequest("POST", "/api/tasks", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task added", description: "New task is now available", variant: "success" });
      taskForm.reset({
        name: "",
        color: COLOR_PALETTE[0][0],
        description: "",
        isProduction: true,
        requiredDaily: false,
        showInPipelineView: false,
      });
      setShowAddTask(false);
    },
    onError: (error: unknown) => {
      toast({ title: "Failed to add task", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (data: TaskFormData) => {
      if (!editingTask) throw new Error("No task selected");
      const res = await apiRequest("PUT", `/api/tasks/${editingTask.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task updated", description: "Changes have been saved", variant: "success" });
      taskForm.reset({
        name: "",
        color: COLOR_PALETTE[0][0],
        description: "",
        isProduction: true,
        requiredDaily: false,
        showInPipelineView: false,
      });
      setEditingTask(null);
    },
    onError: (error: unknown) => {
      toast({ title: "Failed to update task", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  const deletePersonMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/people/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ title: "Person deleted", description: "Team member has been removed", variant: "destructive" });
    },
    onError: (error: unknown) => {
      toast({ title: "Failed to delete person", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  const reorderPersonMutation = useMutation({
    mutationFn: async (personIds: string[]) => {
      const res = await apiRequest("POST", `/api/people/reorder-list`, { personIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reorder people", variant: "destructive" });
    },
  });

  const toggleExcludedMutation = useMutation({
    mutationFn: async (personId: string) => {
      const res = await apiRequest("PATCH", `/api/people/${personId}/toggle-excluded`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ title: "Availability updated", description: "Exclusion status changed", variant: "success" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update exclusion status", variant: "destructive" });
    },
  });

  const reorderTaskMutation = useMutation({
    mutationFn: async (taskIds: string[]) => {
      const res = await apiRequest("POST", `/api/tasks/reorder-list`, { taskIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reorder tasks", variant: "destructive" });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/tasks/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task deleted", description: "Task has been removed", variant: "destructive" });
    },
    onError: (error: unknown) => {
      toast({ title: "Failed to delete task", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  const linkUserMutation = useMutation({
    mutationFn: async ({ personId, userId }: { personId: string; userId: string | null }) => {
      const res = await apiRequest("PATCH", `/api/people/${personId}/link-user`, { userId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ title: "User link updated", description: "The user has been linked to this team member" });
    },
    onError: (error: any) => {
      const msg = error?.message || "Failed to link user";
      const serverMsg = msg.includes(":") ? msg.split(": ").slice(1).join(": ") : msg;
      let description = "Failed to link user";
      try {
        const parsed = JSON.parse(serverMsg);
        description = parsed.error || description;
      } catch { description = serverMsg || description; }
      toast({ title: "Error", description, variant: "destructive" });
    },
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User level updated" });
    },
    onError: (error: unknown) => {
      toast({ title: "Failed to update user level", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  const [editingSlackId, setEditingSlackId] = useState<string | null>(null);
  const [slackIdDraft, setSlackIdDraft] = useState("");
  const [slackIdError, setSlackIdError] = useState<string | null>(null);

  const updateSlackUserIdMutation = useMutation({
    mutationFn: async ({ personId, slackUserId }: { personId: string; slackUserId: string | null }) => {
      const res = await apiRequest("PATCH", `/api/people/${personId}/slack-user-id`, { slackUserId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      setEditingSlackId(null);
      toast({ title: "Slack user ID updated" });
    },
    onError: (error: unknown) => {
      toast({ title: "Failed to update Slack user ID", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  const testSlackDMMutation = useMutation({
    mutationFn: async (personId: string) => {
      const res = await apiRequest("POST", `/api/people/${personId}/slack-test`, {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to send test DM");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Test DM sent", description: "Check Slack for the test message." });
    },
    onError: (error: unknown) => {
      toast({ title: "Test DM failed", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  const refreshAppHomeMutation = useMutation({
    mutationFn: async (personId: string) => {
      const res = await apiRequest("POST", `/api/people/${personId}/slack-refresh-home`, {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to publish App Home");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "App Home refreshed", description: "Check the Home tab in your Slack app." });
    },
    onError: (error: unknown) => {
      toast({ title: "App Home refresh failed", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  const handleEditPerson = (person: Person) => {
    setEditingPerson(person);
    personForm.reset({ name: person.name, color: person.color });
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    taskForm.reset({
      name: task.name,
      color: task.color,
      description: task.description || "",
      isProduction: Boolean(task.isProduction),
      requiredDaily: Boolean(task.requiredDaily),
      showInPipelineView: Boolean(task.showInPipelineView),
    });
  };

  const linkedUserIds = new Set(
    people
      .filter((person) => person.userId)
      .map((person) => person.userId as string),
  );

  const getAvailableUsersForPerson = (person: Person) =>
    allUsers.filter((user) => {
      if (person.userId && user.id === person.userId) return true;
      return !linkedUserIds.has(user.id);
    });

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="outline" size="icon" data-testid="button-back-to-scheduler">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-4xl font-bold">Admin</h1>
            <Select value={activeSection} onValueChange={handleSectionChange}>
              <SelectTrigger className="w-44" data-testid="select-admin-section">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="people">People</SelectItem>
                <SelectItem value="tasks">Tasks</SelectItem>
                <SelectItem value="rota">Rota</SelectItem>
                {isSuperAdmin && <SelectItem value="workspaces">Workspaces</SelectItem>}
                {isAdminUser && <SelectItem value="announcements">Announcements</SelectItem>}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* People section */}
        {activeSection === "people" && (
          <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">People</h2>
            <Button onClick={() => { setEditingPerson(null); setShowAddPerson(true); }} data-testid="button-add-person">
              <Plus className="h-4 w-4 mr-2" />
              Add Person
            </Button>
          </div>

          <div className="space-y-2">
            {people.length === 0 ? (
              <p className="text-muted-foreground">No people added yet</p>
            ) : (
              <div className="space-y-0">
                {draggedId && dragOverIndex === -1 && (
                  <div className="h-1 bg-primary mb-0.5"></div>
                )}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverIndex(-1);
                  }}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={() => {
                    if (draggedId) {
                      const newOrder = people.filter(p => p.id !== draggedId).map(p => p.id);
                      newOrder.unshift(draggedId);
                      reorderPersonMutation.mutate(newOrder);
                    }
                    setDragOverIndex(null);
                  }}
                  className="h-1"
                />
                {people.map((person, index) => (
                  <div key={person.id}>
                    {draggedId && dragOverIndex === index && draggedId !== person.id && (
                      <div className="h-1 bg-primary mb-0.5"></div>
                    )}
                    <div
                      draggable
                      onDragStart={() => setDraggedId(person.id)}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setDragOverIndex(null);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverIndex(index);
                      }}
                      onDragLeave={() => setDragOverIndex(null)}
                      onDrop={() => {
                        if (draggedId && draggedId !== person.id) {
                          const filteredPeople = people.filter(p => p.id !== draggedId);
                          const newOrder = [...filteredPeople.map(p => p.id)];
                          newOrder.splice(index, 0, draggedId);
                          reorderPersonMutation.mutate(newOrder);
                        }
                        setDragOverIndex(null);
                      }}
                      className={`flex items-center justify-between p-3 border rounded-md hover-elevate cursor-move transition-opacity mb-2 ${
                        draggedId === person.id ? "opacity-50" : ""
                      }`}
                      data-testid={`person-item-${person.id}`}
                    >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div
                        className="w-6 h-6 rounded flex-shrink-0"
                        style={{ backgroundColor: person.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{person.name}</span>
                          {person.userId ? (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <UserCheck className="h-3 w-3 text-green-500" />
                              {allUsers.find(u => u.id === person.userId)?.email || "linked"}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <UserX className="h-3 w-3 text-orange-400" />
                              not linked
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={person.userId || "__none__"}
                            onValueChange={(value) => {
                              linkUserMutation.mutate({
                                personId: person.id,
                                userId: value === "__none__" ? null : value,
                              });
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs w-48" data-testid={`select-link-user-${person.id}`}>
                              <SelectValue placeholder="Link to user account..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">No user linked</SelectItem>
                              {getAvailableUsersForPerson(person).map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  {user.email || `${user.firstName} ${user.lastName}`.trim() || user.id}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {person.userId && (() => {
                            const linkedUser = allUsers.find(u => u.id === person.userId);
                            if (!linkedUser) return null;
                            return (
                              <Select
                                value={(linkedUser as any).role || "member"}
                                onValueChange={(role) => updateUserRoleMutation.mutate({ userId: linkedUser.id, role })}
                              >
                                <SelectTrigger className="h-7 text-xs w-32" data-testid={`select-user-role-${person.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="member">Member</SelectItem>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="super_admin">Super Admin</SelectItem>
                                </SelectContent>
                              </Select>
                            );
                          })()}
                        </div>
                        {(currentUser as any)?.slackEnabled && (
                          <div className="mt-1 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                            {editingSlackId === person.id ? (
                              <>
                                <div className="flex items-center gap-2">
                                  <input
                                    className={`h-7 text-xs border rounded px-2 w-40 bg-background ${slackIdError ? "border-destructive" : ""}`}
                                    placeholder="Slack member ID (U…)"
                                    value={slackIdDraft}
                                    onChange={(e) => {
                                      setSlackIdDraft(e.target.value);
                                      const v = e.target.value.trim();
                                      setSlackIdError(v && !/^[UW][A-Z0-9]{8,}$/.test(v) ? "Must start with U or W followed by 8+ uppercase letters/numbers (e.g. U012AB3CD)" : null);
                                    }}
                                    autoFocus
                                  />
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      if (slackIdError) return;
                                      updateSlackUserIdMutation.mutate({ personId: person.id, slackUserId: slackIdDraft.trim() || null });
                                    }}
                                    disabled={updateSlackUserIdMutation.isPending || !!slackIdError}
                                  >
                                    Save
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingSlackId(null); setSlackIdError(null); }}>
                                    Cancel
                                  </Button>
                                </div>
                                {slackIdError && <p className="text-xs text-destructive">{slackIdError}</p>}
                              </>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button
                                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                  onClick={() => { setEditingSlackId(person.id); setSlackIdDraft((person as any).slackUserId || ""); setSlackIdError(null); }}
                                >
                                  <span className="font-medium">Slack:</span>
                                  {(person as any).slackUserId ? (person as any).slackUserId : <span className="italic">not set</span>}
                                </button>
                                {(person as any).slackUserId && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 text-xs px-2"
                                      onClick={() => testSlackDMMutation.mutate(person.id)}
                                      disabled={testSlackDMMutation.isPending}
                                    >
                                      {testSlackDMMutation.isPending ? "Sending…" : "Test DM"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 text-xs px-2"
                                      onClick={() => refreshAppHomeMutation.mutate(person.id)}
                                      disabled={refreshAppHomeMutation.isPending}
                                    >
                                      {refreshAppHomeMutation.isPending ? "Publishing…" : "Refresh Home"}
                                    </Button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleExcludedMutation.mutate(person.id)}
                        disabled={toggleExcludedMutation.isPending}
                        data-testid={`button-toggle-excluded-person-${person.id}`}
                      >
                        {(person as any).excluded ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditPerson(person)}
                        data-testid={`button-edit-person-${person.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Delete ${person.name}? This will also remove all their assignments.`)) {
                            deletePersonMutation.mutate(person.id);
                          }
                        }}
                        disabled={deletePersonMutation.isPending}
                        data-testid={`button-delete-person-${person.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    </div>
                    </div>
                ))}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverIndex(people.length);
                  }}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={() => {
                    if (draggedId) {
                      const newOrder = people.filter(p => p.id !== draggedId).map(p => p.id);
                      newOrder.push(draggedId);
                      reorderPersonMutation.mutate(newOrder);
                    }
                    setDragOverIndex(null);
                  }}
                  className="h-12 -mx-3 -mb-3 px-3 pb-3"
                />
                {draggedId && dragOverIndex === people.length && (
                  <div className="h-1 bg-primary mb-2"></div>
                )}
              </div>
            )}
          </div>
        </Card>
        )}

        {/* Tasks section */}
        {activeSection === "tasks" && (
          <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Tasks</h2>
            <Button onClick={() => { setEditingTask(null); setShowAddTask(true); }} data-testid="button-add-task">
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          </div>

          <div className="space-y-2">
            {tasks.length === 0 ? (
              <p className="text-muted-foreground">No tasks added yet</p>
            ) : (
              <div className="space-y-0">
                {draggedTaskId && dragOverTaskIndex === -1 && (
                  <div className="h-1 bg-primary mb-0.5"></div>
                )}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverTaskIndex(-1);
                  }}
                  onDragLeave={() => setDragOverTaskIndex(null)}
                  onDrop={() => {
                    if (draggedTaskId) {
                      const newOrder = tasks.filter(t => t.id !== draggedTaskId).map(t => t.id);
                      newOrder.unshift(draggedTaskId);
                      reorderTaskMutation.mutate(newOrder);
                    }
                    setDragOverTaskIndex(null);
                  }}
                  className="h-1"
                />
                {tasks.map((task, index) => (
                  <div key={task.id}>
                    {draggedTaskId && dragOverTaskIndex === index && draggedTaskId !== task.id && (
                      <div className="h-1 bg-primary mb-0.5"></div>
                    )}
                    <div
                      draggable
                      onDragStart={() => setDraggedTaskId(task.id)}
                      onDragEnd={() => {
                        setDraggedTaskId(null);
                        setDragOverTaskIndex(null);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverTaskIndex(index);
                      }}
                      onDragLeave={() => setDragOverTaskIndex(null)}
                      onDrop={() => {
                        if (draggedTaskId && draggedTaskId !== task.id) {
                          const filteredTasks = tasks.filter(t => t.id !== draggedTaskId);
                          const newOrder = [...filteredTasks.map(t => t.id)];
                          newOrder.splice(index, 0, draggedTaskId);
                          reorderTaskMutation.mutate(newOrder);
                        }
                        setDragOverTaskIndex(null);
                      }}
                      className={`flex items-start justify-between p-3 border rounded-md hover-elevate cursor-move transition-opacity mb-2 ${
                        draggedTaskId === task.id ? "opacity-50" : ""
                      }`}
                      data-testid={`task-item-${task.id}`}
                    >
                      <div className="flex items-start gap-3 flex-1">
                        <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <div
                          className="w-6 h-6 rounded flex-shrink-0 mt-0.5"
                          style={{ backgroundColor: task.color }}
                        />
                        <div className="flex-1">
                          <p className="font-medium">{task.name}</p>
                          {task.description && (
                            <p className="text-sm text-muted-foreground">{task.description}</p>
                          )}
                        </div>
                      </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditTask(task);
                          setShowAddTask(true);
                        }}
                        data-testid={`button-edit-task-${task.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${task.name}"? This will also remove all assignments for this task.`)) {
                            deleteTaskMutation.mutate(task.id);
                          }
                        }}
                        disabled={deleteTaskMutation.isPending}
                        data-testid={`button-delete-task-${task.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    </div>
                  </div>
                ))}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverTaskIndex(tasks.length);
                  }}
                  onDragLeave={() => setDragOverTaskIndex(null)}
                  onDrop={() => {
                    if (draggedTaskId) {
                      const newOrder = tasks.filter(t => t.id !== draggedTaskId).map(t => t.id);
                      newOrder.push(draggedTaskId);
                      reorderTaskMutation.mutate(newOrder);
                    }
                    setDragOverTaskIndex(null);
                  }}
                  className="h-12 -mx-3 -mb-3 px-3 pb-3"
                />
                {draggedTaskId && dragOverTaskIndex === tasks.length && (
                  <div className="h-1 bg-primary mb-2"></div>
                )}
              </div>
            )}
          </div>
        </Card>
        )}

        {/* Rota section */}
        {activeSection === "rota" && (
          <RotaTasksSection people={people} tasks={tasks} />
        )}

        {/* Workspaces section — super-admin only */}
        {activeSection === "workspaces" && isSuperAdmin && (
          <Card className="p-6">
            <WorkspaceManagementSection currentUser={currentUser ?? null} />
          </Card>
        )}

        {/* Announcements section — admin and super-admin only */}
        {activeSection === "announcements" && isAdminUser && (
          <AnnouncementsSection />
        )}
      </div>

      {/* Add/Edit Person Dialog */}
      <Dialog open={showAddPerson || !!editingPerson} onOpenChange={(open) => { if (!open) { setShowAddPerson(false); setEditingPerson(null); } }}>
        <DialogContent data-testid="dialog-add-person">
          <DialogHeader>
            <DialogTitle>{editingPerson ? "Edit Person" : "Add Person"}</DialogTitle>
            <DialogDescription>
              {editingPerson ? "Update team member details" : "Create a new team member"}
            </DialogDescription>
          </DialogHeader>

          <Form {...personForm}>
            <form onSubmit={personForm.handleSubmit((data) => editingPerson ? updatePersonMutation.mutate(data) : createPersonMutation.mutate(data))} className="space-y-4">
              <FormField
                control={personForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter name" data-testid="input-person-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={personForm.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <div className="space-y-2">
                      <div className="grid grid-cols-12 gap-1.5">
                        {COLOR_PALETTE.flatMap((row, ri) =>
                          row.map((color, ci) => (
                            <button
                              key={`${ri}-${ci}`}
                              type="button"
                              className={`w-6 h-6 rounded-sm transition-all ${
                                field.value === color
                                  ? "ring-2 ring-offset-1 ring-foreground"
                                  : "hover:ring-2 hover:ring-offset-1 hover:ring-muted-foreground"
                              }`}
                              style={{ backgroundColor: color }}
                              onClick={() => field.onChange(color)}
                              title={color}
                              data-testid={`color-picker-${ri}-${ci}`}
                            />
                          ))
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded border shrink-0" style={{ backgroundColor: field.value }} />
                        <Input
                          value={field.value}
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
                          value={field.value}
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

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => { setShowAddPerson(false); setEditingPerson(null); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createPersonMutation.isPending || updatePersonMutation.isPending} data-testid="button-submit-person">
                  {createPersonMutation.isPending || updatePersonMutation.isPending ? "Saving..." : editingPerson ? "Update Person" : "Add Person"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Task Dialog */}
      <Dialog open={showAddTask || !!editingTask} onOpenChange={(open) => { if (!open) { setShowAddTask(false); setEditingTask(null); taskForm.reset(); } }}>
        <DialogContent data-testid="dialog-add-task">
          <DialogHeader>
            <DialogTitle>{editingTask ? "Edit Task" : "Add Task"}</DialogTitle>
            <DialogDescription>
              {editingTask ? "Update task details" : "Create a new task type"}
            </DialogDescription>
          </DialogHeader>

          <Form {...taskForm}>
            <form onSubmit={taskForm.handleSubmit((data) => {
              const payload = {
                ...data,
                isProduction: data.isProduction ? 1 : 0,
                requiredDaily: data.requiredDaily ? 1 : 0,
                showInPipelineView: data.showInPipelineView ? 1 : 0,
              } as any;
              editingTask ? updateTaskMutation.mutate(payload) : createTaskMutation.mutate(payload);
            })} className="space-y-4">
              <FormField
                control={taskForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Task Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter task name" data-testid="input-task-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={taskForm.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <div className="space-y-2">
                      <div className="grid grid-cols-12 gap-1.5">
                        {COLOR_PALETTE.flatMap((row, ri) =>
                          row.map((color, ci) => (
                            <button
                              key={`${ri}-${ci}`}
                              type="button"
                              className={`w-6 h-6 rounded-sm transition-all ${
                                field.value === color
                                  ? "ring-2 ring-offset-1 ring-foreground"
                                  : "hover:ring-2 hover:ring-offset-1 hover:ring-muted-foreground"
                              }`}
                              style={{ backgroundColor: color }}
                              onClick={() => field.onChange(color)}
                              title={color}
                              data-testid={`color-picker-${ri}-${ci}`}
                            />
                          ))
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded border shrink-0" style={{ backgroundColor: field.value }} />
                        <Input
                          value={field.value}
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
                          value={field.value}
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

              <FormField
                control={taskForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Enter task description..."
                        rows={3}
                        data-testid="input-task-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={taskForm.control}
                name="isProduction"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-is-production"
                      />
                    </FormControl>
                    <FormLabel className="mb-0 cursor-pointer">Show in reporting (production task)</FormLabel>
                  </FormItem>
                )}
              />

              <FormField
                control={taskForm.control}
                name="requiredDaily"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-required-daily"
                      />
                    </FormControl>
                    <FormLabel className="mb-0 cursor-pointer">Task is required daily</FormLabel>
                  </FormItem>
                )}
              />

              <FormField
                control={taskForm.control}
                name="showInPipelineView"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Checkbox
                        checked={!!field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-show-in-pipeline-view"
                      />
                    </FormControl>
                    <FormLabel className="mb-0 cursor-pointer">Show in pipeline view</FormLabel>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => { setShowAddTask(false); setEditingTask(null); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createTaskMutation.isPending || updateTaskMutation.isPending} data-testid="button-submit-task">
                  {createTaskMutation.isPending || updateTaskMutation.isPending ? "Saving..." : editingTask ? "Update Task" : "Add Task"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
