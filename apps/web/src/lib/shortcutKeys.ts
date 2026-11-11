import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * How a desktop's single-character shortcuts are pressed (use-shortcuts,
 * useCardKeys): `/` for the search, B the Brief, N Nearest, D Direct To,
 * and a card's F, D and S. WCAG 2.2's 2.1.4 Character Key Shortcuts
 * (Level A) asks that a shortcut of one printable key can be turned off,
 * or remapped to take a non-printable one too, since a speech-input user
 * saying a word types its letters, and one stray letter would open the
 * Brief (docs/design/web.md, "Keyboard"). So the pilot picks: the letter
 * alone (the default, as a desktop's web apps have them), the letter with
 * Alt (Option on a Mac), or none. Escape is not a character key and goes
 * back one level whatever is picked; ⌘K / Ctrl K always has its modifier.
 *
 * Kept per browser, as a keyboard is this device's; a store of its own,
 * not lib/preferences, which is at its size budget.
 */
export type ShortcutMode = "letters" | "alt" | "off";

export const SHORTCUT_MODES: { value: ShortcutMode; label: string }[] = [
  { value: "letters", label: "Letters" },
  { value: "alt", label: "With Alt" },
  { value: "off", label: "Off" },
];

export const useShortcutKeys = create<{ mode: ShortcutMode; setMode: (mode: ShortcutMode) => void }>()(
  persist((set) => ({ mode: "letters", setMode: (mode) => set({ mode }) }), {
    name: "wingtip.shortcutKeys",
    partialize: (s) => ({ mode: s.mode }),
  }),
);

/** The key a shortcut was pressed with under `mode`, upper case (`/` as
 *  itself), or null where the press is no shortcut: Command or Control
 *  held (the browser's and the system's own), the wrong modifier for the
 *  mode, or shortcuts off. With Alt, the key is read from the physical
 *  key (`code`), as Option and a letter on a Mac types another character
 *  (Option-B is ∫). */
export function shortcutKey(event: KeyboardEvent, mode: ShortcutMode): string | null {
  if (mode === "off" || event.metaKey || event.ctrlKey) return null;
  if (mode === "letters") return event.altKey ? null : event.key.length === 1 ? event.key.toUpperCase() : null;
  if (!event.altKey || event.shiftKey) return null;
  if (event.code === "Slash") return "/";
  const letter = /^Key([A-Z])$/.exec(event.code);
  return letter ? letter[1]! : null;
}

/** Whether this is a Mac, for the Alt key's own name there. */
const onMac = (): boolean => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** A shortcut's key as shown beside its action (CardAction, the search's
 *  rows), and its aria-keyshortcuts: the letter, ⌥ and the letter on a
 *  Mac, Alt+ and the letter elsewhere, or nothing where shortcuts are off. */
export function keyHint(letter: string | undefined, mode: ShortcutMode): string | undefined {
  if (!letter || mode === "off") return undefined;
  if (mode === "letters") return letter;
  return onMac() ? `⌥${letter}` : `Alt+${letter}`;
}

/** keyHint under the pilot's pick, for a component. */
export const useKeyHint = (): ((letter: string | undefined) => string | undefined) => {
  const mode = useShortcutKeys((s) => s.mode);
  return (letter) => keyHint(letter, mode);
};
