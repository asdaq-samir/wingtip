import { type CSSProperties, useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import { cn } from "cn";
import CloseButton from "../../components/CloseButton";
import { TEXT } from "../../lib/text";

/** A menu's or a select's trigger whose popup is open (Base UI sets both). */
const OPEN_POPUP_TRIGGER = '[aria-expanded="true"]:is([aria-haspopup="menu"], [aria-haspopup="listbox"], [aria-haspopup="true"])';

/**
 * Setup's page in the map's panel, a tab's body as the others' are: named
 * for the console it is (a region, no longer a dialog: the focus stays on
 * the tab picked, as it does for the others), hidden while another tab is
 * up, and Escape going back to the tab before it -- heard here, inside
 * the panel, before the panel hears it and lowers itself, and wherever
 * the focus has gone while it is up; not when a menu open in it took the
 * key first.
 */
export default function ConsoleLayer({
  label,
  detent,
  edge,
  onClose,
  shown,
  children,
}: {
  label: string;
  detent: "medium" | "large";
  edge: "top" | "bottom";
  onClose: () => void;
  /** Setup the tab up: put away it is kept, hidden. */
  shown: boolean;
  children: ReactNode;
}) {
  const layer = useRef<HTMLElement>(null);
  // The caller's close at the key, not the one it opened with.
  const close = useEffectEvent(onClose);
  useEffect(() => {
    const node = layer.current;
    if (!node || !shown) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      // A card over it (SheetCard) is put away first, by its own Escape,
      // which prevents the default.
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // A menu or a list just opened from a control in the layer, the focus
      // still on its trigger: the popup takes the focus a moment after it
      // opens, and until then the trigger's own Escape, which closes it and
      // prevents the default, is heard by React only after this listener on
      // the layer has. The key is the menu's, as it is once the focus is in
      // it; the console stays (consoles.spec's role menu, run 42867578624).
      if (event.target instanceof Element && event.target.closest(OPEN_POPUP_TRIGGER)) return;
      event.preventDefault();
      close();
    };
    // On the layer first, ahead of the panel's own Escape; on the document
    // too, for when a tap on the map or on the panel's bare parts has
    // taken the focus out (the layer is no modal), where the key would
    // otherwise be lost or lower the panel. A menu's own Escape has
    // already prevented the default by the time either hears it.
    node.addEventListener("keydown", onKey);
    document.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      document.removeEventListener("keydown", onKey);
    };
  }, [shown]);
  return (
    <section
      ref={layer}
      aria-label={label}
      // Named for the suite only while it is up: put away it is there,
      // hidden, for the next tap on Setup.
      data-testid={shown ? "console-sheet" : undefined}
      data-detent={detent}
      data-edge={edge}
      className={cn("min-h-0 flex-1 flex-col print:hidden", shown ? "flex" : "hidden")}
      // Its pages start under its own title row, not up under the panel's
      // head as a tab's page does (index.css's under-head, by the panel's
      // --head-room): pulled up, the page's scroller lay over this row and
      // took the taps meant for its close (one-search.spec, consoles.spec).
      style={{ "--head-room": "0px" } as CSSProperties}
    >
      {/* Its name and its close, the way back to the sheet under it, at the
          sheet's top: the page covers the title row and the search, as every
          page does by the one card rule (the owner, 2026-11-10). */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-1">
        <h2 className={cn("flex-1 font-bold", TEXT.title)}>Account and Settings</h2>
        <CloseButton label="Back to the map" onClick={onClose} data-back="" data-testid="console-close" />
      </div>
      {children}
    </section>
  );
}
