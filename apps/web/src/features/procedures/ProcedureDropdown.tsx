import { useState } from "react";
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
import { WORDING } from "../../lib/wording/generated/wording";
import type ProcedureMenu from "./ProcedureMenu";
import { PROCEDURES_FAILED } from "./ProcedureMenu";
import { ALL, approachGroups, NONE, shortName } from "./procedureWords";
import { procedureTrigger, TITLE } from "./ProcedureTrigger";

type MenuProps = Parameters<typeof ProcedureMenu>[0];

/**
 * A kind's procedures on FPL's Landing and Takeoff, picked from the stock
 * dropdown menu as the runway's pill picks its runway (RunwayPill), at the
 * owner's ask (2026-11-25: "Can I select the procedures using similar menu
 * as runway?"), where it was the sheet of pages the list read in flight
 * still opens (ProcedureMenu): each one a radio item picked at one tap,
 * from vectors or its common route, its transition then picked from the
 * picked one's menu (Transition ›); an approach's the runway landed on's
 * alone, every other runway's behind one "Other Runways ›" at its top (the owner,
 * 2026-11-25: "make this all about the selected runway and then also let
 * the user go back to see other procedures"); then Direct To, the plate,
 * the lesson, none of the kind, and the field's whole list. A picked
 * one's menu is its pill's chip; the pill folds its fixes (FoldSection).
 */
export function ProcedureDropdown(m: MenuProps) {
  const { kind, list, query, picked, fixes = [], look = "slim" } = m;
  const all = (list?.procedures ?? []).filter((p) => p.kind === kind);
  const plates = usePreferences((s) => s.plates);
  const { byRunway, first, others } = approachGroups(all, kind, m.runway, m.windward);
  const runwayName = (r: string) => (r === "Circling" ? "Circling" : `Runway ${r}${r === m.windward ? " · into the wind" : ""}`);
  const pickedOn = others.map((r) => byRunway.get(r)?.find((p) => p.id === picked?.id)).find(Boolean);
  const pickedOne = all.find((p) => p.id === picked?.id);
  // Other runways a page of the menu in its place, each runway a page of
  // its approaches, Back at the top to the one before (the owner,
  // 2026-11-25: "Other runways should go back in menu to pick a runway"),
  // where they were a submenu beside it, every runway's approaches at once.
  const [page, setPage] = useState<"runways" | string | null>(null);
  const kinds = (r: string) => [...new Set((byRunway.get(r) ?? []).map((p) => shortName(p).split(" ")[0]))].join(", ");
  const back = (to: "runways" | null) => (
    <DropdownMenuItem closeOnClick={false} onClick={() => setPage(to)} className="text-tint" data-testid="procedure-menu-back">
      <ChevronLeft className="-ml-1" />
      {to === null ? runwayName(first ?? "") : "Other Runways"}
    </DropdownMenuItem>
  );
  const paged =
    page === "runways" ? (
      <>
        {back(null)}
        {others.map((r) => (
          <DropdownMenuItem key={r} closeOnClick={false} onClick={() => setPage(r)} data-testid="procedure-menu-runway">
            {runwayName(r)}
            <span className="ml-auto pl-3 text-muted-foreground">{kinds(r)}</span>
            <ChevronRight className="text-muted-foreground" />
          </DropdownMenuItem>
        ))}
      </>
    ) : page !== null ? (
      <>
        {back("runways")}
        <DropdownMenuGroup>
          <DropdownMenuLabel>{runwayName(page)}</DropdownMenuLabel>
          <Choices procedures={byRunway.get(page) ?? []} m={m} />
        </DropdownMenuGroup>
      </>
    ) : null;
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        setPage(null);
        if (open) m.onOpen();
      }}
    >
      <DropdownMenuTrigger render={procedureTrigger({ look, ident: m.ident, kind, label: m.label, face: m.face })} />
      <DropdownMenuContent align="start" className={cn("min-w-60", look === "slim" && "w-auto")} data-testid="procedure-menu">
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
            {/* At the top, in the tint, where a runway's own page has its
                Back to the runways (the owner, 2026-11-25: "show other
                runways on top for selected runway just like the other"). */}
            {kind === "approach" && others.length > 0 && (
              <DropdownMenuItem
                closeOnClick={false}
                onClick={() => setPage("runways")}
                className="text-tint"
                data-testid="procedure-menu-others"
              >
                {first === null ? "Runways" : "Other Runways"}
                <span className="ml-auto pl-3 text-muted-foreground">{pickedOn ? shortName(pickedOn) : ""}</span>
                <ChevronRight />
              </DropdownMenuItem>
            )}
            {kind === "approach" && first !== null && (
              <DropdownMenuGroup>
                <DropdownMenuLabel>{runwayName(first)}</DropdownMenuLabel>
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
