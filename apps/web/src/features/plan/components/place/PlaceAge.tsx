import KeptAge from "../../../../components/KeptAge";
import { useLatestAnswer } from "../../../../lib/kept/latest";

/** An airport card's age where it is the one kept on this device, no
 *  signal to ask again (lib/kept): over its weather as the METAR's and
 *  TAF's (an hour), over its frequencies and runways as its cycle's. */
export default function PlaceAge({ ident, kind }: { ident: string; kind: "weather" | "airports" }) {
  const latest = useLatestAnswer(["airport", ident]);
  return (
    <KeptAge kind={kind} path={`/api/planner/airport/${ident}`} atMs={latest?.atMs ?? null} failed={latest?.failed} className="pb-2" />
  );
}
