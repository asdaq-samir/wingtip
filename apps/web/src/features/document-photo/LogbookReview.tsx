import { useId } from "react";
import FieldHit from "../../components/FieldHit";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Input } from "../../components/ui/input";
import { said } from "../../lib/endorsements";
import { FlagLines } from "./PhotoSheet";
import { loggable, tenth } from "./reads";
import type { DocumentPhoto } from "./useDocumentPhoto";

/** The date of a row the page gave none for, or one the engine says is
 *  wrong: the one figure a row cannot be logged without. */
function DateRow({ value, onChange, testId }: { value: string; onChange: (value: string) => void; testId: string }) {
  const id = useId();
  return (
    <ListRow
      title="Date"
      value={(
        <FieldHit htmlFor={id}>
          <Input id={id} type="date" defaultValue={value} aria-label="Date flown" className="h-8 w-40" data-testid={testId}
            onBlur={e => { if (e.target.value && e.target.value !== value) onChange(e.target.value); }}
          />
        </FieldHit>
      )}
    />
  );
}

/**
 * The page's flights as read, each the logbook entry it makes with what to
 * check about it, and a tick to log it: none logged until the pilot ticks
 * it and asks. A flight with no date cannot be ticked until it has one.
 */
export default function LogbookReview({ photo }: { photo: DocumentPhoto }) {
  const check = photo.logbook?.check;
  if (!check) return null;
  if (!check.rows.length) return <p className="text-muted-foreground">No flights were read from this page.</p>;
  return (
    <>
      {check.flags.length > 0 && (
        <ListGroup title="This Page">
          <ListRow title={<FlagLines flags={check.flags} testId="flags-page" />} />
        </ListGroup>
      )}
      {check.rows.map(({ entry, flags }, i) => {
        const dated = loggable(entry);
        const landings = entry.dayLandings + entry.nightLandings;
        const logged = photo.logged.has(i);
        return (
          <ListGroup key={i} title={`${dated ? said(entry.flownOn as string) : "No Date Read"}${entry.route ? ` · ${entry.route}` : ""}`}>
            <ListRow
              title={[entry.aircraft, entry.aircraftType].filter(Boolean).join(" ") || "Airplane not read"}
              description={[
                `${tenth(entry.totalHours)} h`,
                entry.nightHours ? `${tenth(entry.nightHours)} night` : "",
                entry.crossCountryHours ? `${tenth(entry.crossCountryHours)} cross-country` : "",
                `${landings} landing${landings === 1 ? "" : "s"}`,
                entry.approaches ? `${entry.approaches} approach${entry.approaches === 1 ? "" : "es"}` : "",
                entry.remarks ?? "",
              ].filter(Boolean).join(" · ")}
            />
            {(!dated || flags.some(f => f.field === "flownOn")) && (
              <DateRow value={entry.flownOn ?? ""} onChange={v => photo.correctRow(i, "date", v)} testId={`row-${i}-date`} />
            )}
            {flags.length > 0 && <ListRow title={<FlagLines flags={flags} testId={`flags-row-${i}`} />} />}
            <ListRow
              title={logged ? "Logged" : "Log This Flight"}
              checkbox={dated && !logged ? { checked: photo.confirmed.has(`row.${i}`), onChange: () => photo.toggle(`row.${i}`) } : undefined}
              muted={!dated || logged}
              data-testid={`keep-row-${i}`}
            />
          </ListGroup>
        );
      })}
    </>
  );
}
