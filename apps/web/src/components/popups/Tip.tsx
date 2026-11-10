import type { ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

/** A control's label as the stock Tooltip, from the popups' chunk
 *  (popupsChunk): `children` the control itself. */
export function Tip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger delay={0} render={children} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
