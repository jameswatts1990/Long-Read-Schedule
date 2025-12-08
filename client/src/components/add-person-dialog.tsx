import { useMutation } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPersonSchema, type InsertPerson } from "@shared/schema";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useState } from "react";

interface AddPersonDialogProps {
  open: boolean;
  onClose: () => void;
}

const PERSON_COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#EAB308", "#84CC16",
  "#22C55E", "#10B981", "#14B8A6", "#06B6D4", "#0EA5E9",
  "#3B82F6", "#6366F1", "#8B5CF6", "#A855F7", "#D946EF",
  "#EC4899", "#F43F5E", "#64748B"
];

const formSchema = insertPersonSchema.extend({
  color: z.string().min(1, "Please select a color"),
});

type FormData = z.infer<typeof formSchema>;

export function AddPersonDialog({ open, onClose }: AddPersonDialogProps) {
  const [selectedColor, setSelectedColor] = useState(PERSON_COLORS[0]);
  const { toast } = useToast();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      color: PERSON_COLORS[0],
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertPerson) => {
      return apiRequest("POST", "/api/people", data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      toast({
        title: "Team member added",
        description: `${variables.name} is now part of the team`,
        variant: "default",
      });
      form.reset();
      setSelectedColor(PERSON_COLORS[0]);
      onClose();
    },
  });

  const onSubmit = (data: FormData) => {
    createMutation.mutate(data);
  };

  const handleColorSelect = (color: string, onChange: (value: string) => void) => {
    setSelectedColor(color);
    onChange(color);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent data-testid="dialog-add-person">
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Enter person's name"
                      data-testid="input-person-name"
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
                      {PERSON_COLORS.map((color) => (
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
                data-testid="button-cancel-person"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                data-testid="button-submit-person"
              >
                Add Person
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
