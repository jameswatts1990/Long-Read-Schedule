import { useState } from "react";
import { ChevronRight, Plus, Trash2, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Person, type Task, type PremadeFilter } from "@shared/schema";
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

export type { PremadeFilter };

interface FilterMegaMenuProps {
  people: Person[];
  tasks: Task[];
  selectedPersonIds: Set<string>;
  selectedTaskIds: Set<string>;
  premadeFilters: PremadeFilter[];
  onPersonToggle: (personId: string) => void;
  onPersonSelectAll: (personIds: string[]) => void;
  onTaskToggle: (taskId: string) => void;
  onTaskSelectAll: (taskIds: string[]) => void;
  onApplyPremadeFilter: (personIds: string[], taskIds: string[]) => void;
  onAddPremadeFilter: (name: string, personIds: string[], taskIds: string[]) => void;
  onEditPremadeFilter: (filterId: string, name: string, personIds: string[], taskIds: string[]) => void;
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
  onPersonSelectAll,
  onTaskToggle,
  onTaskSelectAll,
  onApplyPremadeFilter,
  onAddPremadeFilter,
  onEditPremadeFilter,
  onDeletePremadeFilter,
  onClearFilters,
  hasActiveFilters,
  filterCount,
}: FilterMegaMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Create filter state
  const [showCreateFilter, setShowCreateFilter] = useState(false);
  const [newFilterName, setNewFilterName] = useState("");
  const [newFilterPersonIds, setNewFilterPersonIds] = useState<Set<string>>(new Set());
  const [newFilterTaskIds, setNewFilterTaskIds] = useState<Set<string>>(new Set());
  
  // Edit filter state (separate from create)
  const [showEditFilter, setShowEditFilter] = useState(false);
  const [editingFilter, setEditingFilter] = useState<PremadeFilter | null>(null);
  const [editFilterName, setEditFilterName] = useState("");
  const [editFilterPersonIds, setEditFilterPersonIds] = useState<Set<string>>(new Set());
  const [editFilterTaskIds, setEditFilterTaskIds] = useState<Set<string>>(new Set());

  const handleCreateFilter = () => {
    if (!newFilterName.trim()) return;

    onAddPremadeFilter(
      newFilterName,
      Array.from(newFilterPersonIds),
      Array.from(newFilterTaskIds)
    );
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

  // Edit filter toggle functions (separate from create)
  const toggleEditFilterPerson = (personId: string) => {
    const newSet = new Set(editFilterPersonIds);
    if (newSet.has(personId)) {
      newSet.delete(personId);
    } else {
      newSet.add(personId);
    }
    setEditFilterPersonIds(newSet);
  };

  const toggleEditFilterTask = (taskId: string) => {
    const newSet = new Set(editFilterTaskIds);
    if (newSet.has(taskId)) {
      newSet.delete(taskId);
    } else {
      newSet.add(taskId);
    }
    setEditFilterTaskIds(newSet);
  };

  const handleEditFilter = (filter: PremadeFilter) => {
    setEditingFilter(filter);
    setEditFilterName(filter.name);
    setEditFilterPersonIds(new Set(filter.personIds || []));
    setEditFilterTaskIds(new Set(filter.taskIds || []));
    setShowEditFilter(true);
  };

  const handleSaveEdit = () => {
    if (!editingFilter || !editFilterName.trim()) return;

    onEditPremadeFilter(
      editingFilter.id,
      editFilterName,
      Array.from(editFilterPersonIds),
      Array.from(editFilterTaskIds)
    );
    setEditingFilter(null);
    setShowEditFilter(false);
  };

  const handleCloseEdit = () => {
    setEditingFilter(null);
    setShowEditFilter(false);
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
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-foreground">People</h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 px-2 text-xs"
                  onClick={() => onPersonSelectAll(people.map(p => p.id))}
                  data-testid="button-select-all-people"
                >
                  Select All
                </Button>
              </div>
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
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-foreground">Tasks</h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 px-2 text-xs"
                  onClick={() => onTaskSelectAll(tasks.map(t => t.id))}
                  data-testid="button-select-all-tasks"
                >
                  Select All
                </Button>
              </div>
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
                        onApplyPremadeFilter(filter.personIds || [], filter.taskIds || []);
                        setIsOpen(false);
                      }}
                      data-testid={`premade-filter-${filter.id}`}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                        <span>{filter.name}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditFilter(filter);
                          }}
                          data-testid={`button-edit-premade-filter-${filter.id}`}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeletePremadeFilter(filter.id);
                          }}
                          data-testid={`button-delete-premade-filter-${filter.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
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
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">People</label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 px-2 text-xs"
                    onClick={() => setNewFilterPersonIds(new Set(people.map(p => p.id)))}
                  >
                    Select All
                  </Button>
                </div>
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
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Tasks</label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 px-2 text-xs"
                    onClick={() => setNewFilterTaskIds(new Set(tasks.map(t => t.id)))}
                  >
                    Select All
                  </Button>
                </div>
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

      {/* Edit Premade Filter Dialog */}
      <Dialog open={showEditFilter} onOpenChange={handleCloseEdit}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Preset Filter</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Filter Name</label>
              <Input
                placeholder="e.g., Annual Leave"
                value={editFilterName}
                onChange={(e) => setEditFilterName(e.target.value)}
                data-testid="input-edit-filter-name"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">People</label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 px-2 text-xs"
                    onClick={() => setEditFilterPersonIds(new Set(people.map(p => p.id)))}
                  >
                    Select All
                  </Button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-3">
                  {people.map((person) => (
                    <div key={person.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`edit-filter-person-${person.id}`}
                        checked={editFilterPersonIds.has(person.id)}
                        onCheckedChange={() => toggleEditFilterPerson(person.id)}
                        data-testid={`edit-filter-person-${person.id}`}
                      />
                      <label
                        htmlFor={`edit-filter-person-${person.id}`}
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
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Tasks</label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 px-2 text-xs"
                    onClick={() => setEditFilterTaskIds(new Set(tasks.map(t => t.id)))}
                  >
                    Select All
                  </Button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-3">
                  {tasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`edit-filter-task-${task.id}`}
                        checked={editFilterTaskIds.has(task.id)}
                        onCheckedChange={() => toggleEditFilterTask(task.id)}
                        data-testid={`edit-filter-task-${task.id}`}
                      />
                      <label
                        htmlFor={`edit-filter-task-${task.id}`}
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
              onClick={handleCloseEdit}
              data-testid="button-cancel-edit-filter"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={!editFilterName.trim()}
              data-testid="button-save-edit-filter"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
