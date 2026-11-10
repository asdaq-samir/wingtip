import { cn } from "cn";
import { TEXT } from "../../lib/text";

/** The account button's look: 44 points round, in the tint. */
export const ACCOUNT_BUTTON = cn(
  "grid size-11 shrink-0 place-items-center rounded-full bg-tint font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  TEXT.row,
);
