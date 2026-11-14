import { PlaneLanding, PlaneTakeoff, Route } from "lucide-react";
import { PillSection } from "../../../../components/Favorites";
import { FirstFew } from "../../../../components/FirstFew";
import { ListGroup, ListRow } from "../../../../components/GroupedList";
import { ChartBadge, RowBadge } from "../../../../components/RowBadge";
import type { AirportPlace, TerminalChart } from "../../../../lib/api/types";
import { BADGE } from "../../../../lib/rowBadges";
import { ChartRow } from "../AirportDiagram";
import { PublicationRows } from "../PublicationRows";
import { NotamBadge } from "./NotamBadge";
import { useNotamMarks, type NotamMark } from "./notamBadges";

/** The field's charts in the d-TPP under the Charts tab, by what they are for:
 *  the FAA's chart codes (wingtip.publications). The airport's own -- its hot
 *  spots, land and hold short -- go with its diagram. */
const CHART_GROUPS: { title: string; kinds: string[] }[] = [
  { title: "Approaches", kinds: ["IAP"] },
  { title: "Departures", kinds: ["DP", "ODP"] },
  { title: "Arrivals", kinds: ["STR"] },
  { title: "Minimums", kinds: ["MIN"] },
];
const AIRPORT_CHARTS = ["HOT", "LAH"];
const GROUPED = new Set(["APD", ...AIRPORT_CHARTS, ...CHART_GROUPS.flatMap((g) => g.kinds)]);

/** A chart's row: its title in sentence case with its codes kept, "ILS or
 *  LOC rwy 24", "LEGOZ four (RNAV)" (lib/advisories faaWords) -- the plate
 *  card's own words (features/plates plateTitle), so one approach is not
 *  written two ways (the web audit's WEB-11; CLAUDE.md's Writing). Shown
 *  in the app, full screen (ChartRow), the viewer titled the same, not on
 *  the FAA's site. */
function TerminalChartRow({ chart, airport, notam }: { chart: TerminalChart; airport: string; notam?: NotamMark }) {
  // A procedure's badge says which kind it is, as its group's title does:
  // an approach's a landing airplane, a departure's one taking off, an
  // arrival's a route; the rest a chart's.
  const badge =
    chart.kind === "IAP" ? (
      <RowBadge colour={BADGE.approach}>
        <PlaneLanding />
      </RowBadge>
    ) : chart.kind === "DP" || chart.kind === "ODP" ? (
      <RowBadge colour={BADGE.approach}>
        <PlaneTakeoff />
      </RowBadge>
    ) : chart.kind === "STR" ? (
      <RowBadge colour={BADGE.approach}>
        <Route />
      </RowBadge>
    ) : (
      <ChartBadge />
    );
  // A NOTAM on the procedure ("Out of service", "Not authorized") by its
  // title, in the row, whose tap stays the plate's: the NOTAM is the Info
  // tab's, a badge here cannot be a button inside the row's.
  return (
    <ChartRow
      media={badge}
      title={faaWords(chart.name)}
      url={chart.url}
      airport={airport}
      testId="terminal-chart"
      badge={notam && <NotamBadge mark={notam} kind="approach" />}
    />
  );
}

/**
 * An airport's card's Charts tab (PlaceCard): its own -- the FAA's diagram
 * or the card's sketch, its Chart Supplement page, its hot spots -- then
 * the approaches, departures, arrivals and minimums in this cycle's d-TPP.
 */
export function PlaceChartsTab({
  place,
  sketched,
  startOn,
}: {
  place: AirportPlace;
  /** Its runways can be sketched (features/plan/lib/runwaySketch). */
  sketched: boolean;
  /** Opened on its approaches (the route's Approaches). */
  startOn?: "approaches";
}) {
  // None from a planner older than the list (a card kept by the worker,
  // a deploy under way), not a page that fails.
  const procedures = place.procedures ?? [];
  const marks = useNotamMarks(place.ident, place);
  return (
    <div data-testid="place-charts">
      <PillSection title="Airport">
        <ListGroup>
          {!place.airport_diagram_url && !place.airport_diagram_cycle && !sketched && (
            // Drawn by the FAA for the fields with a tower or a busy
            // ramp; most small fields have none, and are sketched.
            <ListRow muted title="The FAA publishes no airport diagram for this field" />
          )}
          <PublicationRows
            ident={place.ident}
            diagram={place.airport_diagram_url}
            diagramCycle={place.airport_diagram_cycle}
            supplement={place.chart_supplement_url}
            sketch={sketched ? { runways: place.runways, lat: place.lat, lon: place.lon } : null}
          />
          {procedures
            .filter((c) => AIRPORT_CHARTS.includes(c.kind))
            .map((c) => (
              <TerminalChartRow key={c.url} chart={c} airport={place.ident} />
            ))}
        </ListGroup>
      </PillSection>
      {/* The approaches, departures, arrivals and minimums in this
          cycle's d-TPP, at the pilot's ask, as the FAA's PDFs. */}
      {[...CHART_GROUPS, { title: "Other", kinds: procedures.map((c) => c.kind).filter((k) => !GROUPED.has(k)) }].map((g) => {
        const charts = procedures.filter((c) => g.kinds.includes(c.kind));
        return (
          charts.length > 0 && (
            <div key={`${place.ident}-${g.title}`} data-chart-group={g.title} className="scroll-mt-16 pt-5">
              {/* The first three, the title the rest (FirstFew); all
                the approaches where the route's Approaches opened
                the card on them. */}
              <FirstFew
                title={g.title}
                open={startOn === "approaches" && g.title === "Approaches"}
                rows={charts.map((c) => (
                  <TerminalChartRow key={c.url} chart={c} airport={place.ident} notam={marks.approach.get(c.url)} />
                ))}
              />
            </div>
          )
        );
      })}
    </div>
  );
}
