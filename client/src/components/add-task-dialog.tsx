import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTaskSchema, type InsertTask } from "@shared/schema";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useState } from "react";

interface AddTaskDialogProps {
  open: boolean;
  onClose: () => void;
}

const TASK_COLORS = [
  "#FEE2E2", "#FFEDD5", "#FEF3C7", "#FEF9C3", "#ECFCCB",
  "#D1FAE5", "#D1F5F0", "#CFFAFE", "#DBEAFE", "#E0E7FF",
  "#EDE9FE", "#F3E8FF", "#FAE8FF", "#FCE7F3", "#FFE4E6",
  "#E2E8F0"
];

const formSchema = insertTaskSchema.extend({
  color: z.string().min(1, "Please select a color"),
  description: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export function AddTaskDialog({ open, onClose }: AddTaskDialogProps) {
  const [selectedColor, setSelectedColor] = useState(TASK_COLORS[0]);
  const { toast } = useToast();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      color: TASK_COLORS[0],
      description: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertTask) => {
      return apiRequest("POST", "/api/tasks", data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task added",
        description: `${variables.name} has been added to the task library.`,
      });
      form.reset();
      setSelectedColor(TASK_COLORS[0]);
      onClose();
    },
  });

  const onSubmit = (data: FormData) => {
    const { description, ...rest } = data;
    createMutation.mutate({
      ...rest,
      description: description || undefined,
    });
  };

  const handleColorSelect = (color: string, onChange: (value: string) => void) => {
    setSelectedColor(color);
    onChange(color);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent data-testid="dialog-add-task">
        <DialogHeader>
          <DialogTitle>Add Task</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Enter task name"
                      data-testid="input-task-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Add a description..."
                      className="resize-none h-20"
                      data-testid="input-task-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-6 gap-2">
                      {TASK_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`w-full aspect-square rounded-md border-2 transition-all hover-elevate ${
                            selectedColor === color ? "border-foreground scale-110" : "border-transparent"
                          }`}
                          style={{ backgroundColor: color }}
                          onClick={() => handleColorSelect(color, field.onChange)}
                          data-testid={`color-option-${color}`}
                        />
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                data-testid="button-cancel-task"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                data-testid="button-submit-task"
              >
                Add Task
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
