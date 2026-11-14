import { ListGroup, ListRow } from "../../components/GroupedList";
import type { AirplaneDetails, AirplanePhoto } from "../../lib/airplane/details";
import { dayMonthYear } from "../../lib/format";

/** An ISO date as the app writes every day: "31 Jan 2033". */
const day = (iso: string | null | undefined) => (iso ? dayMonthYear(new Date(`${iso}T00:00:00`)) : null);
const joined = (...parts: (string | number | null | undefined)[]) =>
  parts.filter((p) => p !== null && p !== undefined && p !== "").join(" · ");

/** A group's own line where it has nothing, in place. */
const None = ({ text, testId }: { text: string; testId: string }) => <ListRow muted title={text} data-testid={testId} />;

/**
 * The airplane card's Info past the registry's record (the owner's P1,
 * 2026-11-14): its History -- the registrations canceled before (the FAA's
 * DEREG file), then its NTSB accidents and incidents, each row the NTSB's
 * CAROL report -- where it is usually based, by its own flights (the
 * engine's usual_base), and its photo, on Planespotters.net's terms: the
 * photographer's name in sight beside it, the picture a plain link to its
 * page, loaded from their address unchanged. All public data; each group
 * says in place where it has none. `details` undefined while it is asked.
 */
export default function AirplaneHistory({
  details,
  failed,
  photo,
}: {
  details: AirplaneDetails | undefined;
  failed: boolean;
  photo: AirplanePhoto | null | undefined;
}) {
  const waiting = failed ? "Couldn't fetch it. Try again in a moment." : "Fetching…";
  const past = details?.past_registrations ?? [];
  const ntsb = details?.ntsb ?? [];
  const field = details?.based?.field;
  return (
    <div className="space-y-5">
      <div data-testid="airplane-history">
        <ListGroup title="History">
          {!details && <None text={waiting} testId="airplane-history-waiting" />}
          {details && past.length === 0 && ntsb.length === 0 && (
            <None text="No past registrations or NTSB reports." testId="airplane-history-none" />
          )}
          {past.map((p, i) => (
            <ListRow
              key={`reg-${i}`}
              title={joined(p.n_number, p.same_airframe ? "this airframe" : "another airplane", p.status)}
              description={joined(
                [p.manufacturer, p.model].filter(Boolean).join(" ") || null,
                p.year,
                p.owner,
                [p.city, p.state].filter(Boolean).join(", ") || null,
                p.cancel_date && `canceled ${day(p.cancel_date)}`,
                p.export_country && `exported to ${p.export_country}`,
              )}
              data-testid="airplane-past-registration"
            />
          ))}
          {ntsb.map((c) => (
            <ListRow
              key={c.ev_id}
              title={joined(day(c.date), c.kind, c.ntsb_no)}
              description={joined([c.city, c.state].filter(Boolean).join(", ") || null, c.phase, c.damage, c.highest_injury)}
              href={c.carol_url}
              chevron
              data-testid="airplane-ntsb"
            />
          ))}
        </ListGroup>
      </div>
      <div data-testid="airplane-based">
        <ListGroup title="Based at">
          {!details && <None text={waiting} testId="airplane-based-waiting" />}
          {details && field && (
            <ListRow
              title={joined(field.ident, field.name)}
              description={`${details.based!.count} of its last ${details.based!.ends} takeoffs and landings`}
              data-testid="airplane-based-field"
            />
          )}
          {details && !field && (
            <None
              text={details.based_pending ? "Looking at its flights…" : "Its flights show no one field it keeps to."}
              testId="airplane-based-none"
            />
          )}
        </ListGroup>
      </div>
      <div data-testid="airplane-photos">
        <ListGroup title="Photos">
          {photo === undefined && <None text="Fetching…" testId="airplane-photo-waiting" />}
          {photo === null && <None text="No photo of this airplane on Planespotters.net." testId="airplane-photo-none" />}
          {photo && (
            <div className="flex flex-col gap-1.5 p-3" data-testid="airplane-photo">
              {/* Their terms: the image a plain link to its page, loaded from their address unchanged. */}
              <a href={photo.link} target="_blank" rel="noopener noreferrer">
                <img
                  src={photo.thumbnail_large ?? photo.thumbnail ?? undefined}
                  width={photo.width ?? undefined}
                  height={photo.height ?? undefined}
                  alt={`The airplane, photographed by ${photo.photographer ?? "a Planespotters.net photographer"}`}
                  className="h-auto w-full rounded-lg"
                  loading="lazy"
                />
              </a>
              <a href={photo.link} target="_blank" rel="noopener noreferrer" className="text-tint" data-testid="airplane-photo-credit">
                {`© ${photo.photographer ?? "Photographer"} · ${photo.source ?? "Planespotters.net"}`}
              </a>
            </div>
          )}
        </ListGroup>
      </div>
    </div>
  );
}
