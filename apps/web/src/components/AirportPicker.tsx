import { Suspense, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "cn";
import { TEXT } from "../lib/text";
import { fromChunk } from "../lib/fromChunk";
import { Button } from "./ui/button";
import { ResponsivePopover, ResponsivePopoverContent, ResponsivePopoverTrigger } from "./ResponsivePopover";
import { useIsMobile } from "../hooks/use-mobile";
import { askSearchPick, useSearchPick } from "../lib/oneSearch";

// The search it opens (AirportSearch: Base UI's Autocomplete, the lookup's rows, the
// Favorites' tiles) on a chunk of its own, not the first load's: the
// first screen draws the button alone (scripts/first-load.mjs's budget,
// 2026-11-09). Asked for a moment after the page has drawn, and at a
// finger on the button, so an open draws it straight from the chunk.
const { Part: Search, prefetch: prefetchSearch } = fromChunk(
  () => import("./AirportSearch"),
  (m) => m.default,
);
const SEARCH_AFTER_MS = 2000;

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
  invalid?: boolean;
  className?: string;
  /** "pill": the ident alone, a point of a route in its box (RouteBox). */
  look?: "field" | "pill";
  testId?: string;
  /** A stop's: the VFR and GPS waypoints as well as the airports
   *  (useAirportSearch), a route flying through one. */
  fixes?: boolean;
  /** Whether the search is out, where its opener is elsewhere -- a
   *  route's airport, whose tap opens its card, changed from its menu
   *  (RouteBox) -- with what to do as it opens or closes. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** What a tap on the button does in place of opening the search. */
  onTap?: () => void;
  /** What the button shows in place of the ident and its chevron: FPL's
   *  split route line, its mark and the airport's name with it
   *  (RouteSplit). */
  children?: ReactNode;
}

/**
 * DEP or DEST as shadcn's own combobox: a button showing the ident that
 * opens a `Command` -- its search box, its list, its keyboard handling
 * (Up/Down/Enter/Escape, the highlighted row, `aria-activedescendant`)
 * all Base UI's Autocomplete's -- with the airport lookup as the list. Typing "duluth"
 * surfaces KDLH the same as typing "KDL" would, for a pilot who does
 * not have every ident memorised; an ident the lookup does not know
 * (a private strip, say) still goes through on Enter. This replaced a
 * hand-rolled input-anchored combobox that carried its own keyboard
 * navigation and ARIA wiring; the stock shape costs one more tap and
 * gives a phone a full-width search box and rows the size of a finger
 * -- in a sheet from the navigation bar's edge there, as every panel
 * is, where it was a popover the keyboard covered half of.
 */
export default function AirportPicker({
  value,
  onChange,
  placeholder,
  ariaLabel,
  invalid,
  className,
  look = "field",
  testId,
  fixes = false,
  open: shown,
  onOpenChange,
  onTap,
  children,
}: Props) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = shown ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const onPhone = useIsMobile();
  useEffect(() => {
    const later = window.setTimeout(prefetchSearch, SEARCH_AFTER_MS);
    return () => window.clearTimeout(later);
  }, []);

  const pick = (ident: string) => {
    onChange(ident.toUpperCase());
    setOpen(false);
    setQuery("");
  };
  // One search field (the one card rule, the owner 2026-11-10): where the
  // planner's one search is drawn, the picker asks it for the airport,
  // scoped to what this picker sets, rather than opening a search of its
  // own over the sheet. The developer's page has none: its own then.
  const oneSearch = useSearchPick((s) => s.fields > 0);
  const toOneSearch = () => askSearchPick({ label: placeholder, fixes, onPick: (ident) => onChange(ident.toUpperCase()) });
  // Opened from elsewhere (the route's menu's Change): handed on the same.
  const handOn = useEffectEvent(() => {
    onOpenChange?.(false);
    toOneSearch();
  });
  useEffect(() => {
    if (shown && oneSearch) handOn();
  }, [shown, oneSearch]);

  return (
    // On a phone a card at the sheet's size, the keyboard placed by the
    // Drawer (VirtualKeyboardProvider), never raised for the field.
    <ResponsivePopover
      open={open && !oneSearch}
      onOpenChange={(next) => {
        if (next && oneSearch) return toOneSearch();
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <ResponsivePopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          // A combobox where a tap opens the search; a button where it
          // opens the airport's card (`onTap`), the search its menu's.
          role={onTap ? undefined : "combobox"}
          aria-expanded={onTap ? undefined : open}
          // Its ident first, as seen, then which field (WCAG 2.5.3, Label
          // in Name): "C81, Departure"; empty, the placeholder it shows.
          aria-label={value && !children ? `${value}, ${ariaLabel}` : ariaLabel}
          aria-invalid={invalid}
          data-testid={testId}
          onPointerDown={prefetchSearch}
          // A tap the caller's (`onTap`), not the trigger's opening: the
          // trigger's own toggle is kept from running (preventDefault on a
          // phone's card, Base UI's handler from md up).
          onClick={
            onTap
              ? (e) => {
                  e.preventDefault();
                  (e as { preventBaseUIHandler?: () => void }).preventBaseUIHandler?.();
                  onTap();
                }
              : undefined
          }
          // A field, as a search box is: its ident in the text's colour
          // (not a button's tint) at a row's size (TEXT). A route's pill
          // in the system face, semibold, at a line under a row's (15):
          // in the monospaced face at 17 two took a phone's line, the pilot
          // asked for three.
          className={
            look === "pill"
              ? cn("font-semibold uppercase text-foreground", TEXT.detail, className)
              : cn("font-mono uppercase text-foreground", TEXT.row, !value && "text-muted-foreground", className)
          }
        >
          {children ?? (
            <>
              {value || placeholder}
              {look === "field" && <ChevronsUpDown className="text-muted-foreground" />}
            </>
          )}
        </Button>
      </ResponsivePopoverTrigger>
      {/* The panel's own search, as the search bar is with no route: on a
          phone a sheet from the top, the field a capsule at its top,
          Favorites and Recents under it until something is typed. */}
      <ResponsivePopoverContent
        title={`${ariaLabel} airport`}
        titleHidden
        className="w-96 p-3"
        align="start"
        // As tall as what it holds, at the owner's pick ("a tall, mostly
        // empty glass pane" before anything was typed): the field and
        // Favorites and Recents, growing as rows come in, to the screen's
        // height at most. Not sized to what was in sight above the
        // keyboard, which stayed half a card once the keyboard went (iOS
        // does not always say so): the list's room under it for the
        // keyboard (below) is what it grows by while the keyboard is up.
        style={onPhone ? { maxHeight: "calc(100dvh - 1rem - env(safe-area-inset-top))" } : undefined}
        // The field focused as it opens, as the search bar is on its tap:
        // the sheet's own first focus went to the sheet itself.
        initialFocus={input}
      >
        {/* Its own wait, the card empty a moment at a first open before
            the chunk is in hand, not the panel round it. */}
        <Suspense fallback={null}>
          <Search
            query={query}
            setQuery={setQuery}
            open={open}
            fixes={fixes}
            ariaLabel={ariaLabel}
            input={input}
            onPick={pick}
            onClose={() => {
              setOpen(false);
              setQuery("");
            }}
          />
        </Suspense>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  );
}
