import type { ReactElement } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { EngineGate } from "../../lib/engine/engineGate";

/** A menu of steps, any first, as a stock Menu whose trigger is `trigger`.
 *  Steps the engine gives (`vfrAtSteps`) are a function, asked only as the
 *  menu opens and once the engine is there, so the chip itself draws at
 *  once. */
export default function StepMenu({
  value,
  steps,
  words,
  onPick,
  trigger,
  testId,
}: {
  value: number | null;
  steps: readonly number[] | (() => readonly number[]);
  words: (v: number | null) => string;
  onPick: (v: number | null) => void;
  trigger: ReactElement;
  testId?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} data-testid={testId} />
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value == null ? "any" : String(value)} onValueChange={(v) => onPick(v === "any" ? null : Number(v))}>
          <DropdownMenuRadioItem value="any">{words(null)}</DropdownMenuRadioItem>
          {typeof steps === "function" ? (
            <EngineGate>
              <Steps steps={steps} words={words} testId={testId} />
            </EngineGate>
          ) : (
            <Steps steps={() => steps} words={words} testId={testId} />
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The menu's rows, one a step. */
function Steps({ steps, words, testId }: { steps: () => readonly number[]; words: (v: number) => string; testId?: string }) {
  return steps().map((s) => (
    <DropdownMenuRadioItem key={s} value={String(s)} data-testid={testId && `${testId}-${s}`}>
      {words(s)}
    </DropdownMenuRadioItem>
  ));
}
