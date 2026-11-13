import { createContext } from "react";

/** The console's own close (ConsoleLayer), back to where it was opened
 *  from: a page opened straight from outside (the search, a link) closes
 *  by it in one tap, as the card rule has a ✕ go back to where the pilot
 *  came from (docs/design/rules.md; ConsolePages). */
export const ConsoleLeave = createContext<(() => void) | null>(null);
