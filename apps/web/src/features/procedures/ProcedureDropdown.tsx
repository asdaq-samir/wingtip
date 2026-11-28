import { useState, type MouseEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import type { ProcedureSummary } from "../../lib/api/types";
import { usePreferences } from "../../lib/preferences";
import { transitionWords } from "../../lib/procedures";
import { TEXT } from "../../lib/text";
import { WORDING } from "../../lib/wording/generated/wording";
import type ProcedureMenu from "./ProcedureMenu";
import { ALL, approachGroups, NONE, PROCEDURES_FAILED, shortName } from "./procedureWords";
import { procedureTrigger, TITLE } from "./ProcedureTrigger";

type MenuProps = Parameters<typeof ProcedureMenu>[0];

/** A runway's page's title, its name: a row's 17, semibold, in the words'
 *  colour, as iOS titles a submenu opened in place, where a group's grey
 *  13 left the page's one heading the least thing on it (the owner,
 *  2026-11-25: "runway heading seem too small"; "Yes"). */
const PAGE_TITLE = cn(TEXT.row, "font-semibold text-foreground");

/**
 * A kind's procedures on FPL's Landing and Takeoff, picked from the stock
 * dropdown menu as the runway's pill picks its runway (RunwayPill), at the
 * owner's ask (2026-11-25: "Can I select the procedures using similar menu
 * as runway?"), where it was the sheet of pages the list read in flight
 * still opens (ProcedureMenu): each one a radio item picked at one tap,
 * from vectors or its common route, its transition then picked from the
 * picked one's menu (Transition ›); an approach's the runway landed on's
 * alone, every runway behind "‹ All Runways" at its top (the owner,
 * 2026-11-25: "make this all about the selected runway and then also let
 * the user go back to see other procedures"); then Direct To, the plate,
 * the lesson, none of the kind, and the field's whole list. A picked
 * one's menu is its pill's chip; the pill folds its fixes (FoldSection).
 * `windHead`, the field's wind (fieldParts' WindLine), heads All Runways
 * as it heads the runway's own menu (RunwayPill).
 */
export function ProcedureDropdown(m: MenuProps & { windHead?: ReactNode }) {
  const { kind, list, query, picked, fixes = [], look = "slim" } = m;
  const all = (list?.procedures ?? []).filter((p) => p.kind === kind);
  const plates = usePreferences((s) => s.plates);
  const { byRunway, first, others } = approachGroups(all, kind, m.runway, m.windward);
  const runwayName = (r: string) => (r === "Circling" ? "Circling" : `Runway ${r}${r === m.windward ? " · into the wind" : ""}`);
  const pickedOne = all.find((p) => p.id === picked?.id);
  // Two pages (the owner, 2026-11-25: "Keep the approach menu to two pages
  // one for all the runways and then when a runway is selected"): a
  // runway's approaches, the one landed on's as the menu opens, each with
  // "‹ All Runways" at its top in the tint; and every runway, the landed
  // on's first, a tap opening its page, where it was three deep (the
  // landed on's, the others, one of them) with Back to the one before.
  const [page, setPaged] = useState<"runways" | string | null>(null);
  // A page turned under a finger lit the row that came under it (iOS
  // fires its hover where the tap was), reading as picked (the owner's
  // iPhone, 2026-11-25): no row lit till the next press or a mouse moves.
  const [turned, setTurned] = useState(false);
  // The menu's width held across its pages, never narrower than the page
  // it was turned from, so the rows do not shift under the finger.
  const [minWidth, setMinWidth] = useState<number | undefined>(undefined);
  const setPage = (to: "runways" | string | null, event: MouseEvent<HTMLElement>) => {
    const popup = event.currentTarget.closest<HTMLElement>("[data-slot=dropdown-menu-content]");
    setPaged(to);
    // A keyboard's Enter (a click of no presses) keeps its row lit.
    setTurned(event.detail > 0);
    if (!popup) return;
    setMinWidth((w) => Math.max(w ?? 0, popup.offsetWidth));
    // The new page from its top, its first row focused: the row the focus
    // was on is gone, and the arrows and VoiceOver go on from there.
    requestAnimationFrame(() => {
      popup.scrollTop = 0;
      popup.querySelector<HTMLElement>("[role^=menuitem]:not([aria-disabled=true])")?.focus();
    });
  };
  // approachGroups' first is a runway whenever there is an approach.
  const runways = first === null ? others : [first, ...others];
  // The runway landed on has none (KPWK's 12): the menu opens on every
  // runway's, saying so, where it opened on the one most into the wind's
  // as if it were the runway's own (the owner's iPhone, 2026-11-26: "Why
  // are approaches being shown for runway 16, when 12 is selected?").
  const noneHere = kind === "approach" && m.runway !== null && !byRunway.has(m.runway) && runways.length > 0;
  const opening = noneHere ? "runways" : null;
  // What a runway's row says at its right: the approach picked there, else its approaches' kinds.
  const aside = (r: string) => {
    const there = byRunway.get(r) ?? [];
    const on = there.find((p) => p.id === picked?.id);
    return on ? shortName(on) : [...new Set(there.map((p) => shortName(p).split(" ")[0]))].join(", ");
  };
  const toRunways = runways.length > 1 && (
    <DropdownMenuItem closeOnClick={false} onClick={(e) => setPage("runways", e)} className="text-tint" data-testid="procedure-menu-back">
      {/* The chevron's stroke in the rows' words' column, the words close after it, as iOS's Back. */}
      <ChevronLeft className="-mr-1 -ml-1.5" />
      All Runways
    </DropdownMenuItem>
  );
  const paged =
    page === "runways" ? (
      <>
        {/* The wind over the runways, as the runway's own menu has it (the owner, 2026-11-25). */}
        {m.windHead && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-foreground">{m.windHead}</DropdownMenuLabel>
          </DropdownMenuGroup>
        )}
        {noneHere && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-muted-foreground" data-testid="procedure-menu-none-here">
              No approaches to Runway {m.runway}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
        )}
        {runways.map((r) => (
          <DropdownMenuItem
            key={r}
            closeOnClick={false}
            onClick={(e) => setPage(r === first ? null : r, e)}
            data-testid="procedure-menu-runway"
          >
            {runwayName(r)}
            {/* Said, not seen: the row turns to that runway's page. */}
            <span className="sr-only">, its approaches</span>
            <span className="ml-auto pl-3 text-muted-foreground">{aside(r)}</span>
            <ChevronRight className="text-muted-foreground" />
          </DropdownMenuItem>
        ))}
      </>
    ) : page !== null ? (
      <>
        {toRunways}
        <DropdownMenuGroup>
          <DropdownMenuLabel className={PAGE_TITLE}>{runwayName(page)}</DropdownMenuLabel>
          <Choices procedures={byRunway.get(page) ?? []} m={m} />
        </DropdownMenuGroup>
      </>
    ) : null;
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        // As it opens, at its first page: reset as it closed, the page
        // flipped back under its fade.
        if (!open) return;
        setPaged(opening);
        setTurned(false);
        setMinWidth(undefined);
        m.onOpen();
      }}
    >
      <DropdownMenuTrigger render={procedureTrigger({ look, ident: m.ident, kind, label: m.label, face: m.face })} />
      <DropdownMenuContent
        align="start"
        className={cn("min-w-60 data-turned:[&_[data-highlighted]]:bg-transparent!", look === "slim" && "w-auto")}
        style={{ minWidth }}
        data-turned={turned || undefined}
        onPointerDown={() => setTurned(false)}
        // The arrows light their row again (Full Keyboard Access, an iPad's keyboard).
        onKeyDown={() => setTurned(false)}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse") setTurned(false);
        }}
        data-testid="procedure-menu"
      >
        {paged}
        {!paged && !list && query?.isError && (
          <DropdownMenuItem closeOnClick={false} onClick={() => void query.refetch()} data-testid="procedure-menu-retry">
            {PROCEDURES_FAILED} Try again
          </DropdownMenuItem>
        )}
        {!paged && !list && !query?.isError && <DropdownMenuItem disabled>Fetching the {TITLE[kind].toLowerCase()}s…</DropdownMenuItem>}
        {!paged && (
          <>
            {list && all.length === 0 && <DropdownMenuItem disabled>None published</DropdownMenuItem>}
            {kind === "approach" && toRunways}
            {kind === "approach" && first !== null && (
              <DropdownMenuGroup>
                <DropdownMenuLabel className={PAGE_TITLE}>{runwayName(first)}</DropdownMenuLabel>
                <Choices procedures={byRunway.get(first)!} m={m} />
              </DropdownMenuGroup>
            )}
            {kind !== "approach" && all.length > 0 && <Choices procedures={all} m={m} />}
            <DropdownMenuSeparator />
            {picked && pickedOne && pickedOne.transitions.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger data-testid="procedure-menu-transitions">
                  Transition
                  <span className="ml-auto pl-3 text-muted-foreground">{transitionWords(kind, picked.transition)}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={picked.transition ?? "-"}
                    onValueChange={(v: string) => m.onPick({ id: picked.id, transition: v === "-" ? null : v })}
                  >
                    {[null, ...pickedOne.transitions].map((t) => (
                      <DropdownMenuRadioItem key={t ?? "-"} value={t ?? "-"} data-testid="procedure-menu-transition">
                        {transitionWords(kind, t)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {picked && fixes.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger data-testid="procedure-menu-direct">
                  {WORDING.directTo}
                  <span className="ml-auto pl-3 text-muted-foreground">{picked.direct ?? "As Charted"}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={picked.direct ?? "-"}
                    onValueChange={(v: string) => m.onPick({ id: picked.id, transition: picked.transition, direct: v === "-" ? null : v })}
                  >
                    {[null, ...fixes].map((f) => (
                      <DropdownMenuRadioItem key={f ?? "-"} value={f ?? "-"} data-testid="procedure-menu-direct-fix">
                        {f ?? "As Charted"}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {/* The plate on the chart or not, at the owner's ask. */}
            {kind === "approach" && picked && (
              <DropdownMenuCheckboxItem
                checked={plates}
                onCheckedChange={(on) => usePreferences.getState().setPlates(on)}
                data-testid="procedure-menu-plate"
              >
                Plate on the Map
              </DropdownMenuCheckboxItem>
            )}
            {kind === "approach" && picked && m.onLearn && (
              <DropdownMenuItem onClick={m.onLearn} data-testid="procedure-menu-learn">
                Learn This Approach
              </DropdownMenuItem>
            )}
            {m.onDeactivate && (
              <DropdownMenuItem onClick={m.onDeactivate} data-testid="procedure-menu-deactivate">
                Deactivate
              </DropdownMenuItem>
            )}
            {picked && (
              <DropdownMenuItem onClick={() => m.onPick(null)} data-testid="procedure-menu-none">
                {NONE[kind]}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={m.onAll} data-testid="procedure-menu-all">
              {ALL[kind]}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A list of one kind's procedures, each a radio item picked at a tap
 *  (its transition after, from Transition ›), the one picked ticked; the
 *  check's room kept only where one of them is ticked, so the names line
 *  up with the rows round them. */
function Choices({ procedures, m }: { procedures: ProcedureSummary[]; m: MenuProps }) {
  const { picked } = m;
  const ticked = procedures.some((p) => p.id === picked?.id);
  return (
    <DropdownMenuRadioGroup value={ticked ? picked!.id : ""} onValueChange={(v: string) => m.onPick({ id: v, transition: null })}>
      {procedures.map((p) => (
        <DropdownMenuRadioItem key={p.id} value={p.id} className={cn(!ticked && "pl-4 native:pl-2")} data-testid="procedure-menu-item">
          {shortName(p)}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
