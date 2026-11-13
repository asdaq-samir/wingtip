import type { ReactNode } from "react";
import PlaceAge from "./PlaceAge";
import { Cloud, CloudSun, Eye, Gauge, Thermometer, Wind } from "lucide-react";
import { ListGroup, ListRow } from "../../../../components/GroupedList";
import { RefreshNow } from "../../../../components/RefreshButton";
import { RowBadge } from "../../../../components/RowBadge";
import type { AirportPlace } from "../../../../lib/api/types";
import { ago, zuluTime } from "../../../../lib/format";
import { compassPoint } from "../../../../lib/compass";
import type { Hour } from "../../lib/hourly";
import { BADGE } from "../../../../lib/rowBadges";
import { TEXT } from "../../../../lib/text";
import { feet, miles } from "../../../../lib/format";
import { windLine } from "../../format";
import { AtisRows } from "../AtisRows";
import { HourlyForecast } from "../HourlyForecast";
import { DigitalAtisRows } from "../LiveAirportRows";

/** A time as reports give it: "1255Z". */
function zuluOf(at: string): string {
  const when = new Date(at);
  return Number.isNaN(when.getTime()) ? "" : zuluTime(when);
}

/** When the report was made: "1255Z · 14m ago". */
function observedLine(at: string): string {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return "";
  return `${zuluOf(at)} · ${ago(Date.now() - when.getTime())}`;
}

/**
 * An airport's card's Weather tab (PlaceCard): the weather there hour by
 * hour (G1) over the reports as sent -- its own, else the weather modelled
 * at it and the nearest station's -- and its ATIS, heard or sent; its
 * first row ends in the card's Refresh.
 */
