import { useController, type Control } from "react-hook-form";
import { cn } from "cn";
import PullDown from "../../../components/PullDown";
import type { LogbookEntryRequest } from "../../../lib/api/types";
import { AIRPLANE, KIND_CHOICES, NOT_SAID } from "../../../lib/airplaneKind";
import { TEXT } from "../../../lib/text";

const ROW = cn("grid grid-cols-[8rem_1fr] items-center gap-2", TEXT.detail);

/** Each box holds "" where nothing is said (the form's blanks). */
const said = (v: unknown) => (v == null || v === "" ? NOT_SAID : String(v));

/**
 * The entry's airplane as 14 CFR 61.57(a)(1)(ii) judges passenger currency
 * by it: its category and class (61.5(b)'s words) and its gear, a
 * pull-down each, as every pick-one in the app is (PullDown), each "Not
 * Said" until said, which counts toward no passenger currency. A class
 * picked with no category says Airplane, the category every one of them
 * is (61.5(b)(2), "airplane class ratings"). `from` names the airplane
 * whose profile filled them in, said under them. `onPicked` tells the
 * form the pilot chose one, so typing another airplane's tail no longer
 * fills them.
 */
export default function AirplaneKindFields({
  control,
  from,
  onPicked,
}: {
  control: Control<LogbookEntryRequest>;
  from: string | null;
  onPicked: () => void;
}) {
  const { field: category } = useController({ control, name: "category" });
  const { field: aircraftClass } = useController({ control, name: "aircraftClass" });
  const { field: gear } = useController({ control, name: "tailwheel" });
  const row = (label: string, testId: string, value: string, options: { value: string; label: string }[], pick: (v: string) => void) => (
    <div className={ROW}>
      <span aria-hidden="true">{label}</span>
      <PullDown
        label={label}
        value={value}
        options={options}
        align="start"
        testId={testId}
        onChange={(v) => {
          onPicked();
          pick(v);
        }}
      />
    </div>
  );
  return (
    <>
      {row("Category", "logbook-category", said(category.value), KIND_CHOICES.category, (v) => category.onChange(v === NOT_SAID ? "" : v))}
      {row("Class", "logbook-aircraftClass", said(aircraftClass.value), KIND_CHOICES.aircraftClass, (v) => {
        aircraftClass.onChange(v === NOT_SAID ? "" : v);
        if (v !== NOT_SAID && !category.value) category.onChange(AIRPLANE);
      })}
      {row(
        "Gear",
        "logbook-tailwheel",
        gear.value === true ? "tailwheel" : gear.value === false ? "tricycle" : NOT_SAID,
        KIND_CHOICES.gear,
        (v) => gear.onChange(v === NOT_SAID ? "" : v === "tailwheel"),
      )}
      {from && (
        <p className={cn("pl-34 text-muted-foreground", TEXT.note)} data-testid="logbook-kind-from">
          From {from}&apos;s profile
        </p>
      )}
    </>
  );
}
