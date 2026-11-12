import { cn } from "cn";
import { PlaybackToolbar, PlayToggle } from "../../components/PlaybackBar";
import Segmented from "../../components/Segmented";
import { GLASS } from "../../lib/mapChrome";
import { TEXT } from "../../lib/text";
import { lookOf, type ShownField } from "./flowLook";
import { FlowTrack } from "./FlowTrack";
import { hourName, useWeatherFlow, type FlowFrame, type Span } from "./useWeatherFlow";

const DATE = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });
/** The date beside the precipitation's 1h | 12h, short, so it fits a
 *  phone's bar whole: "Thu, Nov 12". */
const SHORT_DATE = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const SPANS: { value: Span; label: string }[] = [
  { value: "1h", label: "1h" },
  { value: "12h", label: "12h" },
];

/** The bar's title, as Apple Weather's map words it: "Wind Speed" over
 *  the wind; over the precipitation "Forecast" for the hours to come and
 *  for the hour past what it is, the radar's where it has its mosaic; any
 *  other field its name. */
function titleOf(field: ShownField, span: Span, frames: FlowFrame[]): string {
  if (field === "wind") return "Wind Speed";
  if (field !== "precip") return lookOf(field).name;
  if (span === "12h") return "Forecast";
  return frames.some((f) => f.past && f.radar_tiles) ? "Radar" : "Past hour";
}

/**
 * The flow layer's timeline, a glass card at the map's foot above the
 * sheet, as Apple Weather's map has its own (the owner's screenshots,
 * 2026-11-12): Play at its left, which steps through the hours once; the
 * title and the hour's day and date on this device's clock, and under them
 * the hour in Zulu as reports give it, "Forecast +4 h" for an hour to come
 * ("Forecast" for one past, "Observed" for the radar's); on
 * the precipitation a segmented 1h | 12h, the hour past or the forecast;
 * and the track (FlowTrack), its hours under it. The same playback parts
 * as the radar loop's (components/PlaybackBar).
 */
export function FlowBar() {
  const flow = useWeatherFlow({ drive: true });
  if (flow.field === "off") return null;
  const name = lookOf(flow.field).name;
  const frame = flow.frame;
  const at = frame ? new Date(frame.valid) : null;
  const status = flow.failed
    ? "Model weather isn't available right now"
    : flow.loading
      ? "Fetching model weather…"
      : !flow.frames.length
        ? "No model weather yet"
        : null;
  // What the hour shown is, so a pilot knows which (the owner, 2026-11-12):
  // the radar's mosaic for an hour past on the precipitation, observed;
  // every other picture a forecast, an hour to come said as how far ahead.
  const observed = flow.field === "precip" && !!frame?.past && !!frame.radar_tiles;
  const ahead = !frame ? null : observed ? "Observed" : frame.past ? "Forecast" : `Forecast ${hourName(flow.frames, flow.shown)}`;
  return (
    <div className="pointer-events-none absolute right-[calc(max(0.5rem,env(safe-area-inset-right))+3.25rem)] bottom-[calc(max(env(safe-area-inset-bottom),var(--map-inset-bottom,0px))+0.75rem)] left-[calc(max(0.5rem,env(safe-area-inset-left))+var(--map-inset-left,0px)+3.25rem)] z-[1000] flex justify-center">
      <PlaybackToolbar
        label={`${name} timeline`}
        onToggle={() => {
          if (flow.steps.length > 1) flow.toggle();
        }}
        className={cn(GLASS, "pointer-events-auto flex w-[min(100%,26rem)] flex-col gap-2 rounded-(--radius-card) px-3 pt-2.5 pb-1.5")}
        data-testid="weather-flow-bar"
      >
        <div className="flex items-center gap-2.5">
          <PlayToggle playing={flow.playing} onToggle={flow.toggle} disabled={flow.steps.length < 2} testId="weather-flow-play" />
          {status ? (
            <span className={cn("min-w-0 flex-1 truncate font-medium", TEXT.detail, flow.failed && "text-destructive-ink")} role="status">
              {status}
            </span>
          ) : (
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cn("truncate font-semibold", TEXT.row)}>{titleOf(flow.field, flow.span, flow.frames)}</span>
              {at && (
                <span className={cn("truncate text-muted-foreground", TEXT.note)}>
                  {(flow.field === "precip" ? SHORT_DATE : DATE).format(at)}
                </span>
              )}
              {frame && (
                <span className={cn("truncate text-muted-foreground tabular-nums", TEXT.caption)} data-testid="weather-flow-time">
                  {frame.valid.slice(11, 13)}
                  {frame.valid.slice(14, 16)}Z{ahead && <span className="font-semibold text-tint"> · {ahead}</span>}
                </span>
              )}
            </span>
          )}
          {flow.field === "precip" && (
            <Segmented
              label="Precipitation span"
              value={flow.span}
              onChange={(v) => flow.pickSpan(v as Span)}
              options={SPANS}
              testId="weather-flow-span"
            />
          )}
        </div>
        {!status && (
          <FlowTrack
            frames={flow.frames}
            steps={flow.steps}
            shown={flow.shown}
            name={name}
            seek={flow.seek}
            onNow={flow.now}
            testIdNow="weather-flow-now"
          />
        )}
      </PlaybackToolbar>
    </div>
  );
}
