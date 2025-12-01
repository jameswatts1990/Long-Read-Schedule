import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, ArrowLeft, Pencil, GripVertical, Eye, EyeOff, BarChart3 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { type Person, type Task } from "@shared/schema";

const PRESET_COLORS = [
  "#DBEAFE", "#BAE6FD", "#D1FAE5", "#A7F3D0", "#FEF3C7", "#FEF08A",
  "#FECDD3", "#FCE7F3", "#E9D5FF", "#F3E8FF", "#C7D2FE", "#E0E7FF",
  "#FEDBA8", "#FED7AA", "#FECACA", "#DDD6FE",
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
});

type PersonFormData = z.infer<typeof personFormSchema>;
type TaskFormData = z.infer<typeof taskFormSchema>;

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
    },
  });

  const createPersonMutation = useMutation({
    mutationFn: async (data: PersonFormData) => {
      const res = await apiRequest("POST", "/api/people", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ title: "Success", description: "Person added successfully" });
      personForm.reset();
      setShowAddPerson(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add person", variant: "destructive" });
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
      toast({ title: "Success", description: "Person updated successfully" });
      personForm.reset();
      setEditingPerson(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update person", variant: "destructive" });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: TaskFormData) => {
      const res = await apiRequest("POST", "/api/tasks", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Success", description: "Task added successfully" });
      taskForm.reset();
      setShowAddTask(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add task", variant: "destructive" });
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
      toast({ title: "Success", description: "Task updated successfully" });
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

  const handleEditPerson = (person: Person) => {
    setEditingPerson(person);
    personForm.reset({ name: person.name, color: person.color });
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    taskForm.reset({ name: task.name, color: task.color, description: task.description || "" });
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
          <Link href="/reporting">
            <Button variant="outline" data-testid="button-reporting">
              <BarChart3 className="h-4 w-4 mr-2" />
              Reporting
            </Button>
          </Link>
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
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div
                        className="w-6 h-6 rounded"
                        style={{ backgroundColor: person.color }}
                      />
                      <span>{person.name}</span>
                    </div>
                    <div className="flex gap-1">
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
                          onClick={() => handleEditTask(task)}
                          data-testid={`button-edit-task-${task.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteTaskMutation.mutate(task.id)}
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
            <form onSubmit={taskForm.handleSubmit((data) => editingTask ? updateTaskMutation.mutate(data) : createTaskMutation.mutate(data))} className="space-y-4">
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
                    <div className="flex gap-2 flex-wrap">
                      {PRESET_COLORS.map((color) => (
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
