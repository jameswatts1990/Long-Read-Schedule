import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  X,
  Folder,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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

type FilterFolder = {
  id: string;
  name: string;
  filterIds: string[];
  isCollapsed?: boolean;
};

type DragState =
  | { type: "folder"; id: string }
  | { type: "filter"; id: string; fromFolderId: string | null };

const FILTER_FOLDER_STORAGE_PREFIX = "scheduler-filter-folders";

const createFolderId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

function sanitizeFolders(
  folders: FilterFolder[],
  premadeFilters: PremadeFilter[]
): FilterFolder[] {
  const validFilterIds = new Set(premadeFilters.map((filter) => filter.id));
  const usedFilterIds = new Set<string>();
  const usedFolderIds = new Set<string>();

  return folders
    .filter((folder): folder is FilterFolder => Boolean(folder?.name?.trim()))
    .map((folder) => {
      const folderId = usedFolderIds.has(folder.id) ? createFolderId() : folder.id || createFolderId();
      usedFolderIds.add(folderId);

      const filterIds = (folder.filterIds || []).filter((filterId) => {
        if (!validFilterIds.has(filterId) || usedFilterIds.has(filterId)) {
          return false;
        }
        usedFilterIds.add(filterId);
        return true;
      });

      return {
        id: folderId,
        name: folder.name.trim(),
        filterIds,
        isCollapsed: Boolean(folder.isCollapsed),
      };
    });
}

function getUnorganizedFilters(
  premadeFilters: PremadeFilter[],
  folders: FilterFolder[]
): PremadeFilter[] {
  const organizedFilterIds = new Set(folders.flatMap((folder) => folder.filterIds));
  return premadeFilters.filter((filter) => !organizedFilterIds.has(filter.id));
}

interface FilterMegaMenuProps {
  people: Person[];
  tasks: Task[];
  selectedPersonIds: Set<string>;
  selectedTaskIds: Set<string>;
  premadeFilters: PremadeFilter[];
  workspaceStorageKey?: string;
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
  workspaceStorageKey = "default",
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

  const [showCreateFilter, setShowCreateFilter] = useState(false);
  const [newFilterName, setNewFilterName] = useState("");
  const [newFilterPersonIds, setNewFilterPersonIds] = useState<Set<string>>(new Set());
  const [newFilterTaskIds, setNewFilterTaskIds] = useState<Set<string>>(new Set());

  const [showEditFilter, setShowEditFilter] = useState(false);
  const [editingFilter, setEditingFilter] = useState<PremadeFilter | null>(null);
  const [editFilterName, setEditFilterName] = useState("");
  const [editFilterPersonIds, setEditFilterPersonIds] = useState<Set<string>>(new Set());
  const [editFilterTaskIds, setEditFilterTaskIds] = useState<Set<string>>(new Set());

