import type { ComponentType, ReactNode } from "react";
import { cn } from "cn";
import { Toggle } from "./ui/toggle";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { TEXT } from "../lib/text";

/** A tile's glyph: lucide's, drawn at the tile's size. */
type Glyph = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

/**
 * The Map card's layers as tiles, three to a row, as Apple Maps' Choose
 * Map card and Control Center set theirs (the owner's pick, option A of
 * the map settings canvas, 2026-11-13): each its glyph over its name, in
 * the card's own colour, filled in the tint while on. A tile's whole face
 * is its hit area, at least 44 points every way, so nothing round it is
 * needed (index.css's rule). The grid's gap-2 is the rows' own gap.
 */
const TILE = cn(
  "relative flex h-auto min-h-16 w-full min-w-0 flex-col items-start justify-between gap-1 rounded-(--radius-card) border-0 bg-card px-2.5 py-2 text-left whitespace-normal text-foreground shadow-none",
  "ring-1 ring-border hover:bg-muted data-pressed:bg-tint data-pressed:text-white data-pressed:ring-tint hover:data-pressed:bg-tint/90",
  "[&_svg:not([class*='size-'])]:size-5",
);
const NAME = cn("font-semibold", TEXT.note);
/** A menu tile's choice under its name, a shade lighter. */
const VALUE = cn("block font-normal opacity-85", TEXT.note);

/** An on-or-off layer: Base UI's Toggle (ui/toggle), so it is a pressed
 *  or unpressed button to a screen reader (`aria-pressed`), named by its
 *  words. */
export function LayerToggle({
  name,
  glyph: Mark,
  on,
  onChange,
  testId,
}: {
  name: string;
  glyph: Glyph;
  on: boolean;
  onChange: (on: boolean) => void;
  testId: string;
}) {
  return (
    <Toggle pressed={on} onPressedChange={onChange} data-testid={testId} className={TILE}>
      <Mark aria-hidden />
      <span className={NAME}>{name}</span>
    </Toggle>
  );
}

/** One of a menu tile's choices, made of what the layer's setting holds. */
interface LayerChoice<T extends string | number> {
  value: T;
  label: string;
}

/** One pick of a menu tile: its choices under a heading, each item's
 *  test id `testId` and its value, and the group's own `groupTestId`. */
export interface LayerPick<T extends string | number> {
  heading: string;
  /** What the heading cannot say in a word: whose data it is. */
  note?: string;
  value: T;
  choices: LayerChoice<T>[];
  onPick: (value: T) => void;
  testId: string;
  groupTestId?: string;
}

/**
 * A layer of more than on and off -- the winds aloft at an altitude, the
 * radar loop and its speed -- as a tile whose tap is the stock menu of its
 * choices (Base UI's Menu, ui/dropdown-menu, its radio items with the
 * picked one's checkmark), as discrete settings are here, not sliders.
 * The tile says `pick`'s choice under its name and is filled in the tint
 * while that is not `off`; `more` is a further group of the same menu
 * (LayerPickGroup) under a hairline.
 */
export function LayerMenu<T extends string | number>({
  name,
  glyph: Mark,
  testId,
  pick,
  off,
  more,
}: {
  name: string;
  glyph: Glyph;
  /** The trigger's. */
  testId: string;
  pick: LayerPick<T>;
  /** The value that draws nothing. */
  off: T;
  more?: ReactNode;
}) {
  const shown = pick.choices.find((c) => c.value === pick.value)?.label ?? "";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="inline"
            aria-label={`${name}: ${shown}`}
            data-testid={testId}
            data-pressed={pick.value !== off ? "" : undefined}
            className={TILE}
          >
            <Mark aria-hidden />
            <span className={NAME}>
              {name}
              <span className={VALUE}>{shown}</span>
            </span>
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        <LayerPickGroup pick={pick} />
        {more && (
          <>
            <DropdownMenuSeparator />
            {more}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One group of a menu tile's menu: its heading, a line of whose data
 *  it is, and its choices as radio items. */
export function LayerPickGroup<T extends string | number>({ pick }: { pick: LayerPick<T> }) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>
        {pick.heading}
        {pick.note && <span className="block font-normal">{pick.note}</span>}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={String(pick.value)}
        data-testid={pick.groupTestId}
        onValueChange={(v: string) => {
          const picked = pick.choices.find((c) => String(c.value) === v);
          if (picked) pick.onPick(picked.value);
        }}
      >
        {pick.choices.map((c) => (
          <DropdownMenuRadioItem key={c.value} value={String(c.value)} data-testid={`${pick.testId}-${c.value}`}>
            {c.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}
