import { type Person } from "@shared/schema";
import { Users, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface PeoplePanelProps {
  people: Person[];
  filterPerson: string | null;
  activePerson: string | null;
  onFilterChange: (personId: string | null) => void;
  onActivePerson: (personId: string | null) => void;
}

export function PeoplePanel({ people, filterPerson, activePerson, onFilterChange, onActivePerson }: PeoplePanelProps) {

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Team Members</h2>
      </div>

      {activePerson && (
        <div className="p-2 bg-primary/10 border border-primary rounded-md text-sm text-center">
          Active for scheduling
        </div>
      )}

      {filterPerson && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onFilterChange(null)}
          className="w-full"
          data-testid="button-clear-person-filter"
        >
          <Filter className="w-3 h-3" />
          <span>Clear Filter</span>
        </Button>
      )}

      <Separator />

      <div className="space-y-2">
        {people.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-people">
            No team members yet. Add one to get started.
          </div>
        ) : (
          people.map((person) => (
            <div
              key={person.id}
              className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer hover-elevate active-elevate-2 ${
                activePerson === person.id ? "bg-primary/20 border-primary" :
                filterPerson === person.id ? "bg-accent" : ""
              }`}
              onClick={() => {
                if (activePerson === person.id) {
                  onActivePerson(null);
                } else {
                  onActivePerson(person.id);
                }
              }}
              data-testid={`person-${person.id}`}
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: person.color }}
                data-testid={`color-indicator-${person.id}`}
              />
              <span className="text-sm font-medium flex-1 truncate" data-testid={`text-person-name-${person.id}`}>
                {person.name}
              </span>
              {activePerson === person.id && (
                <Badge variant="default" className="text-xs">Active</Badge>
              )}
              {filterPerson === person.id && (
                <Badge variant="secondary" className="text-xs">Filtered</Badge>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
