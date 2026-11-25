import { CheckIcon } from "lucide-react";
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
import { MENU_CHECK } from "../../components/ui/menuLook";
import type { ProcedureSummary } from "../../lib/api/types";
import { usePreferences } from "../../lib/preferences";
import { transitionWords } from "../../lib/procedures";
import { faaWords } from "../../lib/advisories";
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
 * still opens (ProcedureMenu): each one a radio item, one with transitions
 * a submenu of them; an approach's by runway, the runway landed on first
 * and the others each a submenu; then Direct To, the plate, the lesson,
 * none of the kind, and the field's whole list. A picked one's menu is its
 * pill's chip; the pill folds its fixes (FoldSection).
 */
export function ProcedureDropdown(m: MenuProps) {
  const { kind, list, query, picked, fixes = [], look = "slim" } = m;
  const all = (list?.procedures ?? []).filter((p) => p.kind === kind);
  const plates = usePreferences((s) => s.plates);
  const { byRunway, first, others } = approachGroups(all, kind, m.runway, m.windward);
  const runwayName = (r: string) => (r === "Circling" ? "Circling" : `Runway ${r}${r === m.windward ? " · into the wind" : ""}`);
  const pickedOn = (r: string) => {
    const there = byRunway.get(r)?.find((p) => p.id === picked?.id);
    return there ? shortName(there) : undefined;
  };
  return (
    <DropdownMenu onOpenChange={(open) => open && m.onOpen()}>
      <DropdownMenuTrigger render={procedureTrigger({ look, ident: m.ident, kind, label: m.label, face: m.face })} />
      <DropdownMenuContent align="start" className={cn("min-w-60", look === "slim" && "w-auto")} data-testid="procedure-menu">
        {!list && query?.isError && (
          <DropdownMenuItem closeOnClick={false} onClick={() => void query.refetch()} data-testid="procedure-menu-retry">
            {PROCEDURES_FAILED} Try again
          </DropdownMenuItem>
        )}
        {!list && !query?.isError && <DropdownMenuItem disabled>Fetching the {TITLE[kind].toLowerCase()}s…</DropdownMenuItem>}
        {list && all.length === 0 && <DropdownMenuItem disabled>None published</DropdownMenuItem>}
        {kind === "approach" && first !== null && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>{runwayName(first)}</DropdownMenuLabel>
            <Choices procedures={byRunway.get(first)!} m={m} />
          </DropdownMenuGroup>
        )}
        {kind === "approach" &&
          others.map((r) => (
            <DropdownMenuSub key={r}>
              <DropdownMenuSubTrigger>
                {runwayName(r)}
                <span className="ml-auto pl-3 text-muted-foreground">{pickedOn(r)}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <Choices procedures={byRunway.get(r)!} m={m} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
        {kind !== "approach" && all.length > 0 && <Choices procedures={all} m={m} />}
        <DropdownMenuSeparator />
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A list of one kind's procedures: each a radio item, picked at a tap;
 *  one with transitions a submenu of them ("No transition" first), the
 *  one picked ticked as the radio items are. */
function Choices({ procedures, m }: { procedures: ProcedureSummary[]; m: MenuProps }) {
  const { picked, kind } = m;
  const plain = procedures.filter((p) => p.transitions.length === 0);
  return (
    <>
      {procedures
        .filter((p) => p.transitions.length > 0)
        .map((p) => (
          <DropdownMenuSub key={p.id}>
            <DropdownMenuSubTrigger className="pl-10 native:pl-8" data-testid="procedure-menu-item">
              {picked?.id === p.id && (
                <span className={MENU_CHECK}>
                  <CheckIcon />
                </span>
              )}
              {shortName(p)}
              {picked?.id === p.id && picked.transition && <span className="ml-auto pl-3 text-muted-foreground">{picked.transition}</span>}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={picked?.id === p.id ? (picked.transition ?? "-") : ""}
                onValueChange={(v: string) => m.onPick({ id: p.id, transition: v === "-" ? null : v })}
              >
                <DropdownMenuLabel>{faaWords(p.name)}</DropdownMenuLabel>
                {[null, ...p.transitions].map((t) => (
                  <DropdownMenuRadioItem key={t ?? "-"} value={t ?? "-"} data-testid="procedure-menu-transition">
                    {transitionWords(kind, t)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      {plain.length > 0 && (
        <DropdownMenuRadioGroup value={picked?.id ?? ""} onValueChange={(v: string) => m.onPick({ id: v, transition: null })}>
          {plain.map((p) => (
            <DropdownMenuRadioItem key={p.id} value={p.id} data-testid="procedure-menu-item">
              {shortName(p)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      )}
    </>
  );
}
