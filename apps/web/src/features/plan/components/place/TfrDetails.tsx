import { cn } from "cn";
import { faaWords } from "../../../../lib/advisories";
import { TEXT } from "../../../../lib/text";
import { dial } from "./contactLinks";
import { readTfr, type FieldNotam } from "./fieldNotams";

type Contact = NonNullable<NonNullable<FieldNotam["tfr"]>["facility"]>;

/** One whom-to-call line: its name as the engine writes it ("Fort Worth
 *  ARTCC", tfr_detail_read), its telephone a link the phone dials, its
 *  frequency. */
function ContactLine({ label, c, testId }: { label: string; c: Contact; testId: string }) {
  return (
    <div className="flex flex-col" data-testid={testId}>
      <span className={cn("text-muted-foreground", TEXT.note)}>{label}</span>
      <span className={TEXT.prose}>
        {c.name}
        {c.phone && (
          <>
            {", "}
            <a
              href={dial(c.phone)}
              className="relative font-medium text-tint tabular-nums after:absolute after:-inset-y-3 after:inset-x-0 after:content-['']"
              data-testid={`${testId}-phone`}
            >
              {c.phone}
            </a>
          </>
        )}
        {c.frequency && <span className="tabular-nums">{`, ${c.frequency}`}</span>}
      </span>
    </div>
  );
}

/**
 * A TFR's own card, under its lines: its place's name (tfr_read, the
 * list's title with its dates off, as the Since and Ends lines say them;
 * the owner, 2026-11-12: "dates are twice"), its instructions as the FAA
 * gives them a line each, in sentence case with their codes kept
 * (faaWords), never rewritten, and whom it names to call: the FAA
 * facility it is coordinated through and its point of contact, each with
 * a telephone that dials. Its NOTAM as sent stays under "TFR as Sent".
 */
export function TfrDetails({ n }: { n: FieldNotam }) {
  const t = n.tfr;
  const place = readTfr(n).place;
  return (
    <>
      {place && (
        <p className={cn("text-muted-foreground", TEXT.note)} data-testid="place-tfr-place">
          {place}
        </p>
      )}
      {t && t.instructions.length > 0 && (
        <div className="flex flex-col pt-2" data-testid="place-tfr-instructions">
          <span className={cn("text-muted-foreground", TEXT.note)}>Instructions</span>
          {t.instructions.map((line, i) => (
            <p key={i} className={TEXT.prose}>
              {faaWords(line)}
            </p>
          ))}
        </div>
      )}
      {t?.facility && <ContactLine label="Coordination facility" c={t.facility} testId="place-tfr-facility" />}
      {t?.contact && <ContactLine label="Point of contact" c={t.contact} testId="place-tfr-contact" />}
    </>
  );
}
