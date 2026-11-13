import { useEffect, useEffectEvent } from "react";
import { typing } from "../../../hooks/use-shortcuts";
import { shortcutKey } from "../../../lib/shortcutKeys";

/**
 * A card's actions by a letter each on a desktop (the owner, 2026-11-09:
 * the airport card's Alt+F Fly Here and Alt+S Add Stop, shown on their
 * buttons), while `on` and the focus is in no field, menu or
 * dialog. Heard before the page's own letters (useShortcuts' Alt+D,
 * Direct To), in the capture phase, so the card's letter is the one that
 * runs. Pressed only with Alt (lib/shortcutKeys), never a letter alone.
 */
export function useCardKeys(on: boolean, keys: Partial<Record<string, () => void>>) {
  const run = useEffectEvent((letter: string) => {
    const action = keys[letter];
    if (!action) return false;
    action();
    return true;
  });
  useEffect(() => {
    if (!on) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || typing(event.target)) return;
      const letter = shortcutKey(event);
      if (letter && run(letter)) event.preventDefault();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [on]);
}
