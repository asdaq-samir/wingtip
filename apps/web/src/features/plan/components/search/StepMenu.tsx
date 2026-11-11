import type { ReactElement } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../../../components/ui/dropdown-menu";

/** A menu of steps, any first, as a stock Menu whose trigger is `trigger`. */
export default function StepMenu({
  value,
  steps,
  words,
  onPick,
  trigger,
  testId,
}: {
  value: number | null;
  steps: readonly number[];
  words: (v: number | null) => string;
  onPick: (v: number | null) => void;
  trigger: ReactElement;
  testId: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} data-testid={testId} />
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value == null ? "any" : String(value)} onValueChange={(v) => onPick(v === "any" ? null : Number(v))}>
          <DropdownMenuRadioItem value="any">{words(null)}</DropdownMenuRadioItem>
          {steps.map((s) => (
            <DropdownMenuRadioItem key={s} value={String(s)} data-testid={`${testId}-${s}`}>
              {words(s)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
