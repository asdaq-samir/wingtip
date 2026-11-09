import { cn } from "cn";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Input } from "../../components/ui/input";
import { mhzText } from "../../lib/frequencies";
import { TEXT } from "../../lib/text";
import type { EmergencyModel } from "./useEmergency";

/**
 * What to do on the radio and the transponder, the engine's (lib/emergency
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
        <ListRow
          title={<span className="font-semibold">Squawk {mayday.squawk}</span>} description={mayday.squawk_words}
          data-testid="emergency-squawk"
        />
        {mayday.channels.map(c => (
          <ListRow
            key={c.label} title={c.label} description={c.why} data-testid="emergency-channel"
            value={c.mhz != null ? <span className="font-semibold tabular-nums">{mhzText(c.mhz)}</span> : undefined}
          />
        ))}
      </ListGroup>
      <ListGroup title="MAYDAY">
        <div className={cn("space-y-0.5 px-4 py-3 font-medium", TEXT.row)} data-testid="emergency-mayday">
          {mayday.lines.map((line, i) => (
            <p key={i} className={cn(line.startsWith("[") && "text-muted-foreground")}>{line}</p>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 px-4 pb-3">
          <div className={cn("grid gap-1", TEXT.note)}>
            <label htmlFor="emergency-souls">People on board</label>
            <Input id="emergency-souls" inputMode="numeric" value={souls} onChange={e => setSouls(e.target.value)} placeholder="2" data-testid="emergency-souls" />
          </div>
          <div className={cn("grid gap-1", TEXT.note)}>
            <label htmlFor="emergency-fuel">Fuel, minutes</label>
            <Input id="emergency-fuel" inputMode="numeric" value={fuelMin} onChange={e => setFuelMin(e.target.value)} placeholder="90" data-testid="emergency-fuel" />
          </div>
        </div>
      </ListGroup>
      <ListGroup title="Phone">
        {phone && picked && <ListRow title={`Call ${picked.ident}`} description="The airport's phone, as the FAA lists it" href={`tel:${phone}`} data-testid="emergency-call-field" />}
        <ListRow title="Call 911" href="tel:911" data-testid="emergency-call-911" />
      </ListGroup>
    </>
  );
}