export function PlaceWeatherTab({
  ident,
  place,
  known,
  chip,
  hourly,
  weatherLine,
  weatherAge,
  arrival,
}: {
  /** The ident the card was opened on. */
  ident: string;
  place: AirportPlace | undefined;
  /** What the map knew of it before its answer came. */
  known: unknown;
  /** Its category's chip, in the FAA's colour (PlaceCard). */
  chip: ReactNode;
  /** Hour by hour, and a sentence of what the hours say (features/plan/lib/hourly). */
  hourly: { hours: Hour[]; sentence: string | null };
  /** The weather in a line where there is no forecast to say. */
  weatherLine: string;
  /** How old its report is. */
  weatherAge: string | null;
  /** The planned flight's landing hour, where this is its destination. */
  arrival: { index: number; at: number } | null;
}) {
  const metar = place?.metar ?? null;
  // The nearest station's within 30 nm, for one with no report of its own
  // (wingtip.weather.nearest_report), and its category.
  const nearby = place && !metar ? (place.nearby_metar ?? null) : null;
  const nearbyCategory = nearby?.metar.flight_category ?? null;
  const modelled = place && !metar ? (place.modelled_weather ?? null) : null;
  return (
    <>
      <PlaceAge ident={ident} kind="weather" />
      {/* The weather's card at the top of its tab, as Apple's Weather
          has its hourly one: its category in the FAA's colour, the
          forecast in a sentence and the report's age over a hairline,
          the hours under it; the reports as sent right under it, so
          the sentence is not a button. With no report or forecast of
          its own, what there is said in the sentence's place: the
          model's, the nearest station's. */}
      {(place || known) && (
        <ListGroup>
          <ListRow
            media={chip || undefined}
            title={
              <span className={TEXT.prose} data-testid="place-forecast-sentence">
                {place ? (hourly.sentence ?? weatherLine) : "…"}
              </span>
            }
            value={weatherAge ?? undefined}
            data-testid="place-weather-summary"
          >
            {/* Refresh at the row's right, after the report's age: what
                the card shows asked again now (the owner, 2026-11-11,
                "refresh can go in the weather tab itself"). */}
            {place && <RefreshNow card="airport" label={`Refresh ${place.ident}`} className="size-8" />}
          </ListRow>
          {place && hourly.hours.length > 0 && (
            <div className="min-w-0">
              <HourlyForecast hours={hourly.hours} arrival={arrival} />
            </div>
          )}
        </ListGroup>
      )}
      {place && (
        <div className="pt-5" data-testid="place-weather">
          <ListGroup>
            {metar ? (
              <>
                {/* When it was observed, first: a report's age is what a
                    pilot weighs it by (and where it came from, where it is
                    own ship's receiver). Its wind is true, as reported. */}
                {metar.observed_at && (
                  <ListRow
                    title="Observed"
                    data-testid="place-observed"
                    value={<span className="text-foreground">{observedLine(metar.observed_at)}</span>}
                  />
                )}
                {/* Each figure with its glyph, its value at the right in
                    the text's own colour; the report as it was sent
                    under them. */}
                {metar.wind_speed_kt != null && (
                  <ListRow
                    media={
                      <RowBadge colour={BADGE.weather}>
                        <Wind />
                      </RowBadge>
                    }
                    title="Wind"
                    value={<span className="font-semibold text-foreground">{windLine(metar)}</span>}
                    data-testid="place-wind"
                  />
                )}
                <ListRow
                  media={
                    <RowBadge colour={BADGE.weather}>
                      <Eye />
                    </RowBadge>
                  }
                  title="Visibility"
                  value={<span className="font-semibold text-foreground">{miles(metar.visibility_sm)}</span>}
                />
                <ListRow
                  media={
                    <RowBadge colour={BADGE.weather}>
                      <Cloud />
                    </RowBadge>
                  }
                  title="Ceiling"
                  value={
                    <span className="font-semibold text-foreground">{metar.ceiling_ft == null ? "None" : feet(metar.ceiling_ft)}</span>
                  }
                />
                {metar.temp_c != null && (
                  <ListRow
                    media={
                      <RowBadge colour={BADGE.weather}>
                        <Thermometer />
                      </RowBadge>
                    }
                    title="Temperature"
                    description={metar.dewpoint_c != null ? `Dew point ${Math.round(metar.dewpoint_c)} °C` : undefined}
                    value={<span className="font-semibold text-foreground">{Math.round(metar.temp_c)} °C</span>}
                  />
                )}
                {metar.altimeter_in_hg != null && (
                  <ListRow
                    media={
                      <RowBadge colour={BADGE.weather}>
                        <Gauge />
                      </RowBadge>
                    }
                    title="Altimeter"
                    value={<span className="font-semibold text-foreground">{metar.altimeter_in_hg.toFixed(2)} inHg</span>}
                  />
                )}
                <ListRow title={<span className="font-mono break-words">{metar.raw}</span>} />
              </>
            ) : (
              <ListRow
                title={
                  place.weather_unavailable ? "The weather service could not be reached" : "No weather station reports from this field"
                }
              />
            )}
          </ListGroup>
          {/* For one with no report of its own, the weather modelled at
              it for the hour (wingtip.glmp): its category -- the card's "≈"
              badge -- ceiling and visibility, and that it is a model's. */}
          {modelled && (
            <div className="pt-5" data-testid="place-modelled-weather">
              {/* The National Weather Service's Gridded LAMP: planning
                  guidance from a model, not an observation. */}
              <ListGroup title={`Modelled for ${zuluOf(modelled.valid_at)}`}>
                <ListRow
                  media={
                    <RowBadge colour={BADGE.weather}>
                      <CloudSun />
                    </RowBadge>
                  }
                  title="Flight category"
                  value={<span className="font-semibold text-foreground">{modelled.flight_category}</span>}
                />
                <ListRow
                  media={
                    <RowBadge colour={BADGE.weather}>
                      <Eye />
                    </RowBadge>
                  }
                  title="Visibility"
                  // GLMP's most is 10 sm, as a METAR's "10SM" is.
                  value={
                    <span className="font-semibold text-foreground">
                      {modelled.visibility_sm >= 10 ? "10+ sm" : miles(modelled.visibility_sm)}
                    </span>
                  }
                />
                <ListRow
                  media={
                    <RowBadge colour={BADGE.weather}>
                      <Cloud />
                    </RowBadge>
                  }
                  title="Ceiling"
                  value={
                    <span className="font-semibold text-foreground">
                      {modelled.ceiling_ft == null ? "None" : feet(modelled.ceiling_ft)}
                    </span>
                  }
                />
              </ListGroup>
            </div>
          )}
          {/* Its nearest station's, for one with none of its own: where
              it is from it, its category and the report as sent -- the
              card's "≈" badge where nothing is modelled. */}
          {nearby && (
            <div className="pt-5" data-testid="place-nearby-metar">
              <ListGroup title={`Nearest report, ${nearby.distance_nm} nm ${compassPoint(nearby.bearing_deg)}`}>
                <ListRow
                  title={<span className="font-semibold">{nearby.ident}</span>}
                  description={nearby.metar.observed_at ? observedLine(nearby.metar.observed_at) : undefined}
                  value={nearbyCategory ? <span className="font-semibold text-foreground">{nearbyCategory}</span> : undefined}
                />
                {nearby.metar.raw && <ListRow title={<span className="font-mono break-words">{nearby.metar.raw}</span>} />}
              </ListGroup>
            </div>
          )}
        </div>
      )}
      {/* Listen to ATIS: one broadcast heard and read by the engine,
          the runway in use and the altimeter in one line (AtisRows). */}
      {place && <AtisRows key={ident} />}
      {/* The tower's D-ATIS, where it sends one on SWIM. */}
      {place && <DigitalAtisRows ident={place.ident} />}
    </>
  );
}
