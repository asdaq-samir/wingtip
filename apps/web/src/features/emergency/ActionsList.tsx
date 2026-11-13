import { cn } from "cn";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { NumberField } from "../../components/ui/number-field";
import { WHOLE } from "../../components/ui/numberFormats";
import FrequencyButton from "../../components/FrequencyButton";
import { TEXT } from "../../lib/text";
import type { EmergencyModel } from "./useEmergency";

/** The emergency frequency, VHF guard, by the engine's own label for it
 *  (maydayCall's channels, AIM 6-3-1(d)), as the iPhone finds it: its
 *  figure is the engine's, not written again here. */
const GUARD = "Guard";
/** The two figures a pilot reads first, large. */
const FIGURE = "text-2xl";

/**
 * What to do on the radio and the transponder, the engine's (features/emergency/emergency
 * maydayCall): squawk 7700 (AIM 6-2-2, an assigned code kept while
 * talking to ATC), the frequencies to try -- the one in use, the nearest
 * approach and tower the FAA lists, 121.5 (AIM 6-3-1(d)) -- and the
 * MAYDAY in AIM 6-3-2(a)(3)'s order, what the app does not know left in
 * brackets to say, with the two the pilot can tell it here. The phones:
 * the field picked's own, as the FAA lists it, and 911; none invented.
 */
export default function ActionsList({ vm }: { vm: EmergencyModel }) {
  const { mayday, souls, setSouls, fuelMin, setFuelMin, phone, picked } = vm;
  return (
    <>
      <ListGroup title="Transponder and radio">
        {/* The code and the guard frequency large, each a tap that copies
            it (FrequencyButton), as the doc's §8 has them: read at a
            glance in a cockpit that is shaking. */}
        <ListRow
          title={<span className="font-semibold">Squawk</span>}
          description={mayday.squawk_words}
          data-testid="emergency-squawk"
          value={
            <span className={FIGURE}>
              <FrequencyButton mhz={mayday.squawk} name="Squawk" testId="emergency-squawk-copy" />
            </span>
          }
        />
        {mayday.channels.map((c) => (
          <ListRow
            key={c.label}
            title={c.label}
            description={c.why}
            data-testid="emergency-channel"
            value={
              c.mhz != null ? (
                <span className={cn(c.label === GUARD && FIGURE)}>
                  <FrequencyButton mhz={c.mhz} name={c.label} />
                </span>
              ) : undefined
            }
          />
        ))}
      </ListGroup>
      <ListGroup title="MAYDAY">
        <div className={cn("space-y-0.5 px-4 py-3 font-medium", TEXT.row)} data-testid="emergency-mayday">
          {mayday.lines.map((line, i) => (
            <p key={i} className={cn(line.startsWith("[") && "text-muted-foreground")}>
              {line}
            </p>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 px-4 pb-3">
          <div className={cn("grid gap-1", TEXT.note)}>
            <label htmlFor="emergency-souls">People on board</label>
            <NumberField
              id="emergency-souls"
              defaultValue={souls === "" ? null : Number(souls)}
              onTyped={(v) => setSouls(v == null ? "" : String(v))}
              formatOptions={WHOLE}
              minValue={0}
              placeholder="2"
              data-testid="emergency-souls"
            />
          </div>
          <div className={cn("grid gap-1", TEXT.note)}>
            <label htmlFor="emergency-fuel">Fuel, minutes</label>
            <NumberField
              id="emergency-fuel"
              defaultValue={fuelMin === "" ? null : Number(fuelMin)}
              onTyped={(v) => setFuelMin(v == null ? "" : String(v))}
              formatOptions={WHOLE}
              minValue={0}
              placeholder="90"
              data-testid="emergency-fuel"
            />
          </div>
        </div>
      </ListGroup>
      <ListGroup title="Phone">
        {phone && picked && (
          <ListRow
            title={`Call ${picked.ident}`}
            description="The airport's phone, as the FAA lists it"
            href={`tel:${phone}`}
            data-testid="emergency-call-field"
          />
        )}
        <ListRow title="Call 911" href="tel:911" data-testid="emergency-call-911" />
      </ListGroup>
    </>
  );
}
