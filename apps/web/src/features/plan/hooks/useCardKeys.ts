import { useEffect, useEffectEvent } from "react";
import { typing } from "../../../hooks/use-shortcuts";

/**
 * A card's actions by a letter each on a desktop (the owner, 2026-11-09:
 * the airport card's F Fly Here, D Depart From, S Add as Stop, shown on
 * their buttons), while `on` and the focus is in no field, menu or
 * dialog. Heard before the page's own letters (useShortcuts' D, Direct
 * To), in the capture phase, so the card's letter is the one that runs.
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
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
      if (run(event.key.toUpperCase())) event.preventDefault();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [on]);
}
