import { useEffect, useRef, useState } from "react";
import { Radio } from "lucide-react";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { FieldError } from "../../components/ui/field";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { RowBadge } from "../../components/RowBadge";
import { BADGE } from "../../lib/rowBadges";
import { TEXT } from "../../lib/text";
import { useCanListen } from "../../lib/speechLocal";
import { chosenOutside, heardThrough, lostWords, useAtcRadio } from "../../lib/atcRadio";
import { atisRows, glanceWords, heardAny, hearAtis, readAtis, type AtisReading } from "./atis";
import { WORDING } from "../../lib/wording/generated/wording";

/**
 * Listen to ATIS, on the field card's Weather tab under the report: a
 * tap hears one broadcast through the microphone (features/place/atis's hearAtis,
 * the same recognizer as the radio's), the engine reads it, and what
 * matters at the hold-short line is one line -- the runway in use and
 * the altimeter -- with the figures in a short table under it and the
 * transcript folded away. A failure is said in the row, not a toast
 * (lib/problems). Only where the phone or browser can listen at all.
 *
 * It hears through the input the radio does (lib/audioInput): where the
 * recognizer is known to hear an audio panel's Bluetooth link or a cable
 * chosen (lib/atcRadio's heardThrough), the row says so and no longer asks
 * for the phone at the speaker (the owner's "Bluetooth is fine",
 * 2026-11-04). Why it did not listen, or stopped for the microphone, is a
 * notice in caution ink, not a failure.
 */
export function AtisRows() {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [reading, setReading] = useState<AtisReading | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const input = useAtcRadio((s) => s.input);
  const through = heardThrough(input);
  const chosen = chosenOutside(input);
  // Keyed by the field in PlaceCard, so another field's card is another
  // broadcast; the hearing ends with the card.
  useEffect(() => () => stop.current?.(), []);
  // Heard on the device or not at all (lib/speechLocal).
  const canListen = useCanListen();
  if (!canListen) return null;

  const start = () => {
    if (listening) {
      stop.current?.();
      return;
    }
    setListening(true);
    setProblem(null);
    setNotice(null);
    setReading(null);
    setHeard("");
    const hearing = hearAtis(setHeard);
    stop.current = hearing.stop;
    void hearing.done.then(({ text, error, notice: why, through: heardThrough }) => {
      stop.current = null;
      setListening(false);
      if (error) {
        setProblem(error);
        return;
      }
      if (!text && why) {
        setNotice(why);
        return;
      }
      if (!text) {
        // In words for a cable or a panel alike: the page cannot tell them apart.
        setProblem(
          heardThrough
            ? `Nothing was heard through ${heardThrough}. Tune the ATIS, check it is sending the radio (an audio panel's recording mode, or the cable) and tap again.`
            : "Nothing was heard. Tune the ATIS, hold the phone to the speaker and tap again.",
        );
        return;
      }
      try {
        const read = readAtis(text);
        setReading(read);
        if (!heardAny(read)) setProblem("Nothing of a broadcast was heard in that.");
      } catch (err) {
        setProblem(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const glance = reading && heardAny(reading) ? glanceWords(reading) : null;
  const lost = listening && input?.lost ? lostWords(input) : null;
  const caution = notice ?? lost;
  return (
    <div className="pt-5" data-testid="place-atis">
      <ListGroup>
        <ListRow
          media={
            <RowBadge colour={BADGE.weather}>
              <Radio />
            </RowBadge>
          }
          title={listening ? WORDING.listeningToTheRadio : "Listen to ATIS"}
          description={
            listening
              ? heard ||
                (through
                  ? `Tune the ATIS or AWOS; listening through ${through}`
                  : chosen
                    ? `Tune the ATIS or AWOS; ${chosen} chosen, or hold the phone to the speaker`
                    : "Tune the ATIS or AWOS and hold the phone to the speaker")
              : undefined
          }
          onClick={start}
          data-testid="place-atis-listen"
        />
        {(problem || caution) && (
          <ListRow
            muted
            title={
              // Said as it comes, the listen just tapped (WCAG 4.1.3): a
              // problem as the stock field error's alert, a caution as a status.
              problem ? (
                <FieldError className={TEXT.detail} data-testid="place-atis-problem">
                  {problem}
                </FieldError>
              ) : (
                <span role="status" className={cn("text-caution-ink", TEXT.detail)} data-testid="place-atis-problem">
                  {caution}
                </span>
              )
            }
          />
        )}
        {glance && (
          <ListRow
            title={<span className="font-semibold text-foreground">{glance}</span>}
            data-testid="place-atis-glance"
            value={reading?.information ? <span className="text-foreground">Information {reading.information}</span> : undefined}
          />
        )}
        {reading && <AtisReadingRows reading={reading} rowTestId="place-atis-row" />}
        {reading && <AtisRawFold title="Transcript" text={reading.raw} testId="place-atis-transcript" rawTestId="place-atis-raw" />}
      </ListGroup>
    </div>
  );
}

/** The figures a read ATIS gives, a row each (the heard one's and the
 *  tower's D-ATIS, LiveAirportRows, alike): nothing where nothing was
 *  heard. `remarks: false` leaves the remarks to a list of their own. */
export function AtisReadingRows({ reading, rowTestId, remarks }: { reading: AtisReading; rowTestId?: string; remarks?: boolean }) {
  if (!heardAny(reading)) return null;
  return atisRows(reading, { remarks }).map((row, k) => (
    <ListRow
      key={`${row.label}-${k}`}
      title={row.label}
      value={<span className="text-foreground">{row.value}</span>}
      data-testid={rowTestId}
    />
  ));
}

/** The words as sent, folded under a row (the transcript, the D-ATIS text). */
export function AtisRawFold({ title, text, testId, rawTestId }: { title: string; text: string; testId?: string; rawTestId?: string }) {
  return (
    <Collapsible>
      <CollapsibleTrigger render={<ListRow title={title} chevron data-testid={testId} />} />
      <CollapsibleContent>
        <ListRow
          title={
            <span className={cn("font-mono break-words text-muted-foreground", TEXT.detail)} data-testid={rawTestId}>
              {text}
            </span>
          }
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
