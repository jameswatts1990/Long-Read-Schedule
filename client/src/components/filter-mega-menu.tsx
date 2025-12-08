import { useState } from "react";
import { ChevronRight, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Person, type Task } from "@shared/schema";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

export interface PremadeFilter {
  id: string;
  name: string;
  personIds: Set<string>;
  taskIds: Set<string>;
}

interface FilterMegaMenuProps {
  people: Person[];
  tasks: Task[];
  selectedPersonIds: Set<string>;
  selectedTaskIds: Set<string>;
  premadeFilters: PremadeFilter[];
  onPersonToggle: (personId: string) => void;
  onTaskToggle: (taskId: string) => void;
  onApplyPremadeFilter: (filter: PremadeFilter) => void;
  onAddPremadeFilter: (filter: PremadeFilter) => void;
  onDeletePremadeFilter: (filterId: string) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  filterCount: number;
}

export function FilterMegaMenu({
  people,
  tasks,
  selectedPersonIds,
  selectedTaskIds,
  premadeFilters,
  onPersonToggle,
  onTaskToggle,
  onApplyPremadeFilter,
  onAddPremadeFilter,
  onDeletePremadeFilter,
  onClearFilters,
  hasActiveFilters,
  filterCount,
}: FilterMegaMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateFilter, setShowCreateFilter] = useState(false);
  const [newFilterName, setNewFilterName] = useState("");
  const [newFilterPersonIds, setNewFilterPersonIds] = useState<Set<string>>(new Set());
  const [newFilterTaskIds, setNewFilterTaskIds] = useState<Set<string>>(new Set());

  const handleCreateFilter = () => {
    if (!newFilterName.trim()) return;

    const newFilter: PremadeFilter = {
      id: Date.now().toString(),
      name: newFilterName,
      personIds: new Set(newFilterPersonIds),
      taskIds: new Set(newFilterTaskIds),
    };

    onAddPremadeFilter(newFilter);
    setNewFilterName("");
    setNewFilterPersonIds(new Set());
    setNewFilterTaskIds(new Set());
    setShowCreateFilter(false);
  };

  const toggleNewFilterPerson = (personId: string) => {
    const newSet = new Set(newFilterPersonIds);
    if (newSet.has(personId)) {
      newSet.delete(personId);
    } else {
      newSet.add(personId);
    }
    setNewFilterPersonIds(newSet);
  };

  const toggleNewFilterTask = (taskId: string) => {
    const newSet = new Set(newFilterTaskIds);
    if (newSet.has(taskId)) {
      newSet.delete(taskId);
    } else {
      newSet.add(taskId);
    }
    setNewFilterTaskIds(newSet);
  };

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={hasActiveFilters ? "default" : "outline"}
            size="default"
            data-testid="button-filter"
          >
            <span>Filter</span>
            {hasActiveFilters && (
              <span className="ml-1 text-xs">({filterCount})</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-max p-0 border-0">
          <div className="flex bg-background rounded-lg border shadow-lg">
            {/* People Column */}
            <div className="border-r p-4 min-w-56">
              <h3 className="font-semibold text-sm mb-3 text-foreground">People</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {people.map((person) => (
                  <div key={person.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`person-${person.id}`}
                      checked={selectedPersonIds.has(person.id)}
                      onCheckedChange={() => onPersonToggle(person.id)}
                      data-testid={`filter-person-${person.id}`}
                    />
                    <label
                      htmlFor={`person-${person.id}`}
                      className="flex items-center gap-2 cursor-pointer flex-1"
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: person.color }}
                      />
                      <span className="text-sm">{person.name}</span>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Tasks Column */}
            <div className="border-r p-4 min-w-56">
              <h3 className="font-semibold text-sm mb-3 text-foreground">Tasks</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {tasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`task-${task.id}`}
                      checked={selectedTaskIds.has(task.id)}
                      onCheckedChange={() => onTaskToggle(task.id)}
                      data-testid={`filter-task-${task.id}`}
                    />
                    <label
                      htmlFor={`task-${task.id}`}
                      className="flex items-center gap-2 cursor-pointer flex-1"
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: task.color }}
                      />
                      <span className="text-sm">{task.name}</span>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Premade Filters Column */}
            <div className="p-4 min-w-56 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-foreground">Presets</h3>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowCreateFilter(true)}
                  className="h-6 w-6"
                  data-testid="button-create-premade-filter"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="space-y-1 max-h-96 overflow-y-auto flex-1">
                {premadeFilters.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">
                    No presets yet
                  </p>
                ) : (
                  premadeFilters.map((filter) => (
                    <div
                      key={filter.id}
                      className="flex items-center justify-between group hover-elevate p-2 rounded text-sm cursor-pointer"
                      onClick={() => {
                        onApplyPremadeFilter(filter);
                        setIsOpen(false);
                      }}
                      data-testid={`premade-filter-${filter.id}`}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                        <span>{filter.name}</span>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeletePremadeFilter(filter.id);
                        }}
                        data-testid={`button-delete-premade-filter-${filter.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start mt-3 text-xs"
                  onClick={() => {
                    onClearFilters();
                    setIsOpen(false);
                  }}
                  data-testid="button-clear-filters-menu"
                >
                  <X className="w-3 h-3 mr-1" />
                  Clear All
                </Button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Create Premade Filter Dialog */}
      <Dialog open={showCreateFilter} onOpenChange={setShowCreateFilter}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Preset Filter</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Filter Name</label>
              <Input
                placeholder="e.g., Annual Leave"
                value={newFilterName}
                onChange={(e) => setNewFilterName(e.target.value)}
                data-testid="input-filter-name"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">People</label>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-3">
                  {people.map((person) => (
                    <div key={person.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`new-filter-person-${person.id}`}
                        checked={newFilterPersonIds.has(person.id)}
                        onCheckedChange={() => toggleNewFilterPerson(person.id)}
                        data-testid={`new-filter-person-${person.id}`}
                      />
                      <label
                        htmlFor={`new-filter-person-${person.id}`}
                        className="flex items-center gap-2 cursor-pointer flex-1"
                      >
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: person.color }}
                        />
                        <span className="text-sm">{person.name}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Tasks</label>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-3">
                  {tasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`new-filter-task-${task.id}`}
                        checked={newFilterTaskIds.has(task.id)}
                        onCheckedChange={() => toggleNewFilterTask(task.id)}
                        data-testid={`new-filter-task-${task.id}`}
                      />
                      <label
                        htmlFor={`new-filter-task-${task.id}`}
                        className="flex items-center gap-2 cursor-pointer flex-1"
                      >
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: task.color }}
                        />
                        <span className="text-sm">{task.name}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateFilter(false)}
              data-testid="button-cancel-filter"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFilter}
              disabled={!newFilterName.trim()}
              data-testid="button-save-filter"
            >
              Create Filter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
