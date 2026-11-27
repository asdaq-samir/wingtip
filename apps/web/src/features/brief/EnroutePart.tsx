import { cn } from "cn";
import { OctagonAlert, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import AccordionSection from "../../components/AccordionSection";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { TEXT } from "../../lib/text";
import { clockAndZulu } from "../../lib/format";
import { WINDS_MODELLED_LABEL, windsSource } from "../../lib/windsAloft";
import type { Course, Leg, Totals } from "../../lib/api/types";
import type { FlightBriefing } from "./useFlightBriefing";
import { altFt, ceilingAndVisibility, feet, windText } from "../plan";
import OnRouteRow from "./OnRouteRow";
import { faaWords, gairmetAltitudes, gairmetTitle, sigmetHazard } from "../../lib/advisories";
import WeatherAlongRoute from "./WeatherAlongRoute";
import FindingIcon from "../../components/FindingIcon";
import { Flag, Pending } from "./BriefingBits";
import { hazardAltitudeRange } from "./briefingWords";
import ForecastIcingRows from "./ForecastIcingRows";
import { WORDING } from "../../lib/wording/generated/wording";

interface Props {
  vm: FlightBriefing;
  course: Course | null;
  legs: Leg[];
  depart: string;
  /** Whose winds the plan flies (the totals'), named as the nav log names them. */
  winds?: Totals["winds"];
}

/** En route, under the legs and the side view: the weather on the way --
 *  adverse conditions first (AIM 7-1-5), then stretch by stretch, then
 *  the winds. */
export default function EnroutePart({ vm, course, legs, depart, winds }: Props) {
  const { briefing, briefingPendingMessage, briefingComing, unchecked, opened } = vm;
  return (
    <>
      <AdverseConditions vm={vm} legs={legs} />

      {briefing && course ? (
        <WeatherAlongRoute
          briefing={briefing}
          course={course}
          legs={legs}
          departIso={depart || opened}
          unchecked={unchecked}
          phase="enroute"
        />
      ) : (
        <AccordionSection title={WORDING.alongTheRoute}>
          <Pending coming={briefingComing}>{briefingPendingMessage}</Pending>
        </AccordionSection>
      )}

      <WindsAloft vm={vm} legs={legs} winds={winds} />
    </>
  );
}

function AdverseConditions({ vm, legs }: { vm: FlightBriefing; legs: Leg[] }) {
  const { vnrReasons, underMine, icing, hazardNames, briefing, briefingPendingMessage, briefingComing, unchecked } = vm;
  // Under IFR, icing the AWC forecasts at an altitude flown (ForecastIcingRows).
  const icingForecast = vm.ifr && !!vm.icingForecast.data?.worst;
  return (
    <AccordionSection
      title="Adverse Conditions"
      // On the title, seen before anything under it: VFR not
      // recommended, or short of that, under the pilot's own minimums.
      aside={
        vnrReasons.length > 0 ? (
          <Flag finding="stop" testId="vnr-flag">
            VFR Not Recommended
          </Flag>
        ) : underMine.length > 0 ? (
          <Flag finding="stop" testId="minimums-flag">
            Under Your Minimums
          </Flag>
        ) : icing || icingForecast ? (
          <Flag finding="caution" testId="icing-flag">
            {icing ? "Icing Possible" : WORDING.forecastIcing}
          </Flag>
        ) : hazardNames.length > 0 ? (
          <Flag finding="caution" testId="hazards-flag">
            {hazardNames.length === 1 ? "A Hazard" : `${hazardNames.length} Hazards`}
          </Flag>
        ) : undefined
      }
    >
      {/* Its own standard element (AIM 7-1-5(b)), stated first, the
          way a live briefer states it before the detail that
          justifies it. Red on pale red at 7:1, in both themes. */}
      {vnrReasons.length > 0 && <StopAlert title="VFR Flight Not Recommended" reasons={vnrReasons} />}
      {underMine.length > 0 && <StopAlert title="Under Your Personal Minimums" reasons={underMine} testId="minimums-alert" />}
      {icing && (
        // Under IFR, in cloud at or above the freezing level.
        <Alert className={cn("mb-2 border-caution/30 bg-caution-wash text-caution-ink", TEXT.prose)} data-testid="icing-alert">
          <TriangleAlert />
          <AlertTitle>Icing possible at {altFt(icing.altitudeFt)} ft</AlertTitle>
          <AlertDescription className={cn("text-caution-ink", TEXT.prose)}>
            <p>
              The freezing level is {icing.atOrBelow ? "at or below" : "at"} {altFt(icing.freezingLevelFt)} ft, with cloud or an icing
              AIRMET forecast along the route
              {icing.reports ? `, and ${icing.reports} pilot report${icing.reports === 1 ? "" : "s"} of icing near it` : ""}. Most light
              airplanes&apos; flight manuals prohibit flight into known icing, and the manual&apos;s limitations bind (14 CFR 91.9(a)): plan
              below the freezing level, or an airplane certified for it.
            </p>
          </AlertDescription>
        </Alert>
      )}
      {!briefing ? (
        <Pending coming={briefingComing}>{briefingPendingMessage}</Pending>
      ) : unchecked("hazards") && unchecked("gairmets") ? (
        <p className="text-caution-ink">
          SIGMET and G-AIRMET data could not be checked: aviationweather.gov did not answer. Verify them separately before flight.
        </p>
      ) : (
        // A row a SIGMET or G-AIRMET, marked with the warning
        // triangle. The G-AIRMETs replaced the text AIRMETs in 2025:
        // the snapshot nearest the departure, one per hazard.
        <ListGroup>
          {briefing.hazards.length + briefing.gairmets.length === 0 && (
            <ListRow media={<FindingIcon finding="ok" />} title="No SIGMETs or G-AIRMETs along the route during the flight" />
          )}
          {briefing.hazards.flatMap((h, i) => [
            <ListRow
              key={`s${i}`}
              media={<FindingIcon finding="caution" />}
              title={`${sigmetHazard(h.hazard, h.type)}${
                hazardAltitudeRange(h.altitude_low_ft, h.altitude_high_ft)
                  ? ` — ${hazardAltitudeRange(h.altitude_low_ft, h.altitude_high_ft)}`
                  : ""
              }`}
              description={h.raw && <span className="font-mono whitespace-pre-wrap">{h.raw}</span>}
              data-testid="sigmet"
            />,
            h.on_route?.legs.length ? (
              <OnRouteRow key={`s${i}-on`} on={h.on_route} briefing={briefing} hazardKey={`sigmet-${i}-${h.raw ?? ""}`} />
            ) : null,
          ])}
          {briefing.gairmets.flatMap((g, i) => [
            <ListRow
              key={`g${i}`}
              media={<FindingIcon finding="caution" />}
              title={gairmetTitle(g)}
              description={[gairmetAltitudes(g), faaWords(g.due_to), g.valid_at && `G-AIRMET for ${clockAndZulu(new Date(g.valid_at))}`]
                .filter(Boolean)
                .join(" · ")}
              data-testid="gairmet"
            />,
            g.on_route?.legs.length ? (
              <OnRouteRow key={`g${i}-on`} on={g.on_route} briefing={briefing} hazardKey={`gairmet-${g.hazard}`} />
            ) : null,
          ])}
          {/* The fields below VFR where the flight meets them: a
                field's report now, a TAF's for when the airplane is
                there (the planner's, app.exposure). */}
          {(briefing.fields_below_vfr ?? []).flatMap((f) => [
            <ListRow
              key={`f${f.ident}${f.source}`}
              media={<FindingIcon finding="caution" />}
              title={`${f.ident} below VFR · ${f.source === "METAR" ? `${f.flight_category ?? "IFR"} now` : "forecast then"}`}
              description={ceilingAndVisibility(f.ceiling_ft, f.visibility_sm).replace(/^./, (c) => c.toUpperCase())}
              data-testid="field-below-vfr"
            />,
            <OnRouteRow key={`f${f.ident}${f.source}-on`} on={f.on_route} briefing={briefing} hazardKey={`field-${f.ident}-${f.source}`} />,
          ])}
        </ListGroup>
      )}
      <ForecastIcingRows vm={vm} legs={legs} />
      {briefing && unchecked("hazards") !== unchecked("gairmets") && (
        <p className={cn("pt-2 text-caution-ink", TEXT.detail)}>
          {unchecked("hazards") ? "SIGMETs" : "G-AIRMETs"} could not be checked — verify separately before flight.
        </p>
      )}
    </AccordionSection>
  );
}

/** The route's winds and temperatures by stretch: consecutive legs that
 *  fly in the same forecast at the same altitude, one row each. The
 *  temperature is what the legs' true airspeeds are worked out from. */
function WindsAloft({ vm, legs, winds }: { vm: FlightBriefing; legs: Leg[]; winds?: Totals["winds"] }) {
  const { stretches } = vm;
  return (
    // Whose winds, under the title as the nav log says it: AWC's the map
    // draws, or the GFS's, modelled (lib/windsAloft).
    <AccordionSection
      title="Winds Aloft"
      description={stretches.some((st) => st.wind) ? (windsSource(winds) ?? WINDS_MODELLED_LABEL) : undefined}
    >
      {!stretches.some((st) => st.wind) ? (
        <p>{legs.length ? "No winds-aloft data available for this route." : "Waiting on the nav log's legs…"}</p>
      ) : (
        // The forecast winds and temperatures each stretch of legs is
        // flown in, at each leg's place and time.
        <ListGroup>
          {stretches.map((st, i) => (
            <ListRow
              key={i}
              title={
                <span className="line-clamp-1">
                  {st.from} → {st.to}
                </span>
              }
              description={feet(st.altitudeFt)}
              value={`${st.wind ? windText(st.wind.dir, st.wind.speed, null, "T") : "no wind data"}${st.oatC === null ? "" : ` · ${st.oatC} °C`}`}
            />
          ))}
        </ListGroup>
      )}
    </AccordionSection>
  );
}

// A red finding with its reasons, red on pale red at 7:1 in both themes:
// VFR not recommended, or under the pilot's own minimums.
function StopAlert({ title, reasons, testId }: { title: string; reasons: readonly string[]; testId?: string }) {
  return (
    <Alert className={cn("mb-2 border-destructive/30 bg-destructive/10 text-destructive-ink", TEXT.prose)} data-testid={testId}>
      <OctagonAlert />
      <AlertTitle>{title}</AlertTitle>
      <ul className="col-start-2 list-disc space-y-0.5 pl-4 [&>li]:first-letter:uppercase">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </Alert>
  );
}
