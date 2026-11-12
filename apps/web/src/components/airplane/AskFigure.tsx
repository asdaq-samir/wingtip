import { useId } from "react";
import { cn } from "cn";
import { Button } from "../ui/button";
import { NumberField } from "../ui/number-field";
import { LINK } from "./link";
import { FIGURE_WORDS, tablesWords } from "../../lib/airplane/figureWords";
import type { NeedsFigure } from "../../lib/airplane/figures";
import { useAskFigure } from "../../lib/airplane/useAskFigure";
import { requestAirplanePick } from "../../lib/pickAirplane";
import { TEXT } from "../../lib/text";
import { FieldError } from "../ui/field";

/**
 * Where an airplane figure is needed and the airplane has none, the one ask
 * (the owner, 2026-11-09: "just ask for it at the time it's needed"): "How
 * much fuel does N123AB use to start and taxi? [ gal ] Save · Not now ·
 * Edit N123AB", saved to the airplane's record (or this device, signed
 * out) and the figure then worked out again. A table no field can take (a
 * loading envelope, a takeoff chart) is named with Edit alone. With no
 * airplane picked, "Pick an airplane" (lib/pickAirplane), as before; with
 * every ask put off this session, nothing, and the rest shows as it is.
 * Its view model is lib/airplane/useAskFigure.
 */
export function AskFigure({
  figure,
  what,
  tables,
  testId,
}: {
  figure: NeedsFigure;
  /** What needs it, as the sentence's subject: "The loading". */
  what: string;
  /** The nav log's airplane, whose charts the profile's tables are. */
  tables?: Record<string, unknown> | null;
  testId?: string;
}) {
  const vm = useAskFigure(figure, tables);
  const id = useId();
  if (vm.none) {
    return (
      <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-2 text-muted-foreground", TEXT.prose)} data-testid={testId}>
        <span>{what} needs an airplane.</span>
        <Button variant="link" size="sm" className={LINK} onClick={requestAirplanePick} data-testid="pick-airplane">
          Pick an airplane
        </Button>
      </div>
    );
  }
  const edit = vm.tail && (
    <Button variant="link" size="sm" className={LINK} onClick={() => vm.edit()} data-testid="ask-edit">
      Edit {vm.tail}
    </Button>
  );
  if (vm.asked && vm.tail) {
    const words = FIGURE_WORDS[vm.asked];
    return (
      <form
        className={cn("flex flex-col gap-2", TEXT.prose)}
        data-testid={testId}
        data-ask={vm.asked}
        onSubmit={(e) => {
          e.preventDefault();
          void vm.submit();
        }}
      >
        <label htmlFor={id}>{words.ask(vm.tail)}</label>
        <span className="flex items-center gap-2">
          {/* Read in the pilot's locale, "12,5" twelve and a half where a
              comma is the decimal; given as it is typed, for Save. Keyed
              by the figure asked, so the next is asked in an empty field. */}
          <NumberField
            key={vm.asked}
            id={id}
            defaultValue={null}
            onTyped={vm.setTyped}
            minValue={0}
            className="h-8 w-24"
            inputClassName={cn("text-right", TEXT.row)}
            isInvalid={!!vm.problem}
            data-testid="ask-input"
          />
          <span className="text-muted-foreground">{words.unit}</span>
        </span>
        {vm.problem && <FieldError className={cn("text-destructive-ink", TEXT.detail)}>{vm.problem}</FieldError>}
        <span className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Button type="submit" size="sm" disabled={vm.saving || vm.typed == null} data-testid="ask-save">
            {vm.saving ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="link" size="sm" className={LINK} onClick={vm.notNow} data-testid="ask-not-now">
            Not now
          </Button>
          {edit}
        </span>
      </form>
    );
  }
  if (vm.tables.length || (vm.asked && !vm.tail)) {
    const lacks = vm.tables.length ? tablesWords(vm.tables) : FIGURE_WORDS[vm.asked!].label.toLowerCase();
    return (
      <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-2 text-muted-foreground", TEXT.prose)} data-testid={testId}>
        <span>
          {what} needs {vm.tail ?? "the airplane"}&apos;s {lacks}.
        </span>
        {edit}
      </div>
    );
  }
  return null;
}
