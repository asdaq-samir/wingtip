import { useState, type ReactNode } from "react";
import { BookOpenCheck, LocateFixed, MoveUpRight, Siren } from "lucide-react";
import { cn } from "cn";
import { Command, CommandDialog, CommandInput, CommandItem, CommandList, CommandShortcut } from "../../../components/ui/command";
import { AirportRow, PickerGroup } from "../../../components/AirportResults";
import { useAirportSearch } from "../../../lib/useAirportSearch";
import { useRadioActions } from "../../../lib/atcRadio";
import { wantPlace, wantScreen } from "../../../lib/navigation/wanted";
import { SCREENS, type ScreenId } from "../../../lib/navigation/generated/screens";
import { closePalette, type PaletteMode } from "../../../lib/palette";
import { DIRECT_KEY, SCREEN_KEYS } from "../../../hooks/use-shortcuts";
import { TEXT } from "../../../lib/text";

/** The common actions, each with its letter where it has one
 *  (hooks/use-shortcuts): the Brief, Nearest, Direct To (the airport asked
 *  next) and the emergency assistant. */
const ACTIONS: { id: "direct" | ScreenId; label: string; icon: ReactNode; keys?: string }[] = [
  { id: "direct", label: "Direct To…", icon: <MoveUpRight />, keys: DIRECT_KEY },
  { id: "brief", label: "Brief", icon: <BookOpenCheck />, keys: SCREEN_KEYS.brief },
  { id: "nearest", label: "Nearest", icon: <LocateFixed />, keys: SCREEN_KEYS.nearest },
  { id: "emergency", label: "Emergency", icon: <Siren className="text-destructive-ink" /> },
];

/** What is typed found in a name, ignoring case. */
const finds = (typed: string, name: string) => !typed || name.toLowerCase().includes(typed.toLowerCase());

/**
 * The command palette (⌘K, Ctrl K; the owner, 2026-11-09), on the stock
 * shadcn Command, on Base UI's Autocomplete inside a Base UI Dialog: one field that finds an airport (its card
 * opened, as the Airport tab's search does), opens any screen a link can
 * (design/screens.json's list, generated into lib/navigation), and runs
 * the common actions -- Direct To, the Brief, Nearest, the emergency
 * assistant -- with each one's key beside it. An addition: every screen
 * and action keeps its own place in the panel. Direct To asks the
 * airport next, in the same field, and says here why it could not fly
 * one (lib/problems' rule: where it happens, not in a toast).
 */
export default function CommandPalette({ mode }: { mode: PaletteMode }) {
  const [typed, setTyped] = useState("");
  const [direct, setDirect] = useState(mode === "direct");
  const [problem, setProblem] = useState<string | null>(null);
  const directTo = useRadioActions((s) => s.directTo);
  const { rows, answered } = useAirportSearch(typed);
  const airports = rows.filter((r) => r.kind !== "fix");
  const actions = direct ? [] : ACTIONS.filter((a) => (a.id !== "direct" || directTo) && finds(typed, a.label));
  const screens = direct ? [] : (Object.keys(SCREENS) as ScreenId[]).filter((id) => finds(typed, SCREENS[id].title));

  const run = (id: "direct" | ScreenId) => {
    if (id === "direct") {
      setDirect(true);
      setTyped("");
      return;
    }
    closePalette();
    wantScreen(id);
  };
  const pick = async (ident: string) => {
    if (!direct) {
      closePalette();
      wantPlace(ident);
      return;
    }
    const why = directTo ? await directTo(ident) : "Direct To needs a route or the airplane's position.";
    if (why) setProblem(why);
    else closePalette();
  };

  return (
    <CommandDialog
      open
      onOpenChange={(open) => !open && closePalette()}
      title="Search and Commands"
      description="Find an airport, open a screen or run an action."
      className="max-w-lg shadow-overlay"
    >
      <Command
        // The highlight always on a row, as a palette's is, so Enter takes
        // the first one shown without an arrow first (cmdk's way).
        autoHighlight="always"
        value={typed}
        onValueChange={(v) => {
          setTyped(v);
          setProblem(null);
        }}
        className="bg-transparent"
        data-testid="command-palette"
      >
        <CommandInput
          placeholder={direct ? "Direct to which airport?" : "Search airports, screens and actions"}
          data-testid="command-palette-input"
        />
        {problem && (
          <p role="alert" className={cn("appear px-3 pt-2 text-destructive-ink", TEXT.note)} data-testid="command-palette-problem">
            {problem}
          </p>
        )}
        <CommandList className={cn("max-h-[min(24rem,60dvh)] px-1 pb-1", !answered && "opacity-60")} aria-busy={!answered}>
          {airports.length > 0 && (
            <PickerGroup heading={direct ? "Direct To" : "Airports"}>
              {airports.map((r) => (
                <AirportRow
                  key={r.ident}
                  airport={{ ident: r.ident, name: r.name, municipality: r.municipality }}
                  onSelect={() => void pick(r.ident)}
                  testId="command-palette-airport"
                />
              ))}
            </PickerGroup>
          )}
          {actions.length > 0 && (
            <PickerGroup heading="Actions">
              {actions.map((a) => (
                <CommandItem key={a.id} value={`action-${a.id}`} onClick={() => run(a.id)} data-testid={`command-palette-${a.id}`}>
                  {a.icon}
                  <span className={TEXT.row}>{a.label}</span>
                  {a.keys && <CommandShortcut>{a.keys}</CommandShortcut>}
                </CommandItem>
              ))}
            </PickerGroup>
          )}
          {screens.length > 0 && (
            <PickerGroup heading="Go To">
              {screens.map((id) => (
                <CommandItem key={id} value={`screen-${id}`} onClick={() => run(id)} data-testid={`command-palette-screen-${id}`}>
                  <span className={TEXT.row}>{SCREENS[id].title}</span>
                  {SCREEN_KEYS[id] && <CommandShortcut>{SCREEN_KEYS[id]}</CommandShortcut>}
                </CommandItem>
              ))}
            </PickerGroup>
          )}
          {airports.length + actions.length + screens.length === 0 && (
            <p className={cn("px-3 py-6 text-center text-muted-foreground", TEXT.prose)}>
              {direct && !typed ? "Type an airport's ident or name." : answered ? "Nothing found." : "Searching…"}
            </p>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
