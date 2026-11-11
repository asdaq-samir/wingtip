import { cn } from "cn";
import { TEXT } from "../lib/text";

/** A link at a page's foot, a word in the tint with a 44-point hit area
 *  round it (CLAUDE.md): PageLink's, and Settings' links out (Privacy,
 *  Terms). */
export const PAGE_LINK = cn(
  "relative rounded-sm text-tint outline-none after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring",
  TEXT.detail,
);
