import { cn } from "cn";
import { ListGroup, ListRow } from "../../../../components/GroupedList";
import FindingIcon from "../../../../components/FindingIcon";
import { TEXT } from "../../../../lib/text";
import { feetRange } from "../../../../lib/units";
import type { Leg } from "../../../../lib/api/types";
import type { FlightBriefing } from "../../hooks/useFlightBriefing";
import { severityWord } from "../../hooks/useIcingForecast";
import { altFt, clockTime } from "../../format";
import { Pending } from "./BriefingBits";

/**
 * Under IFR, in Adverse Conditions: the AWC's forecast icing on each leg
 * at the altitude it is flown, a row a leg -- the severity there, the
 * share of the leg in it, and the levels icing is forecast between over
 * the leg, for a way out above or below (AIM 7-1-19: "go to an altitude
 * where the temperature is above freezing"). What it says is the
 * engine's (icing_forecast_route); the rows only write it.
 */
export default function ForecastIcingRows({ vm, legs }: { vm: FlightBriefing; legs: Leg[] }) {
  const { icingForecast } = vm;
  if (!vm.ifr) return null;
  if (icingForecast.isError) {
    return (
      <p className={cn("pt-2 text-caution-ink", TEXT.detail)} data-testid="icing-forecast-unchecked">
        The forecast icing could not be checked — aviationweather.gov didn’t respond. Verify separately before flight.
      </p>
    );
  }
  const found = icingForecast.data;
  if (!found) {
    return icingForecast.isFetching ? <Pending>Fetching the forecast icing along the legs…</Pending> : null;
  }
  return (
    <ListGroup
      title="Forecast Icing"
      // The source and its issue, a credit.
      footer={`AWC CIP and FIP, issued ${clockTime(new Date(found.issued))}`}
      className="pt-2"
    >
      {found.legs.map(leg => {
        const on = legs[leg.index];
        const iced = leg.severity != null && leg.severity !== "none";
        return (
          <ListRow
            key={leg.index}
            media={<FindingIcon finding={leg.severity == null ? "unknown" : iced ? "caution" : "ok"} />}
            title={<span className="line-clamp-1">{on ? `${on.from} → ${on.to}` : `Leg ${leg.index + 1}`}</span>}
            description={leg.layer ? `Icing forecast ${feetRange([leg.layer.bottom_ft, leg.layer.top_ft])}` : leg.severity == null ? undefined : "No icing forecast over the leg"}
            value={`${severityWord(leg.severity)} at ${altFt(leg.altitude_ft)} ft${iced && leg.share != null && leg.share < 1 ? `, ${Math.round(leg.share * 100)}% of it` : ""}`}
            data-testid="icing-forecast-leg"
          />
        );
      })}
    </ListGroup>
  );
}
