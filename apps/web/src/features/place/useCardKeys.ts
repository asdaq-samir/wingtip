import { useHotkeys } from "react-hotkeys-hook";
import { altKey, HEARD } from "../../hooks/use-shortcuts";

/**
 * A card's actions by a letter each on a desktop (the owner, 2026-11-09:
 * the airport card's Alt+F Fly Here and Alt+S Add Stop, shown on their
 * buttons), while `on` and the focus is in no field, menu or
 * dialog. Heard before the page's own letters (useShortcuts' Alt+D,
 * Direct To), in the capture phase, so the card's letter is the one that
 * runs. Pressed only with Alt (lib/shortcutKeys), never a letter alone,
 * and heard as the page's are (use-shortcuts' HEARD).
 */
export function useCardKeys(on: boolean, keys: Partial<Record<string, () => void>>) {
  const letters = Object.keys(keys).filter((letter) => keys[letter]);
  useHotkeys(
    letters.map(altKey),
    (event, hotkey) => {
      const action = keys[hotkey.keys?.[0]?.toUpperCase() ?? ""];
      if (!action) return;
      event.preventDefault();
      action();
    },
    { ...HEARD, enabled: on && letters.length > 0, eventListenerOptions: { capture: true } },
  );
}
