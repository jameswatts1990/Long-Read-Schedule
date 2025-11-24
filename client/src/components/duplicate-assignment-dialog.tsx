import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { type Assignment, type Person, DAYS } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface DuplicateAssignmentDialogProps {
  assignment: Assignment | null;
  people: Person[];
  weekStartDate: string;
  open: boolean;
  onClose: () => void;
}

export function DuplicateAssignmentDialog({
  assignment,
  people,
  weekStartDate,
  open,
  onClose,
}: DuplicateAssignmentDialogProps) {
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      if (!assignment) return;

      const promises = Array.from(selectedSlots).map((slotKey) => {
        // slotKey is format: personId-day, but personId contains dashes
        // so we split from the end: the day is always the last element
        const parts = slotKey.split("-");
        const day = parts[parts.length - 1];
        const personId = parts.slice(0, -1).join("-");
        
        const payload: any = {
          personId,
          taskId: assignment.taskId,
          day,
          weekStartDate,
        };
        
        if (assignment.batchNumber) payload.batchNumber = assignment.batchNumber;
        if (assignment.notes) payload.notes = assignment.notes;
        if (assignment.date) payload.date = assignment.date;
        
        return apiRequest("POST", "/api/assignments", payload);
      });

      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({
        title: "Tasks duplicated",
        description: `Created ${selectedSlots.size} new assignments.`,
      });
      setSelectedSlots(new Set());
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Failed to duplicate tasks",
        description: error instanceof Error ? error.message : "An error occurred while duplicating tasks.",
        variant: "destructive",
      });
    },
  });

  const toggleSlot = (personId: string, day: string) => {
    const key = `${personId}-${day}`;
    const newSet = new Set(selectedSlots);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setSelectedSlots(newSet);
  };

  const handleDuplicate = () => {
    if (selectedSlots.size === 0) {
      toast({
        title: "No slots selected",
        description: "Please select at least one day to duplicate to.",
        variant: "destructive",
      });
      return;
    }
    duplicateMutation.mutate();
  };

  const handleClose = () => {
    setSelectedSlots(new Set());
    onClose();
  };

  const handleSelectAllWeek = () => {
    if (!assignment) return;
    
    const allSlots = new Set<string>();
    people.forEach((person) => {
      DAYS.forEach((day) => {
        // Don't select the original assignment slot
        if (!(person.id === assignment.personId && day === assignment.day)) {
          allSlots.add(`${person.id}-${day}`);
        }
      });
    });
    setSelectedSlots(allSlots);
  };

  if (!assignment) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto" data-testid="dialog-duplicate-assignment">
        <DialogHeader>
          <DialogTitle>Duplicate Task</DialogTitle>
          <DialogDescription>
            Select days to duplicate this task to. The task will be copied with the same batch number, notes, and date.
          </DialogDescription>
          <Button
            variant="outline"
            onClick={handleSelectAllWeek}
            className="w-full mt-2"
            data-testid="button-select-all-week"
          >
            Select All Week
          </Button>
        </DialogHeader>

        <div className="space-y-4">
          {people.map((person) => (
            <div key={person.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: person.color }}
                />
                <span className="font-medium text-sm">{person.name}</span>
              </div>
              <div className="grid grid-cols-5 gap-2 ml-4">
                {DAYS.map((day) => {
                  const slotKey = `${person.id}-${day}`;
                  const isSelected = selectedSlots.has(slotKey);
                  // Disable if it's the original assignment
                  const isOriginal =
                    person.id === assignment.personId &&
                    day === assignment.day;

                  return (
                    <div
                      key={slotKey}
                      className="flex items-center gap-1.5"
                    >
                      <Checkbox
                        id={slotKey}
                        checked={isSelected}
                        disabled={isOriginal}
                        onCheckedChange={() => toggleSlot(person.id, day)}
                        data-testid={`checkbox-${slotKey}`}
                      />
                      <Label
                        htmlFor={slotKey}
                        className="text-xs cursor-pointer"
                      >
                        {day.charAt(0)}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel-duplicate">
            Cancel
          </Button>
          <Button
            onClick={handleDuplicate}
            disabled={duplicateMutation.isPending || selectedSlots.size === 0}
            data-testid="button-confirm-duplicate"
          >
            <Copy className="w-4 h-4" />
            <span>Duplicate to {selectedSlots.size} slots</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
