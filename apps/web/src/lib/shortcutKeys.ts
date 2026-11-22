/**
 * How a desktop's shortcuts are pressed (use-shortcuts, useCardKeys): `/`
 * for the search, B the Brief, N Nearest, D Direct To, and a card's F, D
 * and S -- always with Alt held (Option on a Mac), never a letter alone
 * (the owner, 2026-11-11: "I like the stock behavior"). A bare letter is
 * VoiceOver's quick nav and the browser's find-as-you-type, and a speech
 * user saying a word types its letters, which one stray letter would turn
 * into the Brief opening (WCAG 2.2's 2.1.4 Character Key Shortcuts asks
 * for a modifier, or a way off, for a one-key shortcut). With the modifier
 * always held there is nothing to turn off, so there is no setting.
 * Escape is not a character key and goes back one level; ⌘K / Ctrl K has
 * its own modifier. They are heard by the physical key (`code`), as
 * Option and a letter on a Mac types another character (Option-B is ∫,
 * Option-F ƒ), and with no other modifier held: use-shortcuts' HEARD.
 */

/** A shortcut's key as shown beside its action (CardAction, the search's
 *  rows) and said in its aria-keyshortcuts: "Alt+F", the key names
 *  aria-keyshortcuts knows. */
export function keyHint(letter: string | undefined): string | undefined {
  return letter ? `Alt+${letter}` : undefined;
}
