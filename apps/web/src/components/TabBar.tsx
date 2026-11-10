import { useContext } from "react";
import { GearGlyph, type TabGlyph } from "../lib/glyphs/tabGlyphs";
import { cn } from "cn";
import { Badge } from "./ui/badge";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { TEXT } from "../lib/text";
import { PanelSize, useConsoleOpen } from "../lib/mapChrome";
import { closeSheetCards } from "../lib/sheetCards";
import { withTabTransition } from "../lib/viewTransition";

/** One of a page's places, a tab of its bar: its word and its glyph. */
export interface BarTab<T extends string> {
  value: T;
  label: string;
  icon: TabGlyph;
}

/**
 * A page's tabs, the stock Tabs (shadcn's, on Base UI): the planner's FPL,
 * Airport and Airplane, the developer's Train and Perf, and on both Setup
 * last, a glyph over its word, the one picked in the tint. The panel's
 * first row, over its pill at rest as over the sheet (MapPanel), and
 * static, as the platform's own tabs are, at the owner's decision
 * (2026-11-09: "tabs behave as each platform's stock tabs do"): no
 * minimized one-tab bar, no swipe or wheel of its own, and not the
 * sheet's handle -- the sheet is dragged by its grabber. Tab roles and the
 * arrow keys are Base UI's. A card open over a tab has its own name, close
 * and Share in its head (PanelCard's CardHead, SheetCard).
 *
 * Setup is the console, out while it is the tab picked (its test id
 * setup-button), and where the focus goes back to as the console closes
 * (`data-console-button`, MapPage).
 */
export default function TabBar<T extends string>({
  tabs,
  tab,
  onPick,
  onUp,
  marks,
  onClose,
  listOver = false,
  className,
}: {
  tabs: BarTab<T>[];
  tab: T;
  onPick: (tab: T) => void;
  /** The tab up tapped: on the pill, the panel opened to it. */
  onUp?: () => void;
  /** A tab with something to fix (red) or to look at (amber), as the
   *  route's own tabs mark theirs: FPL's where the route has no legal
   *  altitude. */
  marks?: Partial<Record<T, "stop" | "caution">>;
  /** The tab up tapped again with a card open over it: the card put away,
   *  as an iOS tab tapped goes back to its first screen. */
  onClose?: () => void;
  /** A list in full open over the tab -- its Favorites, Saved, Nearest --
   *  which the tab up tapped again puts away (`onUp`). */
  listOver?: boolean;
  className?: string;
}) {
  const consoleOpen = useConsoleOpen((s) => s.open);
  const setConsoleOpen = useConsoleOpen((s) => s.setOpen);
  const all: BarTab<T | "setup">[] = [...tabs, { value: "setup", label: "Setup", icon: GearGlyph }];
  const up: T | "setup" = consoleOpen ? "setup" : tab;
  const size = useContext(PanelSize);
  // A tab picked: Setup's the console, the others the workspace's
  // (onPick); another tab's page is not what a card was opened over.
  const pick = (value: T | "setup") => {
    closeSheetCards();
    if (value === "setup") {
      setConsoleOpen(true);
      return;
    }
    if (consoleOpen) {
      setConsoleOpen(false);
      // Back from Setup to the tab under it as it was left, a card open
      // over it still open, as each of an iOS app's tabs keeps its screen.
      if (value === tab) return;
    }
    onPick(value as T);
  };
  // Another tab opens at the size the sheet is, half from the pill.
  const choose = (value: T | "setup") => {
    if (value === up) return;
    const change = () => {
      pick(value);
      if (size?.size === "peek") size.to("half");
    };
    if (!size || size.size === "peek") change();
    else withTabTransition(change);
  };
  // The tab up tapped again: its card put away, a list in full closed, or
  // the panel up from its pill; Base UI's Tabs hear only a change.
  const again = () => {
    if (!size) return onUp?.();
    if (size.card) onClose?.();
    else if (listOver && size.size !== "peek") onUp?.();
    else if (size.size === "peek") size.to("half");
  };
  return (
    <Tabs
      value={up}
      onValueChange={(value) => choose(value as T | "setup")}
      className={cn("h-full w-full gap-0 print:hidden", className)}
      data-testid="tab-bar"
    >
      <TabsList variant="line" aria-label="Tabs" className="h-full! w-full gap-0 p-0">
        {all.map(({ value, label, icon: Icon }) => {
          const current = value === up;
          const mark = value === "setup" ? undefined : marks?.[value as T];
          return (
            <TabsTrigger
              key={value}
              value={value}
              onClick={() => {
                if (current) again();
              }}
              data-testid={value === "setup" ? "setup-button" : `tab-${value}`}
              data-console-button={value === "setup" ? "" : undefined}
              // Its mark said to a reader, after its name.
              aria-label={mark ? `${label}, ${mark === "stop" ? "warning" : "caution"}` : undefined}
              className={cn(
                // A glyph over its word, the tab up in the tint (over the
                // Base UI tab's own active colour), the others the text's
                // colour; the line
                // variant's underline left off, as iOS draws none. Each
                // tab is the row's height, past 44 points.
                "h-full flex-col gap-0.5 rounded-lg after:hidden",
                current ? "text-tint data-active:text-tint dark:data-active:text-tint" : "text-foreground/80 hover:text-foreground",
              )}
            >
              <span className="relative">
                <Icon className="size-[26px]" filled={current} />
                {mark && (
                  <Badge
                    aria-hidden="true"
                    data-testid={`tab-mark-${value}`}
                    data-finding={mark}
                    variant={mark === "stop" ? "destructive" : "default"}
                    className={cn(
                      "absolute -top-0.5 -right-1 size-2 min-w-0 border-0 p-0",
                      mark === "stop" ? "bg-destructive" : "bg-caution",
                    )}
                  />
                )}
              </span>
              <span className={cn(current ? "font-bold" : "font-semibold", TEXT.tabBar)}>{label}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
