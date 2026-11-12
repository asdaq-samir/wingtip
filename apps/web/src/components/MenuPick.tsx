import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { TEXT } from "../lib/text";

/** The menu's radio items, one per choice: the pick as the value it was
 *  made of, each item's test id the trigger's and its value. MenuPick and
 *  the playback bar's SpeedMenu share it. */
export function PickItems<T extends string | number>({
  value,
  choices,
  onPick,
  testId,
}: {
  value: T;
  choices: { value: T; label: string }[];
  onPick: (value: T) => void;
  testId: string;
}) {
  return (
    <DropdownMenuContent align="end">
      <DropdownMenuRadioGroup
        value={String(value)}
        onValueChange={(v: string) => {
          const picked = choices.find((c) => String(c.value) === v);
          if (picked) onPick(picked.value);
        }}
      >
        {choices.map((c) => (
          <DropdownMenuRadioItem key={c.value} value={String(c.value)} data-testid={`${testId}-${c.value}`}>
            {c.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  );
}

/**
 * A setting of a few choices as a menu at a row's end (the owner's rule:
 * discrete settings are menus, not sliders): its value in the tint, the
 * stock DropdownMenu's radio items under it. Each item's test id is the
 * trigger's and its value.
 */
export default function MenuPick<T extends string | number>({
  name,
  value,
  choices,
  onPick,
  testId,
}: {
  name: string;
  value: T;
  choices: { value: T; label: string }[];
  onPick: (value: T) => void;
  testId: string;
}) {
  const label = choices.find((c) => c.value === value)?.label ?? choices[0]?.label;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`${name}: ${label}`}
            data-testid={testId}
            className={cn(
              "relative flex h-8 items-center gap-0.5 rounded-full bg-foreground/8 px-2.5 font-semibold text-tint outline-none after:absolute after:-inset-1.5 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring",
              TEXT.detail,
            )}
          >
            {label}
            <ChevronDown className="size-4" aria-hidden="true" />
          </button>
        }
      />
      <PickItems value={value} choices={choices} onPick={onPick} testId={testId} />
    </DropdownMenu>
  );
}