  const [folders, setFolders] = useState<FilterFolder[]>([]);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderBeingEdited, setFolderBeingEdited] = useState<FilterFolder | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [activeDropTarget, setActiveDropTarget] = useState<string | null>(null);

  const storageKey = `${FILTER_FOLDER_STORAGE_PREFIX}:${workspaceStorageKey}`;

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setFolders([]);
        return;
      }

      const parsed = JSON.parse(raw) as FilterFolder[];
      setFolders(sanitizeFolders(Array.isArray(parsed) ? parsed : [], premadeFilters));
    } catch {
      setFolders([]);
    }
  }, [storageKey]);

  useEffect(() => {
    setFolders((currentFolders) => sanitizeFolders(currentFolders, premadeFilters));
  }, [premadeFilters]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(folders));
  }, [folders, storageKey]);

  const filterMap = useMemo(
    () => new Map(premadeFilters.map((filter) => [filter.id, filter])),
    [premadeFilters]
  );

  const unorganizedFilters = useMemo(
    () => getUnorganizedFilters(premadeFilters, folders),
    [premadeFilters, folders]
  );

  const applyFilterAndClose = (filter: PremadeFilter) => {
    onApplyPremadeFilter(filter.personIds || [], filter.taskIds || []);
    setIsOpen(false);
  };

  const handleCreateFilter = () => {
    if (!newFilterName.trim()) return;

    onAddPremadeFilter(
      newFilterName.trim(),
      Array.from(newFilterPersonIds),
      Array.from(newFilterTaskIds)
    );
    setNewFilterName("");
    setNewFilterPersonIds(new Set());
    setNewFilterTaskIds(new Set());
    setShowCreateFilter(false);
  };

  const handleCreateFolder = () => {
    const trimmedName = newFolderName.trim();
    if (!trimmedName) return;

    setFolders((currentFolders) => [
      ...currentFolders,
      { id: createFolderId(), name: trimmedName, filterIds: [], isCollapsed: false },
    ]);
    setNewFolderName("");
    setShowCreateFolder(false);
  };

  const handleSaveFolderEdit = () => {
    if (!folderBeingEdited || !editingFolderName.trim()) return;

    setFolders((currentFolders) =>
      currentFolders.map((folder) =>
        folder.id === folderBeingEdited.id
          ? { ...folder, name: editingFolderName.trim() }
          : folder
      )
    );
    setFolderBeingEdited(null);
    setEditingFolderName("");
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
      editFilterName.trim(),
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

  const handleDeleteFolder = (folderId: string) => {
    setFolders((currentFolders) => currentFolders.filter((folder) => folder.id !== folderId));
  };

  const toggleFolderCollapsed = (folderId: string) => {
    setFolders((currentFolders) =>
      currentFolders.map((folder) =>
        folder.id === folderId
          ? { ...folder, isCollapsed: !folder.isCollapsed }
          : folder
      )
    );
  };

  const moveFilter = (
    filterId: string,
    targetFolderId: string | null,
    targetIndex?: number
  ) => {
    setFolders((currentFolders) => {
      const nextFolders = currentFolders.map((folder) => ({
        ...folder,
        filterIds: folder.filterIds.filter((id) => id !== filterId),
      }));

      if (targetFolderId) {
        return nextFolders.map((folder) => {
          if (folder.id !== targetFolderId) return folder;
          const nextFilterIds = [...folder.filterIds];
          const insertIndex = Math.max(0, Math.min(targetIndex ?? nextFilterIds.length, nextFilterIds.length));
          nextFilterIds.splice(insertIndex, 0, filterId);
          return { ...folder, filterIds: nextFilterIds, isCollapsed: false };
        });
      }

      const sanitizedUnorganized = getUnorganizedFilters(
        premadeFilters.filter((filter) => filter.id !== filterId),
        nextFolders
      );
      const unorganizedIds = sanitizedUnorganized.map((filter) => filter.id);
      const insertIndex = Math.max(0, Math.min(targetIndex ?? unorganizedIds.length, unorganizedIds.length));
      unorganizedIds.splice(insertIndex, 0, filterId);

      const unorganizedSet = new Set(unorganizedIds);
      const finalFolders = nextFolders.map((folder) => ({
        ...folder,
        filterIds: folder.filterIds.filter((id) => !unorganizedSet.has(id)),
      }));

      return finalFolders;
    });
  };

  const reorderFolders = (draggedFolderId: string, targetIndex: number) => {
    setFolders((currentFolders) => {
      const draggedIndex = currentFolders.findIndex((folder) => folder.id === draggedFolderId);
      if (draggedIndex < 0 || draggedIndex === targetIndex) return currentFolders;
      const nextFolders = [...currentFolders];
      const [draggedFolder] = nextFolders.splice(draggedIndex, 1);
      const safeTargetIndex = Math.max(0, Math.min(targetIndex, nextFolders.length));
      nextFolders.splice(safeTargetIndex, 0, draggedFolder);
      return nextFolders;
    });
  };

  const handleFilterDragStart = (filterId: string, fromFolderId: string | null) => {
    setDragState({ type: "filter", id: filterId, fromFolderId });
  };

  const handleFolderDragStart = (folderId: string) => {
    setDragState({ type: "folder", id: folderId });
  };

  const clearDragState = () => {
    setDragState(null);
    setActiveDropTarget(null);
  };

  const renderFilterRow = (filter: PremadeFilter, parentFolderId: string | null, index: number) => (
    <div
      key={filter.id}
      className={cn(
        "group rounded-md border border-transparent bg-background/80 transition-all",
        dragState?.type === "filter" && dragState.id === filter.id && "opacity-50"
      )}
      onDragOver={(event) => {
        if (dragState?.type !== "filter") return;
        event.preventDefault();
        setActiveDropTarget(`filter:${filter.id}`);
      }}
      onDragLeave={() => {
        if (activeDropTarget === `filter:${filter.id}`) {
          setActiveDropTarget(null);
        }
      }}
      onDrop={(event) => {
        if (dragState?.type !== "filter") return;
        event.preventDefault();
        moveFilter(dragState.id, parentFolderId, index);
        clearDragState();
      }}
    >
      <div
        draggable
        onDragStart={() => handleFilterDragStart(filter.id, parentFolderId)}
        onDragEnd={clearDragState}
        className={cn(
          "flex items-center justify-between rounded-md px-2 py-2 text-sm cursor-pointer hover:bg-accent/70",
          activeDropTarget === `filter:${filter.id}` && "border border-dashed border-primary/60 bg-accent"
        )}
        onClick={() => applyFilterAndClose(filter)}
        data-testid={`premade-filter-${filter.id}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
          <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />
          <span className="truncate">{filter.name}</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
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
            className="h-6 w-6"
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
    </div>
  );

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
        <PopoverContent align="end" className="w-[min(92vw,72rem)] p-0 border-0">
          <div className="flex overflow-hidden rounded-lg border bg-background shadow-lg">
            <div className="min-w-56 border-r p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">People</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => onPersonSelectAll(people.map((person) => person.id))}
                  data-testid="button-select-all-people"
                >
                  Select All
                </Button>
              </div>
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
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
                      className="flex flex-1 cursor-pointer items-center gap-2"
                    >
                      <div
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: person.color }}
                      />
                      <span className="text-sm">{person.name}</span>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-56 border-r p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Tasks</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => onTaskSelectAll(tasks.map((task) => task.id))}
                  data-testid="button-select-all-tasks"
                >
                  Select All
                </Button>
              </div>
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
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
                      className="flex flex-1 cursor-pointer items-center gap-2"
                    >
                      <div
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: task.color }}
                      />
                      <span className="text-sm">{task.name}</span>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex min-w-[22rem] flex-1 flex-col p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Presets</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Drag presets into folders to keep your filter library tidy.
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setShowCreateFolder(true)}
                    className="h-7 w-7"
                    data-testid="button-create-filter-folder"
                    title="Create folder"
                  >
                    <FolderPlus className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setShowCreateFilter(true)}
                    className="h-7 w-7"
                    data-testid="button-create-premade-filter"
                    title="Create preset"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                <div
                  className={cn(
                    "rounded-lg border border-dashed border-border/80 bg-muted/20 p-2",
                    activeDropTarget === "ungrouped" && "border-primary/70 bg-accent/60"
                  )}
                  onDragOver={(event) => {
                    if (dragState?.type !== "filter") return;
                    event.preventDefault();
                    setActiveDropTarget("ungrouped");
                  }}
                  onDragLeave={() => {
                    if (activeDropTarget === "ungrouped") {
                      setActiveDropTarget(null);
                    }
                  }}
                  onDrop={(event) => {
                    if (dragState?.type !== "filter") return;
                    event.preventDefault();
                    moveFilter(dragState.id, null);
                    clearDragState();
                  }}
                >
                  <div className="mb-2 flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Ungrouped
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[11px] font-medium">
                      {unorganizedFilters.length}
                    </Badge>
                  </div>
                  {unorganizedFilters.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-muted-foreground">
                      Drop presets here to remove them from a folder.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {unorganizedFilters.map((filter, index) =>
                        renderFilterRow(filter, null, index)
                      )}
                    </div>
                  )}
                </div>

                {folders.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Create folders for teams, workflows, or recurring views, then drag presets into place.
                  </div>
                ) : (
                  folders.map((folder, folderIndex) => {
                    const folderFilters = folder.filterIds
                      .map((filterId) => filterMap.get(filterId))
                      .filter((filter): filter is PremadeFilter => Boolean(filter));

                    return (
                      <div
                        key={folder.id}
                        className={cn(
                          "rounded-lg border bg-card/70 transition-colors",
                          activeDropTarget === `folder:${folder.id}` && "border-primary/70 bg-accent/40"
                        )}
                        onDragOver={(event) => {
                          if (!dragState) return;
                          event.preventDefault();
                          setActiveDropTarget(`folder:${folder.id}`);
                        }}
                        onDragLeave={() => {
                          if (activeDropTarget === `folder:${folder.id}`) {
                            setActiveDropTarget(null);
                          }
                        }}
                        onDrop={(event) => {
                          if (!dragState) return;
                          event.preventDefault();

                          if (dragState.type === "folder") {
                            reorderFolders(dragState.id, folderIndex);
                          } else {
                            moveFilter(dragState.id, folder.id, folderFilters.length);
                          }

                          clearDragState();
                        }}
                      >
                        <div
                          draggable
                          onDragStart={() => handleFolderDragStart(folder.id)}
                          onDragEnd={clearDragState}
                          className="flex items-center gap-2 px-3 py-2"
                        >
                          <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            onClick={() => toggleFolderCollapsed(folder.id)}
                            data-testid={`button-toggle-filter-folder-${folder.id}`}
                          >
                            {folder.isCollapsed ? (
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <Folder className="h-4 w-4 shrink-0 text-primary" />
                            <span className="truncate text-sm font-medium">{folder.name}</span>
                          </button>
                          <Badge variant="outline" className="text-[11px] font-medium">
                            {folderFilters.length}
                          </Badge>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={(event) => {
                                event.stopPropagation();
                                setFolderBeingEdited(folder);
                                setEditingFolderName(folder.name);
                              }}
                              data-testid={`button-edit-filter-folder-${folder.id}`}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDeleteFolder(folder.id);
                              }}
                              data-testid={`button-delete-filter-folder-${folder.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        {!folder.isCollapsed && (
                          <div
                            className={cn(
                              "border-t px-2 py-2",
                              folderFilters.length === 0 && "py-3"
                            )}
                          >
                            {folderFilters.length === 0 ? (
                              <p className="px-2 text-xs text-muted-foreground">
                                Drop presets here to build a folder.
                              </p>
                            ) : (
                              <div className="space-y-1">
                                {folderFilters.map((filter, index) =>
                                  renderFilterRow(filter, folder.id, index)
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full justify-start text-xs"
                  onClick={() => {
                    onClearFilters();
                    setIsOpen(false);
                  }}
                  data-testid="button-clear-filters-menu"
                >
                  <X className="mr-1 h-3 w-3" />
                  Clear All
                </Button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

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
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium">People</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setNewFilterPersonIds(new Set(people.map((person) => person.id)))}
                  >
                    Select All
                  </Button>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded border p-3">
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
                        className="flex flex-1 cursor-pointer items-center gap-2"
                      >
                        <div
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: person.color }}
                        />
                        <span className="text-sm">{person.name}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium">Tasks</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setNewFilterTaskIds(new Set(tasks.map((task) => task.id)))}
                  >
                    Select All
                  </Button>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded border p-3">
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
                        className="flex flex-1 cursor-pointer items-center gap-2"
                      >
                        <div
                          className="h-2 w-2 shrink-0 rounded-full"
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

      <Dialog open={showCreateFolder} onOpenChange={setShowCreateFolder}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">Folder Name</label>
            <Input
              placeholder="e.g., Core Team"
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              data-testid="input-filter-folder-name"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Use folders to group presets by team, workflow, or reporting context.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateFolder(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
              data-testid="button-save-filter-folder"
            >
              Create Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(folderBeingEdited)}
        onOpenChange={(open) => {
          if (!open) {
            setFolderBeingEdited(null);
            setEditingFolderName("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">Folder Name</label>
            <Input
              placeholder="e.g., Core Team"
              value={editingFolderName}
              onChange={(event) => setEditingFolderName(event.target.value)}
              data-testid="input-edit-filter-folder-name"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setFolderBeingEdited(null);
                setEditingFolderName("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveFolderEdit}
              disabled={!editingFolderName.trim()}
              data-testid="button-save-edit-filter-folder"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium">People</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setEditFilterPersonIds(new Set(people.map((person) => person.id)))}
                  >
                    Select All
                  </Button>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded border p-3">
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
                        className="flex flex-1 cursor-pointer items-center gap-2"
                      >
                        <div
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: person.color }}
                        />
                        <span className="text-sm">{person.name}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium">Tasks</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setEditFilterTaskIds(new Set(tasks.map((task) => task.id)))}
                  >
                    Select All
                  </Button>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded border p-3">
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
                        className="flex flex-1 cursor-pointer items-center gap-2"
                      >
                        <div
                          className="h-2 w-2 shrink-0 rounded-full"
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
            <Button variant="outline" onClick={handleCloseEdit}>
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
