import { useId, useState } from "react";
import SheetDialog from "../../../components/SheetDialog";
import { useDiscardGuard } from "../../../components/discardGuard";
import { NumberField } from "../../../components/ui/number-field";
import { THREE_FIGURES } from "../../../components/ui/numberFormats";
import { frdIdent } from "../../../lib/identSchema";

/** A distance in nm, to a hundredth at most. */
const DISTANCE: Intl.NumberFormatOptions = { useGrouping: false, maximumFractionDigits: 2 };

/**
 * The pilot's own point off a point of the route, from its menu's "Create
 * a fix from here…", at the owner's ask ("30 miles 090 radial of vpbng",
 * "a fix should get its own row"): its magnetic course from there -- a
 * VOR's radial -- and how far, as a flight plan writes a fix/radial/
 * distance (FAA Form 7233-4), and the route flies over it next. Asked as
 * iOS asks for a figure or two: an alert with its fields from `md` up, and
 * on a phone a sheet with Cancel and Add in its title row (SheetDialog).
 */
export default function FixFromDialog({
  from,
  onClose,
  onCreate,
}: {
  /** The point it is measured from; null, put away. */
  from: string | null;
  onClose: () => void;
  onCreate: (ident: string) => void;
}) {
  // Kept as it closes, so its words stay as it slides away; and empty
  // again each time it is opened.
  const [was, setWas] = useState(from);
  const [shown, setShown] = useState(from);
  // The figures as typed (React Aria's NumberField, read in the pilot's
  // locale: "12,5" nm is twelve and a half where a comma is the decimal),
  // and the fields made new at each opening.
  const [course, setCourse] = useState<number | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [opened, setOpened] = useState(0);
  if (from !== was) {
    setWas(from);
    if (from) {
      setShown(from);
      setCourse(null);
      setDistance(null);
      setOpened((n) => n + 1);
    }
  }
  const form = useId();
  const at = shown ?? "";
  const deg = course ?? Number.NaN;
  const nm = distance ?? Number.NaN;
  // A course of 001 to 360 (000 is 360), out to 999 nm, as the planner
  // takes one (wingtip.fixes.parse_frd).
  const valid = deg >= 0 && deg <= 360 && nm > 0 && nm <= 999;
  const ident = valid ? frdIdent(at, deg, nm) : null;
  // A course or distance typed is asked about before it is thrown away (useDiscardGuard).
  const [closing, discard] = useDiscardGuard(course != null || distance != null, onClose);
  return (
    <>
      {discard}
      <SheetDialog
        open={!!from}
        onOpenChange={closing}
        alert
        cancel
        size="sm"
        title={`A fix from ${at}`}
        description={`Its magnetic course from ${at}, a VOR's radial, and how far. Flown over next${ident ? `: ${ident}` : "."}`}
        action={{ label: "Add", form, disabled: !valid, testId: "fix-from-add" }}
        initialFocus={(sheet) => sheet.querySelector("input")}
      >
        <form
          id={form}
          onSubmit={(e) => {
            e.preventDefault();
            if (ident) onCreate(ident);
          }}
          className="flex gap-2"
        >
          {/* Each figure with its unit inside the field, as the airplane
            form's figures have theirs: the course in three figures (090). */}
          <NumberField
            key={`course-${opened}`}
            defaultValue={null}
            onTyped={setCourse}
            formatOptions={THREE_FIGURES}
            minValue={0}
            maxValue={999}
            placeholder="090"
            unit="°"
            aria-label={`Magnetic course from ${at}, degrees`}
            className="h-10 flex-1 font-mono"
            inputClassName="font-mono"
            data-testid="fix-from-course"
          />
          <NumberField
            key={`distance-${opened}`}
            defaultValue={null}
            onTyped={setDistance}
            formatOptions={DISTANCE}
            minValue={0}
            maxValue={999}
            placeholder="30"
            unit="nm"
            aria-label={`Distance from ${at}, nautical miles`}
            className="h-10 flex-1 font-mono"
            inputClassName="font-mono"
            data-testid="fix-from-distance"
          />
        </form>
      </SheetDialog>
    </>
  );
}
