import { lazy, Suspense, useEffect } from "react";
import { isPaletteKey } from "../../../hooks/use-shortcuts";
import { closePalette, openPalette, usePalette } from "../../../lib/palette";

/** The palette in its own chunk, fetched the first time it is opened: it
 *  carries nothing the first load needs (the 1.10 MB budget). */
const CommandPalette = lazy(() => import("./CommandPalette"));

/**
 * Where the command palette lives on the map's page: ⌘K or Ctrl K opens
 * and closes it on any screen with a keyboard -- an iPad's too, where the
 * panel's other shortcuts (useShortcuts) are a desktop's -- and from a
 * field, as the key is never typed text. The Map menu's row and D open it
 * as well (lib/palette).
 */
export default function PaletteHost() {
  const open = usePalette((s) => s.open);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isPaletteKey(event)) return;
      event.preventDefault();
      if (usePalette.getState().open) closePalette();
      else openPalette();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <CommandPalette mode={open} />
    </Suspense>
  );
}
