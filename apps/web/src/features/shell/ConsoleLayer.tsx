import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import { cn } from "cn";
import CloseButton from "../../components/CloseButton";
import { TEXT } from "../../lib/text";

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
    >
      {/* Its name and its close, the way back to the sheet under it, as
          the account button's menu opened it (the one search, 2026-11-09):
          it was another tab tapped. */}
      <div className="flex items-center gap-2 px-4 pt-2 pb-1">
        <h2 className={cn("flex-1 font-bold", TEXT.title)}>Account and Settings</h2>
        <CloseButton label="Back to the map" onClick={onClose} data-back="" data-testid="console-close" />
      </div>
      {children}
    </section>
  );
}
