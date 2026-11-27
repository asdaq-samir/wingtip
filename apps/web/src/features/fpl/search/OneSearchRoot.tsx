import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { CommandRoot } from "../../../components/ui/command";
import type { PlanSlices } from "../vm/planSlices";
import { OneSearchContext } from "./oneSearchModel";
import { useKept } from "../vm/useKept";
import { clearSearchQuery, useSearchQuery } from "./searchQuery";
import { useOneSearch } from "./useOneSearch";
import { OneSearchFrameContext, type OneSearchFrame } from "./oneSearchFrame";

/**
 * The one search round the whole panel (the workspace's `around`): its
 * Autocomplete root, so its field (the first row) and its list (the body)
 * are one combobox, and its view model (useOneSearch) given to both
 * (useOneSearchModel). What is typed is read here (searchQuery), not in
 * the workspace, so a keystroke draws the search and its parts alone: the
 * panel handed in is the same element, which React leaves as it was.
 */
export default function OneSearchRoot({
  vm,
  children,
}: {
  vm: PlanSlices<"cards" | "map" | "plan" | "route" | "search" | "view">;
  children: ReactNode;
}) {
  const query = useSearchQuery((s) => s.query);
  const model = useOneSearch(vm);
  // Its words go with the workspace, as its own state's did.
  useEffect(() => clearSearchQuery, []);
  // The model's calls through the latest model, each the same function at
  // every render, as an event handler reads the render it runs in.
  const latest = useRef(model);
  useLayoutEffect(() => {
    latest.current = model;
  });
  const calls = useMemo(
    () => ({
      cancel: () => latest.current.cancel(),
      letGo: () => latest.current.letGo(),
      pickIdent: (ident: string) => latest.current.pickIdent(ident),
      refusal: (ident: string) => latest.current.refusal(ident),
    }),
    [],
  );
  const frame = useKept<OneSearchFrame>({
    pick: model.pick,
    listed: !!model.typed || model.direct || (!!model.pick && model.does.length > 0),
    sent: model.sent,
    ...calls,
  });
  return (
    <OneSearchFrameContext.Provider value={frame}>
      <OneSearchContext.Provider value={model}>
        <CommandRoot value={query} onValueChange={model.setTyped} onItemHighlighted={model.highlighted} autoHighlight="always">
          {children}
        </CommandRoot>
      </OneSearchContext.Provider>
    </OneSearchFrameContext.Provider>
  );
}
