import { useState } from "react";
import FieldHit from "../../components/FieldHit";
import { ListRow } from "../../components/GroupedList";
import { DateField } from "../../components/ui/date-field";
import { Input } from "../../components/ui/input";
import type { EndorsementKind, Training } from "../../lib/api/types";
import { GoodTo } from "./Endorsements";

type Recorded = Training["endorsements"][number];

/** What a paper endorsement's record is saved as: the day it was signed
 *  on (none takes it away) and the make and model it names. */
export type PaperSave = { code: string; on: string | null; makeModel: string | null };

/**
 * An endorsement signed in the paper logbook, as the student keeps it: the
 * day it was signed on and, for one that names the airplane (a solo's,
 * 14 CFR 61.87(n); a solo cross-country's, 61.93(c)(2)), the make and
 * model it names, which an instructor's review of a solo cross-country is
 * asked in (61.93(d)(4), (5): "for the make and model of aircraft to be
 * flown"). The kinds that name one are those whose fields have the make
 * and model (the engine's endorsement_kinds, its "mm"). Saved as the day
 * is picked, and the make and model as its box is left.
 */
export default function PaperEndorsement({
  kind,
  on,
  onSave,
}: {
  kind: EndorsementKind;
  on: Recorded | undefined;
  onSave: (save: PaperSave) => void;
}) {
  const mm = kind.fields.find((f) => f.key === "mm");
  const [typed, setTyped] = useState(on?.makeModel ?? "");
  const makeModel = typed.trim() || null;
  const dayId = `endorsement-day-${kind.code}`;
  const mmId = `endorsement-mm-${kind.code}`;
  return (
    <>
      <ListRow
        id={dayId}
        title={kind.label}
        description={
          <>
            <span className="block">{kind.rule}</span>
            <GoodTo until={on?.until} />
          </>
        }
        data-testid="endorsement"
      >
        <DateField
          id={dayId}
          aria-label={`${kind.label}, the day endorsed`}
          className="h-8 w-40"
          value={on?.endorsedOn ?? ""}
          data-testid={`endorsement-${kind.code}`}
          onChange={(day) => onSave({ code: kind.code, on: day || null, makeModel })}
        />
      </ListRow>
      {mm && (
        <ListRow id={mmId} title={mm.label} description={on ? undefined : "Saved with the day it was signed"}>
          <FieldHit htmlFor={mmId}>
            <Input
              id={mmId}
              value={typed}
              placeholder={mm.example}
              maxLength={80}
              aria-label={`${kind.label}, ${mm.label.toLowerCase()}`}
              className="h-8 w-40 text-right"
              data-testid={`endorsement-mm-${kind.code}`}
              onChange={(e) => setTyped(e.target.value)}
              // Kept once the box is left, on the day already recorded;
              // with no day yet, sent with the day when it is picked.
              onBlur={() => {
                if (on && makeModel !== (on.makeModel ?? null)) onSave({ code: kind.code, on: on.endorsedOn, makeModel });
              }}
            />
          </FieldHit>
        </ListRow>
      )}
    </>
  );
}
