import AccordionSection from "../../../../components/AccordionSection";
import { ListGroup, ListRow } from "../../../../components/GroupedList";
import { cancelled, shareOrCopy, useCopied } from "../../../../lib/share";
import { passengerItems } from "./passengers";
import { usePreflight, useTicked } from "./preflight";
import { showError } from "../../../../lib/problems";

/**
 * The Brief's Passengers: the briefing 14 CFR 91.107 asks of the pilot in
 * command before every takeoff, and good practice besides, ticked off for
 * this flight as the preflight action is (features/plan/components/briefing/preflight's ticks, its own
 * keys); then the flight in a few lines, sent to the passengers from the
 * share sheet (features/plan/components/briefing/passengers).
 */
export default function PassengerBriefing({ flight, message }: { flight: string; message: string }) {
  const ticked = useTicked(flight);
  const tick = usePreflight(s => s.tick);
  const [copied, markCopied] = useCopied();
  const send = async () => {
    try {
      if (await shareOrCopy({ title: "Our flight", text: message }) === "copied") markCopied("message");
    } catch (err) {
      if (!cancelled(err)) showError("Could not send the flight", (err as Error).message);
    }
  };
  const PASSENGER_ITEMS = passengerItems();
  const done = PASSENGER_ITEMS.filter(i => ticked[i.key]).length;
  return (
    <AccordionSection title="Passengers">
      <div className="space-y-4" data-testid="passengers">
        {/* 91.107 asks the first two of the pilot in command before every
            takeoff; the rest is the FAA's SAFETY briefing, each row's
            source under it (features/plan/components/briefing/passengers). */}
        <ListGroup title={`Brief them · ${done} of ${PASSENGER_ITEMS.length}`}>
          {PASSENGER_ITEMS.map(item => (
            <ListRow
              key={item.key} checkbox={{ checked: !!ticked[item.key], onChange: on => tick(flight, item.key, on) }}
              title={item.title} description={item.rule}
              data-testid={`passenger-${item.key}`}
            />
          ))}
        </ListGroup>
        {/* What is sent, under the row that sends it, where it was a footnote. */}
        <ListGroup>
          <ListRow
            title={copied === "message" ? "Copied" : "Send the flight to your passengers"} description={message.split("\n").join(" ")}
            onClick={() => void send()} data-testid="passenger-send"
          />
        </ListGroup>
      </div>
    </AccordionSection>
  );
}
