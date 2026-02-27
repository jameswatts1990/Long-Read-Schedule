import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, ArrowLeft, Pencil, GripVertical, Eye, EyeOff, BarChart3, Sun, UserCheck, UserX, Layers, Users, X, Loader2 } from "lucide-react";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { type Person, type Task, type User, type Workspace } from "@shared/schema";

// Super-admin email list (must match server/routes.ts SUPER_ADMIN_EMAILS)
const SUPER_ADMIN_EMAILS = new Set(["jw24@sanger.ac.uk", "admin@sanger.ac.uk"]);

// 20 unique colors with light, medium, and dark variants (60 colors total)
const PRESET_COLORS = [
  // Blue
  "#DBEAFE", "#93C5FD", "#1E40AF",
  "#E0F2FE", "#7DD3FC", "#0369A1",
  // Green
  "#D1FAE5", "#6EE7B7", "#065F46",
  "#DCFCE7", "#86EFAC", "#14532D",
  // Yellow/Gold
  "#FEF3C7", "#FCD34D", "#92400E",
  "#FEFCE8", "#FBBF24", "#78350F",
  // Orange
  "#FEEDC3", "#FDBA74", "#9A3412",
  "#FEF3C7", "#FBA040", "#B45309",
  // Red
  "#FEE2E2", "#FCA5A5", "#7F1D1D",
  "#FECACA", "#EF4444", "#991B1B",
  // Pink
  "#FCE7F3", "#F472B6", "#831843",
  "#FDF2F8", "#EC4899", "#9D174D",
  // Purple
  "#E9D5FF", "#C084FC", "#581C87",
  "#F3E8FF", "#D8B4FE", "#5B21B6",
  // Teal
  "#CCFBF1", "#67E8F9", "#0D9488",
  "#CFFAFE", "#06B6D4", "#0E7490",
  // Cyan
  "#CFF2F5", "#4FD1E5", "#0E5E6F",
  "#D1F4F8", "#22D3EE", "#164E63",
  // Lime
  "#ECFDF5", "#BFEF45", "#3F6212",
  "#F7FEE7", "#84CC16", "#3F6212",
];

const PERSON_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#06B6D4",
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

type PersonFormData = z.infer<typeof personFormSchema>;
type TaskFormData = z.infer<typeof taskFormSchema>;

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

  const { data: people = [] } = useQuery<Person[]>({ queryKey: ["/api/people"] });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: allUsers = [] } = useQuery<User[]>({ queryKey: ["/api/admin/users"] });
  const { data: currentUser } = useQuery<User>({ queryKey: ["/api/auth/user"] });
  const isSuperAdmin = currentUser?.email ? SUPER_ADMIN_EMAILS.has(currentUser.email.toLowerCase()) : false;

  const personForm = useForm<PersonFormData>({
    resolver: zodResolver(personFormSchema),
    defaultValues: {
      name: "",
      color: PERSON_COLORS[0],
    },
  });

  const taskForm = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      name: "",
      color: PRESET_COLORS[0],
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
      toast({ title: "Team member added", description: "Person added to the team", variant: "default" });
      personForm.reset();
      setShowAddPerson(false);
    },
    onError: () => {
      toast({ title: "Failed to add person", description: "Could not create the team member", variant: "destructive" });
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
      toast({ title: "Team member updated", description: "Changes have been saved", variant: "default" });
      personForm.reset();
      setEditingPerson(null);
    },
    onError: () => {
      toast({ title: "Failed to update person", description: "Could not save your changes", variant: "destructive" });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: TaskFormData) => {
      const res = await apiRequest("POST", "/api/tasks", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task added", description: "New task is now available", variant: "default" });
      taskForm.reset();
      setShowAddTask(false);
    },
    onError: () => {
      toast({ title: "Failed to add task", description: "Could not create the task", variant: "destructive" });
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
      toast({ title: "Task updated", description: "Changes have been saved", variant: "default" });
      taskForm.reset();
      setEditingTask(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update task", variant: "destructive" });
    },
  });

  const deletePersonMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/people/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ title: "Success", description: "Person deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete person", variant: "destructive" });
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
      toast({ title: "Success", description: "Exclusion status updated" });
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
      toast({ title: "Success", description: "Task deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete task", variant: "destructive" });
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
          </div>
          <div className="flex gap-2">
            <Link href="/reporting">
              <Button variant="outline" data-testid="button-reporting">
                <BarChart3 className="h-4 w-4 mr-2" />
                Capacity Reporting
              </Button>
            </Link>
            <Link href="/al-reporting">
              <Button variant="outline" data-testid="button-al-reporting">
                <Sun className="h-4 w-4 mr-2" />
                AL Reporting
              </Button>
            </Link>
          </div>
        </div>

        {/* People and Tasks Grid */}
        <div className="grid grid-cols-2 gap-8">
          {/* People Management */}
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
                        <div className="mt-1" onClick={(e) => e.stopPropagation()}>
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
                              {allUsers.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  {user.email || `${user.firstName} ${user.lastName}`.trim() || user.id}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
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
                        onClick={() => deletePersonMutation.mutate(person.id)}
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

          {/* Tasks Management */}
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
                          deleteTaskMutation.mutate(task.id);
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
        </div>

        {/* Super-Admin: Workspace Management */}
        {isSuperAdmin && (
          <Card className="p-6">
            <WorkspaceManagementSection currentUser={currentUser ?? null} />
          </Card>
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
                    <div className="flex gap-2 flex-wrap">
                      {PERSON_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`w-8 h-8 rounded border-2 transition-transform ${
                            field.value === color ? "border-foreground scale-110" : "border-transparent"
                          }`}
                          style={{ backgroundColor: color }}
                          onClick={() => field.onChange(color)}
                          data-testid={`color-picker-${color}`}
                        />
                      ))}
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
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {/* Group colors by base (every 3 colors form a group: light, medium, dark) */}
                      {[...Array(Math.ceil(PRESET_COLORS.length / 3))].map((_, groupIndex) => (
                        <div key={groupIndex} className="flex gap-2">
                          {PRESET_COLORS.slice(groupIndex * 3, groupIndex * 3 + 3).map((color) => (
                            <button
                              key={color}
                              type="button"
                              className={`flex-1 h-10 rounded border-2 transition-transform ${
                                field.value === color ? "border-foreground scale-105" : "border-transparent"
                              }`}
                              style={{ backgroundColor: color }}
                              onClick={() => field.onChange(color)}
                              data-testid={`color-picker-${color}`}
                              title={color}
                            />
                          ))}
                        </div>
                      ))}
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
