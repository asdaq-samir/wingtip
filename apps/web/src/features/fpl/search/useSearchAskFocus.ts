import { useEffect, type RefObject } from "react";
import { flushSync } from "react-dom";
import { focusAsShown } from "../../../lib/focusAsShown";
import { takeSearchAsk, useSearchAsk, useSearchPick } from "../../../lib/oneSearch";

/**
 * ⌘K, `/`, the Map menu's row and D ask for the one search's field
 * (lib/oneSearch): focused within the ask, so the keyboard comes up
 * (useOneSearch's field).
 */
export function useSearchAskFocus(a: {
  input: RefObject<HTMLInputElement | null>;
  /** The view picked: the search's, for a picker's ask. Stable, as each setter here is. */
  pickView: (view: "search") => void;
  setQuery: (text: string) => void;
  setDirect: (direct: boolean) => void;
  setProblem: (problem: string | null) => void;
}) {
  const { input, pickView, setQuery, setDirect, setProblem } = a;
  useEffect(() => {
    let stop = () => {};
    const unsubscribe = useSearchAsk.subscribe(({ ask }) => {
      if (!ask) return;
      takeSearchAsk();
      setDirect(ask.mode === "direct");
      setProblem(null);
      // A picker's ask on the Search page, where its field and rows are:
      // asked from FPL (the route box's Departure), it focused a field on
      // the page not up, and nothing seemed to happen (2026-11-13). Any
      // ask while that page is put away likewise. The page drawn up before
      // the focus: put away it is inert (SheetPage), and an inert field
      // takes no focus, so the route box's stop asked for none came.
      if (ask.mode === "pick" || input.current?.closest("[inert]")) flushSync(() => pickView("search"));
      // A point changed: its name in the field to start, selected (SearchPick's query).
      const start = ask.mode === "pick" ? useSearchPick.getState().pick?.query : undefined;
      if (start !== undefined) flushSync(() => setQuery(start));
      input.current?.focus();
      if (start !== undefined) input.current?.select();
      // Asked as a card goes (the Profile's Add a Stop): the sheet under it
      // is still hidden, and the field takes the focus as it shows.
      stop();
      stop = focusAsShown(
        () => input.current,
        () => input.current?.focus(),
      );
    });
    return () => {
      unsubscribe();
      stop();
    };
  }, [input, pickView, setQuery, setDirect, setProblem]);
}
