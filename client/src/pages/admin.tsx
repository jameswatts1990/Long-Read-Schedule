import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, ArrowLeft, Pencil } from "lucide-react";
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
  "#DBEAFE", "#D1FAE5", "#FEF3C7", "#E0E7FF", "#F3E8FF",
  "#FCE7F3", "#DBEAFE", "#C7D2FE", "#BFE1FF", "#FECACA",
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
        </div>

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
              <div className="space-y-2">
                {people.map((person) => (
                  <div
                    key={person.id}
                    className="flex items-center justify-between p-3 border rounded-md hover-elevate"
                    data-testid={`person-item-${person.id}`}
                  >
                    <div className="flex items-center gap-3">
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
                ))}
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
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start justify-between p-3 border rounded-md hover-elevate"
                    data-testid={`task-item-${task.id}`}
                  >
                    <div className="flex items-start gap-3 flex-1">
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
                ))}
              </div>
            )}
          </div>
        </Card>
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
      <Dialog open={showAddTask || !!editingTask} onOpenChange={(open) => { if (!open) { setShowAddTask(false); setEditingTask(null); } }}>
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
