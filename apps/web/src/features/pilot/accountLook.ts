import { cn } from "cn";
import { TEXT } from "../../lib/text";

/** The account button's look: a 36-point disc, its 44-point hit area the
 *  pseudo-element's (CLAUDE.md: controls never grow to it) -- signed out
 *  the app's grey with the glyph in the tint, signed in the initials on
 *  the tint (owner decision 2026-11-10 (decisions page), the sheet audit's
 *  F-H1: it was a 44-point solid blue disc either way). The initials' disc
 *  is the look's primary with its own foreground, the stock Button's pair,
 *  which reads 4.5:1 in every look: white on the dark look's light tint
 *  (#57a8ff) read 2.49:1 (the iOS audit's P15, dark). */
const ACCOUNT_BASE = cn(
  "relative grid size-9 shrink-0 place-items-center rounded-full font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  "after:absolute after:-inset-1 after:content-['']",
  TEXT.detail,
);
/** The disc's colours, the button's and You's large avatar's. */
export const accountFill = (signedIn: boolean) => (signedIn ? "bg-primary text-primary-foreground" : "bg-foreground/8 text-tint");
export const accountButton = (signedIn: boolean) => cn(ACCOUNT_BASE, accountFill(signedIn));
