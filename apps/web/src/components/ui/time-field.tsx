import { useId, useRef, useState } from "react";
import { ListBox, ListBoxItem, type Selection } from "react-aria-components";
import { cn } from "cn";
import { twoFigures } from "../../lib/format";
import { TEXT } from "../../lib/text";
import { Button } from "./button";

const HOURS = Array.from({ length: 24 }, (_, h) => twoFigures(h));
const MINUTES = Array.from({ length: 60 }, (_, m) => twoFigures(m));

/** A wheel's row: a finger's 44, the figure centred, the one picked
 *  filled in the tint as the calendar's day is. */
const ROW =
  "flex h-11 shrink-0 items-center justify-center rounded-md tabular-nums outline-none select-none cursor-default data-focus-visible:ring-2 data-focus-visible:ring-ring data-hovered:not-data-selected:bg-muted/50 data-selected:bg-primary data-selected:text-primary-foreground";

/** One wheel, hours or minutes: React Aria's ListBox, one pick, its rows
 *  scrolling under a finger, the one picked brought to the middle when it
 *  opens. No scroll snap: Chrome snapped back to the row first in the
 *  middle each time a pick drew the wheel again. */
function Wheel({
  label,
  items,
  value,
  onPick,
  testId,
}: {
  label: string;
  items: string[];
  value: string;
  onPick: (v: string) => void;
  testId?: string;
}) {
  // The one picked brought to the middle once, as it first draws: React
  // Aria lays its rows out after the box, so a layout effect on the box
  // found none. Its own scroll alone: scrollIntoView moved the sheet too.
  const placed = useRef(false);
  const toMiddle = (row: HTMLElement | null) => {
    const box = row?.parentElement;
    if (!row || !box || placed.current) return;
    placed.current = true;
    const [r, b] = [row.getBoundingClientRect(), box.getBoundingClientRect()];
    box.scrollTop += r.top - b.top - (b.height - r.height) / 2;
  };
  return (
    <ListBox
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={(keys: Selection) => {
        const key = keys === "all" ? undefined : keys.values().next().value;
        if (key != null) onPick(String(key));
      }}
      data-testid={testId}
      className={cn("flex h-44 w-16 flex-col gap-0.5 overflow-y-auto overscroll-contain py-16 outline-none", TEXT.row)}
    >
      {items.map((v) => (
        <ListBoxItem key={v} id={v} textValue={v} className={ROW} ref={v === value ? toMiddle : undefined}>
          {v}
        </ListBoxItem>
      ))}
    </ListBox>
  );
}

/**
 * A time of day, "HH:mm" on the 24-hour clock a pilot reads, as iOS's
 * compact time picker is: one button showing it ("15:00", the zone after
 * it where one is given), a tap opening the hours and the minutes under it
 * as two wheels, each a pick ("Departure time, 15:00 CST: change" to a
 * screen reader, the time in sight in its name, WCAG 2.5.3). Where it was
 * React Aria's TimeField, an hour and a minute segment each some 20 points
 * wide and 25 apart, which no 44-point square could each own without one
 * covering the other (the iOS audit's P1 on the departure picker; the
 * owner, 2026-11-21: "one button ... as iOS does"). Not the browser's
 * `<input type="time">`: on an iPhone set to the 12-hour clock it says
 * "3:00 PM", and every browser draws it its own way.
 *
 * Each pick is said at once (`onChange`), against what was picked, not
 * what came back: a caller that holds the time inside a range (a stop's
 * leaving) may hand back another, and the next pick still means the hour
 * or minute the pilot set.
 */
function TimeField({
  value,
  onChange,
  zone,
  className,
  "aria-label": label,
  "data-testid": testId,
}: {
  value: string;
  onChange: (hhmm: string) => void;
  /** The clock's zone, as the app writes it ("CST"). */
  zone?: string;
  className?: string;
  "aria-label": string;
  "data-testid"?: string;
}) {
  const wheels = useId();
  // What the wheels show while open: the pilot's own picks.
  const [draft, setDraft] = useState<string | null>(null);
  const [hour = "00", minute = "00"] = (draft ?? value).split(":");
  const pick = (next: string) => {
    setDraft(next);
    onChange(next);
  };
  const open = draft !== null;
  return (
    <div className="flex flex-col items-center gap-2" data-slot="time-field">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-expanded={open}
        aria-controls={open ? wheels : undefined}
        onClick={() => setDraft(open ? null : value)}
        // Named with what it shows (WCAG 2.5.3): "Departure time, 15:00
        // CST: change".
        aria-label={`${label}, ${[value || "no time", zone].filter(Boolean).join(" ")}: change`}
        data-testid={testId}
        // A finger's 44 round its 32: a band eight proud above and below.
        className={cn(
          "relative gap-1 font-normal tabular-nums after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']",
          className,
        )}
      >
        {value || "--:--"}
        {/* A space between, for a reader of the text: the flex gap draws it. */}
        {zone && " "}
        {zone && <span className={cn("text-muted-foreground", TEXT.caption)}>{zone}</span>}
      </Button>
      {open && (
        <div id={wheels} className="flex items-center gap-1" data-testid={testId ? `${testId}-wheels` : undefined}>
          <Wheel label="Hours" items={HOURS} value={hour} onPick={(h) => pick(`${h}:${minute}`)} testId={testId && `${testId}-hours`} />
          <span aria-hidden="true" className={cn("text-muted-foreground", TEXT.row)}>
            :
          </span>
          <Wheel
            label="Minutes"
            items={MINUTES}
            value={minute}
            onPick={(m) => pick(`${hour}:${m}`)}
            testId={testId && `${testId}-minutes`}
          />
        </div>
      )}
    </div>
  );
}

export { TimeField };
