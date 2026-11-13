import type { ComponentProps, KeyboardEvent, ReactElement, ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "cn";
import { Toolbar } from "@base-ui/react/toolbar";
import { Toggle } from "./ui/toggle";
import { DropdownMenu, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { PickItems } from "./MenuPick";
import { Button } from "./ui/button";
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
 *  mode -- as the stock Toggle (aria-pressed) in the toolbar's roving
 *  focus, in its glass variant, round as RoundButton is: filled in the
 *  tint while it is on, the variant's own pressed look. */
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
          variant="glass"
          pressed={pressed}
          onPressedChange={onPressedChange}
          aria-label={label}
          className="size-9 shrink-0 rounded-full px-0"
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
        // The stock Button in its glass variant, in the toolbar's roving
        // focus (Toolbar.Button's render), a capsule the bar's height.
        render={
          <Toolbar.Button
            aria-label={`${name}: ${label}`}
            data-testid={testId}
            render={<Button variant="glass" className={cn("rounded-full px-2 font-semibold tabular-nums", TEXT.note)} />}
          />
        }
      >
        {label}
      </DropdownMenuTrigger>
      <PickItems value={value} choices={choices} onPick={onPick} testId={testId} />
    </DropdownMenu>
  );
}
