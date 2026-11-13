import type { ReactNode } from "react";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "cn";
import PullDown, { type PullDownOption } from "./PullDown";
import { TEXT } from "../lib/text";

/** A control's tile: a rounded card, its mark at the left, its name over
 *  its setting. Its own height is past 44, so it needs no area of its
 *  own. */
const TILE = cn(
  "group flex h-auto min-h-14 w-full min-w-0 items-center justify-start gap-2.5 rounded-2xl bg-card px-2.5 py-2 text-left outline-none",
  "hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-pressed:bg-card",
);

function Face({ icon, label, value, menu = false }: { icon: ReactNode; label: string; value: string; menu?: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-foreground group-data-pressed:bg-primary group-data-pressed:text-primary-foreground [&_svg]:size-4"
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={cn("truncate font-semibold text-foreground", TEXT.detail)}>{label}</span>
        <span className={cn("flex items-center gap-0.5 truncate", menu ? "text-tint" : "text-muted-foreground", TEXT.note)}>
          {value}
          {menu && <ChevronsUpDown className="size-3 shrink-0" aria-hidden />}
        </span>
      </span>
    </>
  );
}

/** A tile that is a pick of a few: a tap its menu (PullDown), the one
 *  picked under its name. Setup's Layout (QuickControls) and the first
 *  flight's welcome (WelcomeSheet) draw the same tiles. */
export default function MenuTile<V extends string>({
  label,
  value,
  onChange,
  options,
  icon,
  on,
  testId,
}: {
  label: string;
  value: V;
  onChange: (value: V) => void;
  options: PullDownOption<V>[];
  icon: ReactNode;
  /** Its mark filled in the tint, as a toggle's while on. */
  on: boolean;
  testId: string;
}) {
  const words = String(options.find((o) => o.value === value)?.label ?? "");
  return (
    <PullDown
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      align="start"
      trigger={
        <button type="button" aria-label={`${label}: ${words}`} data-testid={testId} data-pressed={on ? "" : undefined} className={TILE}>
          <Face icon={icon} label={label} value={words} menu />
        </button>
      }
    />
  );
}
