import { ListGroup, ListRow } from "../../components/GroupedList";
import type { AirplaneDetails } from "../../lib/api/types";
import { day } from "./infoDay";

const joined = (...parts: (string | number | null | undefined)[]) =>
  parts.filter((p) => p !== null && p !== undefined && p !== "").join(" · ");
const town = (city?: string | null, state?: string | null) => [city, state].filter(Boolean).join(", ") || null;

/** A group's own line where it has nothing, in place. */
const None = ({ text, testId }: { text: string; testId: string }) => <ListRow muted title={text} data-testid={testId} />;

/**
 * The airplane card's Info past its record (the owner's P1, 2026-11-14), in
 * claude/plane-data's order: where it is usually based, by its own flights
 * (the engine's usual_base), nothing where they do not show one clearly;
 * its safety history, the NTSB's cases, each its report and docket; its
 * ownership history, this airframe's past registrations first, then other
 * airplanes that held the N-number (the FAA's DEREG); and the documents
 * filed against it and any reservation of the N-number. All public data;
 * each group says in place where it has none. `details` undefined while it
 * is asked.
 */
export default function AirplaneHistory({ details, failed }: { details: AirplaneDetails | undefined; failed: boolean }) {
  if (!details)
    return (
      <ListGroup title="History">
        <None
          text={failed ? "Its history couldn't be fetched. Try again in a moment." : "Fetching its history…"}
          testId="airplane-history-waiting"
        />
      </ListGroup>
    );
  const { based, ntsb, documents, reservation } = details;
  const past = [...details.past_registrations].sort((a, b) => Number(b.same_airframe) - Number(a.same_airframe));
  return (
    <div className="space-y-5">
      {(based?.field || details.based_pending) && (
        <div data-testid="airplane-based">
          <ListGroup title="Usually based at">
            {based?.field ? (
              <ListRow
                title={joined(based.field.ident, based.field.name)}
                description={`${based.count} of ${based.ends} takeoffs and landings`}
                data-testid="airplane-based-field"
              />
            ) : (
              <None text="Looking…" testId="airplane-based-pending" />
            )}
          </ListGroup>
        </div>
      )}
      <div data-testid="airplane-safety">
        <ListGroup title="Safety history">
          {ntsb.length === 0 && <None text="No NTSB accident or incident on record since 2008." testId="airplane-ntsb-none" />}
          {ntsb.map((c) => (
            <ListRow
              key={c.ev_id}
              title={joined(day(c.date), c.kind, c.ntsb_no)}
              description={joined(town(c.city, c.state), c.phase, c.damage, c.highest_injury)}
              href={c.carol_url}
              data-testid="airplane-ntsb"
            />
          ))}
          {ntsb
            .filter((c) => c.docket_url)
            .map((c) => (
              <ListRow
                key={`docket-${c.ev_id}`}
                title={`Docket ${c.ntsb_no ?? ""}`.trim()}
                href={c.docket_url!}
                data-testid="airplane-ntsb-docket"
              />
            ))}
        </ListGroup>
      </div>
      <div data-testid="airplane-ownership">
        <ListGroup title="Ownership history">
          {past.length === 0 && <None text="No past registrations." testId="airplane-ownership-none" />}
          {past.map((p, i) => (
            <ListRow
              key={`reg-${i}`}
              title={joined(p.n_number, p.same_airframe ? "This airframe" : "Another airplane", p.status)}
              description={joined(
                [p.manufacturer, p.model].filter(Boolean).join(" ") || null,
                p.year,
                p.owner,
                town(p.city, p.state),
                p.cancel_date && `canceled ${day(p.cancel_date)}`,
                p.export_country && `exported to ${p.export_country}`,
              )}
              data-testid="airplane-past-registration"
            />
          ))}
        </ListGroup>
      </div>
      <div data-testid="airplane-documents">
        <ListGroup title="Documents filed">
          {documents.length === 0 && !reservation && <None text="None filed in the last month." testId="airplane-documents-none" />}
          {documents.map((d, i) => (
            <ListRow
              key={d.document_id ?? `doc-${i}`}
              title={d.kind ?? "Document"}
              description={joined(d.received && `received ${day(d.received)}`, d.entered && `entered ${day(d.entered)}`)}
            />
          ))}
          {reservation && (
            <ListRow
              title="N-number reserved"
              description={joined(
                reservation.registrant,
                town(reservation.city, reservation.state),
                reservation.reserved && day(reservation.reserved),
                reservation.kind,
                reservation.change_to && `changing to ${reservation.change_to}`,
              )}
              data-testid="airplane-reservation"
            />
          )}
        </ListGroup>
      </div>
    </div>
  );
}
