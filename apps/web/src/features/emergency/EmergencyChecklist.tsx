import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { TEXT } from "../../lib/text";
import type { EmergencyModel } from "./useEmergency";

/**
 * The airplane's own emergency checklist (lib/checklists, the pilot's
 * copy of its handbook's Section 3), opened at the emergency asked --
 * "Engine failure in flight" by default (features/emergency/emergency checklistSection)
 * -- with a menu of its other sections, each item ticked as it is done.
 * The app writes none: with no list kept it says so.
 */
export default function EmergencyChecklist({ vm }: { vm: EmergencyModel }) {
  const { sections, section, pickSection, airplaneName } = vm;
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  if (section === null) {
    return (
      <ListGroup title="Checklist">
        <ListRow
          muted
          title={`No emergency checklist for ${airplaneName ?? "this airplane"}`}
          description="Write it from the airplane's handbook in Brief's Checklists"
          data-testid="emergency-no-checklist"
        />
      </ListGroup>
    );
  }
  const shown = sections[section]!;
  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative text-tint after:absolute after:-inset-1.5"
          data-testid="emergency-checklist-pick"
        >
          Other <ChevronDown className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={String(section)}
          onValueChange={(v) => {
            pickSection(Number(v));
            setTicked({});
          }}
        >
          {sections.map((s, i) => (
            <DropdownMenuRadioItem key={`${i}:${s.title}`} value={String(i)}>
              {s.title}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return (
    <ListGroup title={shown.title} action={menu}>
      {shown.items.map((item, i) => {
        const key = `${section}:${i}`;
        return (
          <ListRow
            key={key}
            checkbox={{ checked: !!ticked[key], onChange: (on) => setTicked((t) => ({ ...t, [key]: on })) }}
            title={<span className={cn(TEXT.row, ticked[key] && "text-muted-foreground")}>{item.challenge}</span>}
            value={item.response ?? undefined}
            data-testid="emergency-checklist-item"
          />
        );
      })}
    </ListGroup>
  );
}
