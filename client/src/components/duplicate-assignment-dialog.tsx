import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, AlertCircle } from "lucide-react";
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
        if (assignment.batchSize) payload.batchSize = assignment.batchSize;
        if (assignment.notes) payload.notes = assignment.notes;
        if (assignment.date) payload.date = assignment.date;
        
        return apiRequest("POST", "/api/assignments", payload);
      });

      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/assignments')
      });
      toast({
        title: "Tasks duplicated",
        description: `Created ${selectedSlots.size} new assignment(s)`,
        variant: "default",
      });
      setSelectedSlots(new Set());
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Failed to duplicate tasks",
        description: error instanceof Error ? error.message : "Could not complete the duplication",
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
        description: "Please select at least one day to duplicate to",
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

  const handleSelectPersonWeek = (personId: string) => {
    if (!assignment) return;
    
    const newSet = new Set(selectedSlots);
    DAYS.forEach((day) => {
      // Don't select the original assignment slot
      if (!(personId === assignment.personId && day === assignment.day)) {
        const slotKey = `${personId}-${day}`;
        newSet.add(slotKey);
      }
    });
    setSelectedSlots(newSet);
  };

  if (!assignment) return null;

  // Sort people: original person first, then others
  const sortedPeople = [...people].sort((a, b) => {
    if (a.id === assignment.personId) return -1;
    if (b.id === assignment.personId) return 1;
    return 0;
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto" data-testid="dialog-duplicate-assignment">
        <DialogHeader>
          <DialogTitle>Duplicate Task</DialogTitle>
          <DialogDescription>
            Select days to duplicate this task to. The batch number, batch size, notes, and date will be copied.
          </DialogDescription>
        </DialogHeader>

        {/* Action buttons at top */}
        <div className="flex gap-2 justify-end">
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
        </div>

        {/* Table-like layout */}
        <div className="border rounded-md overflow-hidden">
          {/* Header row with days */}
          <div className="grid gap-0" style={{ gridTemplateColumns: "200px repeat(5, 1fr) 80px" }}>
            {/* Top-left corner (empty) */}
            <div className="p-3 border-b border-r font-semibold bg-muted text-sm">Person</div>
            
            {/* Day headers */}
            {DAYS.map((day) => (
              <div key={`header-${day}`} className="p-3 border-b border-r font-semibold bg-muted text-center text-sm">
                {day.charAt(0).toUpperCase()}
              </div>
            ))}
            
            {/* Actions header */}
            <div className="p-3 border-b font-semibold bg-muted text-center text-sm">Actions</div>

            {/* Data rows */}
            {sortedPeople.map((person) => {
              const isOriginalPerson = person.id === assignment.personId;
              return (
                <div key={person.id} className="contents">
                  {/* Person name cell */}
                  <div
                    className={`p-3 border-b border-r flex items-center gap-2 ${
                      isOriginalPerson ? "bg-primary/10" : ""
                    }`}
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: person.color }}
                    />
                    <span className={`font-medium text-sm ${isOriginalPerson ? "font-semibold text-primary" : ""}`}>
                      {person.name}
                      {isOriginalPerson && <span className="ml-1 text-xs text-primary font-normal">(Original)</span>}
                    </span>
                  </div>

                  {/* Day cells */}
                  {DAYS.map((day) => {
                    const slotKey = `${person.id}-${day}`;
                    const isSelected = selectedSlots.has(slotKey);
                    const isOriginal =
                      person.id === assignment.personId &&
                      day === assignment.day;

                    return (
                      <div
                        key={slotKey}
                        className={`p-3 border-b border-r flex justify-center ${
                          isOriginalPerson ? "bg-primary/10" : ""
                        } ${isOriginal ? "bg-primary/5" : ""}`}
                      >
                        <Checkbox
                          id={slotKey}
                          checked={isSelected}
                          disabled={isOriginal}
                          onCheckedChange={() => toggleSlot(person.id, day)}
                          data-testid={`checkbox-${slotKey}`}
                        />
                      </div>
                    );
                  })}

                  {/* Actions cell */}
                  <div className={`p-3 border-b flex justify-center ${isOriginalPerson ? "bg-primary/10" : ""}`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSelectPersonWeek(person.id)}
                      className="text-xs h-6 px-2"
                      data-testid={`button-select-all-week-${person.id}`}
                    >
                      All
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
