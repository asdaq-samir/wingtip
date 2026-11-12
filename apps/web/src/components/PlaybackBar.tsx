import type { ComponentProps, KeyboardEvent, ReactElement, ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "cn";
import { Toolbar } from "@base-ui/react/toolbar";
import { Toggle } from "@base-ui/react/toggle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { GLASS_BUTTON } from "./ui/button";
import { TEXT } from "../lib/text";
import { playbackKey } from "./playbackKeys";

/*
 * One playback bar for everything that plays on the map -- the radar and
 * satellite loop (LoopBar) and the dry run (DryRunControls) -- so the two
 * have the same parts and the same keys, as docs/design/web.md §7 and §11
 * ask ("two playback bars of different shapes" is what to avoid): Base
 * UI's Toolbar round them (one tab stop, the arrows between its buttons,
 * the APG toolbar), Play as a stock toggle (aria-pressed), the speed as a
 * menu (discrete settings are menus, decision 0017), and the scrubber the
 * stock Slider beside them, whose own arrows, Home and End step the
 * frames (the APG slider). Space plays or pauses from the scrubber too.
 */

/** The bar: Base UI's Toolbar, Space heard on it (playbackKey). */
export function PlaybackToolbar({
  label,
  onToggle,
  className,
  children,
  ...rest
}: { label: string; onToggle: () => void; className?: string; children: ReactNode } & Omit<
  ComponentProps<typeof Toolbar.Root>,
  "onKeyDown" | "aria-label" | "className" | "children"
>) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (playbackKey(event.key, event.target) !== "toggle") return;
    event.preventDefault();
    onToggle();
  };
  return (
    <Toolbar.Root aria-label={label} onKeyDown={onKeyDown} className={className} {...rest}>
      {children}
    </Toolbar.Root>
  );
}

/** A round glass button of the bar (RoundButton's look), in the toolbar's
 *  roving focus: `render` is the button itself (RoundButton, CloseButton). */
export function PlaybackButton({ render, ...props }: { render: ReactElement } & ComponentProps<typeof Toolbar.Button>) {
  return <Toolbar.Button render={render} {...props} />;
}

/** One of the bar's on-or-off buttons -- Play, the pilot's view, forecast
 *  mode -- as the stock Base UI Toggle (aria-pressed) in the toolbar's
 *  roving focus, in RoundButton's round glass, filled in the tint while
 *  it is on. */
export function PlaybackToggle({
  pressed,
  onPressedChange,
  label,
  disabled,
  testId,
  children,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  label: string;
  disabled?: boolean;
  testId: string;
  children: ReactNode;
}) {
  return (
    <Toolbar.Button
      render={
        <Toggle
          pressed={pressed}
          onPressedChange={onPressedChange}
          aria-label={label}
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
            "rounded-full",
            GLASS_BUTTON,
            pressed && "bg-tint text-white hover:bg-tint/90 hover:text-white",
          )}
        />
      }
      disabled={disabled}
      data-testid={testId}
    >
      {children}
    </Toolbar.Button>
  );
}

/** Play, at the bar's start: a stock toggle, pressed while it plays. Its
 *  name stays "Play" and its state is aria-pressed, as a toggle button's
 *  is (APG button), where it had been a button renamed Pause. */
export function PlayToggle({
  playing,
  onToggle,
  disabled,
  testId,
}: {
  playing: boolean;
  onToggle: () => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <PlaybackToggle pressed={playing} onPressedChange={onToggle} label="Play" disabled={disabled} testId={testId}>
      {playing ? <Pause className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />}
    </PlaybackToggle>
  );
}

/** How fast it plays, a menu of the speeds (decision 0017: a menu, not a
 *  slider): the speed on the button, the stock menu's radio items under
 *  it. Each item's test id is the button's and its value. */
export function SpeedMenu<T extends string | number>({
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
  const label = choices.find((c) => c.value === value)?.label ?? String(value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Toolbar.Button
            aria-label={`${name}: ${label}`}
            data-testid={testId}
            className={cn(
              "inline-flex h-9 shrink-0 items-center justify-center px-2 font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "rounded-full",
              GLASS_BUTTON,
              TEXT.note,
            )}
          />
        }
      >
        {label}
      </DropdownMenuTrigger>
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
    </DropdownMenu>
  );
}
