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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Ellipsis } from "lucide-react";
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
 * An on-or-off layer with a menu of its own (the Map card's Weather, the
 * owner, 2026-11-14): the tile is LayerToggle, a tap on it the layer on or
 * off, and the ••• in its corner is the stock menu (Base UI's Menu,
 * ui/dropdown-menu) of what the layer draws. The ••• is drawn small, its
 * 44-point hit area a pseudo-element over the tile's corner; a sibling of
 * the tile's button, not inside it, so each tap goes to the one it is on.
 */
export function LayerToggleMenu({
  menuLabel,
  menuTestId,
  children,
  ...tile
}: Parameters<typeof LayerToggle>[0] & { menuLabel: string; menuTestId: string; children: ReactNode }) {
  return (
    <div className="relative min-w-0">
      <LayerToggle {...tile} />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={menuLabel}
              data-testid={menuTestId}
              className={cn(
                "absolute top-1.5 right-1.5 rounded-full",
                // White on the tint while on, open or not; the stock ghost's muted
                // fill would put white dots on near-white.
                tile.on ? "text-white hover:bg-white/15 hover:text-white aria-expanded:bg-white/20 native:text-white" : "text-tint",
                "after:absolute after:-inset-2.5 after:content-['']",
              )}
            >
              <Ellipsis aria-hidden />
            </Button>
          }
        />
        <DropdownMenuContent align="end">{children}</DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** A layer of more than on and off -- the winds aloft at an altitude, the
 *  radar loop and its speed -- as a submenu of a tile's menu (LayerToggleMenu):
 *  its name and its choice now, opening the stock radio items of `pick`
 *  with the picked one's checkmark, as discrete settings are here, not
 *  sliders; `children` a further group of the same submenu. */
export function LayerSubmenu<T extends string | number>({
  name,
  testId,
  pick,
  children,
}: {
  name: string;
  /** The submenu's trigger's. */
  testId: string;
  pick: LayerPick<T>;
  children?: ReactNode;
}) {
  const shown = pick.choices.find((c) => c.value === pick.value)?.label ?? "";
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger data-testid={testId}>
        {name}
        <span className="ml-auto pl-3 text-muted-foreground">{shown}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <LayerPickGroup pick={pick} />
        {children}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
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
