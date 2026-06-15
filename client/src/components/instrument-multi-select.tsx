import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { Instrument } from "@shared/schema";

interface InstrumentMultiSelectProps {
  instruments: Instrument[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function InstrumentMultiSelect({ instruments, value, onChange, disabled }: InstrumentMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const selected = instruments.filter((i) => value.includes(i.id));

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  }

  function remove(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    onChange(value.filter((v) => v !== id));
  }

  const label =
    selected.length === 0
      ? "No instrument"
      : selected.length === 1
      ? selected[0].name
      : `${selected.length} instruments`;

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal text-sm h-9"
          >
            <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>{label}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search instruments..." />
            <CommandList>
              <CommandEmpty>No instruments found.</CommandEmpty>
              <CommandGroup>
                {instruments.map((instrument) => {
                  const checked = value.includes(instrument.id);
                  const meta = [instrument.type, instrument.location].filter(Boolean).join(" · ");
                  return (
                    <CommandItem
                      key={instrument.id}
                      value={`${instrument.name} ${meta}`}
                      onSelect={() => toggle(instrument.id)}
                      className="flex items-center gap-2"
                    >
                      <Check className={cn("h-4 w-4 shrink-0", checked ? "opacity-100" : "opacity-0")} />
                      <span className="flex flex-col min-w-0">
                        <span className="truncate">{instrument.name}</span>
                        {meta && <span className="text-xs text-muted-foreground truncate">{meta}</span>}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((instrument) => (
            <Badge key={instrument.id} variant="secondary" className="gap-1 pr-1 text-xs">
              {instrument.name}
              <button
                type="button"
                onClick={(e) => remove(instrument.id, e)}
                className="rounded-sm hover:bg-muted-foreground/20 p-0.5"
                aria-label={`Remove ${instrument.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
