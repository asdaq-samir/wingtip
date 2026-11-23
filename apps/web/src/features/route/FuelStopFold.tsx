import { Coffee, Fuel, Plus, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "../../components/ui/context-menu";
import { SwipeRow } from "../../components/SwipeRow";
import { TEXT } from "../../lib/text";
import { FUEL_CHIP } from "./RouteChips";

/**
 * A flight's suggested stops folded into one dashed pill where they would
 * go, "+3 fuel stops", where each its own pill made the box mostly dashes
 * (the owner's iPhone, 2026-11-23). One suggestion is its ident as before
 * (FuelStopChip). A tap, or Enter, puts them all in the route there, as a
 * tap on one did; a swipe to the left (SwipeRow) or Delete dismisses the
 * flight's suggestions for this plan; held, right-clicked or the menu key,
 * the stock menu lists them, each with its own Add to Route and Dismiss,
 * and Add All and Dismiss All at its foot. The map's pins stay one each.
 */
export function FuelStopFold({
  idents,
  reason = "fuel",
  onAddAll,
  onAdd,
  onHide,
}: {
  idents: string[];
  reason?: "fuel" | "break";
  onAddAll?: () => void;
  onAdd?: (ident: string) => void;
  onHide?: (ident: string) => void;
}) {
  const Glyph = reason === "break" ? Coffee : Fuel;
  const kind = reason === "break" ? "stops" : "fuel stops";
  const words = `${idents.length} suggested ${kind}, ${idents.join(", ")}`;
  const hideAll = onHide ? () => idents.forEach((ident) => onHide(ident)) : undefined;
  // The single chip's look (FUEL_CHIP): 28 tall, round, dashed in the fuel's
  // amber, its 44 by a pseudo-element, so the line reads as one row of pills.
  const fold = (
    <Button
      variant="ghost"
      onClick={onAddAll}
      disabled={!onAddAll}
      onKeyDown={(e) => {
        if (hideAll && (e.key === "Delete" || e.key === "Backspace")) {
          e.preventDefault();
          e.stopPropagation();
          hideAll();
        }
      }}
      data-testid="route-fuel-fold"
      data-count={idents.length}
      aria-label={`${words}: add them to the route`}
      aria-keyshortcuts={hideAll ? "Delete ContextMenu" : undefined}
      className={cn(FUEL_CHIP, TEXT.detail)}
    >
      <Glyph aria-hidden="true" className="size-3.5" />+{idents.length} {kind}
    </Button>
  );
  if (!hideAll) return fold;
  return (
    <SwipeRow chip word="Dismiss" label={`Dismiss ${words}`} onRemove={hideAll}>
      <ContextMenu>
        <ContextMenuTrigger render={fold} />
        <ContextMenuContent data-testid="route-fuel-fold-menu">
          <ContextMenuGroup>
            <ContextMenuLabel>Suggested {kind}</ContextMenuLabel>
            {/* Each stop its own row, its choices one level in, as iOS's
                menus nest: the list stays one row a stop however many. */}
            {idents.map((ident) => (
              <ContextMenuSub key={ident}>
                <ContextMenuSubTrigger data-testid="route-fuel-fold-stop">
                  <Glyph aria-hidden="true" />
                  {ident}
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  {onAdd && (
                    <ContextMenuItem onClick={() => onAdd(ident)} data-testid="route-fuel-fold-add-one">
                      <Plus aria-hidden="true" />
                      Add to Route
                    </ContextMenuItem>
                  )}
                  <ContextMenuItem variant="destructive" onClick={() => onHide!(ident)} data-testid="route-fuel-fold-dismiss-one">
                    <X aria-hidden="true" />
                    Dismiss
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
            ))}
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            {onAddAll && (
              <ContextMenuItem onClick={onAddAll} data-testid="route-fuel-fold-add-all">
                <Plus aria-hidden="true" />
                Add All
              </ContextMenuItem>
            )}
            <ContextMenuItem variant="destructive" onClick={hideAll} data-testid="route-fuel-fold-dismiss-all">
              <X aria-hidden="true" />
              Dismiss All
            </ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
    </SwipeRow>
  );
}
