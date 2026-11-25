import AccordionSection from "../../components/AccordionSection";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Button } from "../../components/ui/button";
import { done as confirm } from "../../lib/doneNote";
import { cancelled, shareOrCopy } from "../../lib/share";
import { passengerItems } from "./passengers";
import { usePreflight, useTicked } from "./preflight";
import { showError } from "../../lib/problems";
import { describeError } from "../../lib/api/client";

/**
 * The Brief's Passengers: the briefing 14 CFR 91.107 asks of the pilot in
 * command before every takeoff, and good practice besides, ticked off for
 * this flight as the preflight action is (features/brief/preflight's ticks, its own
 * keys); then the flight in a few lines, sent to the passengers from the
 * share sheet (features/brief/passengers).
 */
export default function PassengerBriefing({ flight, message }: { flight: string; message: string }) {
  const ticked = useTicked(flight);
  const tick = usePreflight((s) => s.tick);
  const send = async (row: Element) => {
    try {
      if ((await shareOrCopy({ title: "Our flight", text: message })) === "copied") confirm("Copied", { near: row });
    } catch (err) {
      if (!cancelled(err)) showError("Could Not Send the Flight", describeError(err));
    }
  };
  const PASSENGER_ITEMS = passengerItems();
  const done = PASSENGER_ITEMS.filter((i) => ticked[i.key]).length;
  return (
    <AccordionSection title="Passengers">
      <div className="space-y-4" data-testid="passengers">
        {/* 91.107 asks the first two of the pilot in command before every
            takeoff; the rest is the FAA's SAFETY briefing, each row's
            source under it (features/brief/passengers). */}
        <ListGroup title={`Brief them · ${done} of ${PASSENGER_ITEMS.length}`}>
          {PASSENGER_ITEMS.map((item) => (
            <ListRow
              key={item.key}
              checkbox={{ checked: !!ticked[item.key], onChange: (on) => tick(flight, item.key, on) }}
              title={item.title}
              description={item.rule}
              data-testid={`passenger-${item.key}`}
            />
          ))}
        </ListGroup>
        {/* What is sent, a plain row, and its Send a quiet chip at the
            row's end, plainly the one thing on it that acts (the owner,
            2026-11-25: "it should be very clear what's happening with the
            tap"), where the whole row was the button. */}
        <ListGroup title="For Your Passengers">
          <ListRow title="The Flight" description={message.split("\n").join(" ")} data-testid="passenger-message">
            <Button variant="secondary" size="chip" onClick={(event) => void send(event.currentTarget)} data-testid="passenger-send">
              Send
            </Button>
          </ListRow>
        </ListGroup>
      </div>
    </AccordionSection>
  );
}
