import type { ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

/** A control's label as the stock Tooltip, from the popups' chunk
 *  (popupsChunk): `children` the control itself. Base UI's own delay and
 *  focus: shown after a hover's pause, and on a keyboard's focus. */
export function Tip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
