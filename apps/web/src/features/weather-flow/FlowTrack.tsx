import { cn } from "cn";
import { keepSliderKeys } from "../../components/playbackKeys";
import { Slider } from "../../components/ui/slider";
import { useIsMobile } from "../../hooks/use-mobile";
import { TEXT } from "../../lib/text";
import { hourName, nowIndex, type FlowFrame } from "./useWeatherFlow";

const HOUR = new Intl.DateTimeFormat("en-US", { hour: "numeric" });

/** A step's place along the track: the thumb's centre at that value, as
 *  the stock Slider lays it with its thumb inside the track's ends
 *  (thumbAlignment "edge", its thumb 16 wide). */
const place = (k: number, n: number) => `calc(0.5rem + ${n > 1 ? k / (n - 1) : 0} * (100% - 1rem))`;

/**
 * The timeline's track, as Apple Weather's map draws it (the owner's
 * screenshots, 2026-11-12): the stock Slider over the hours, filled up to
 * the one shown, a tick for each hour, and under it the hours on this
 * device's clock -- "Now", "8 AM", "10 AM" -- each a button that goes to
 * that hour. The slider keeps its own keys and VoiceOver (the APG slider,
 * Base UI's), and says each hour in Zulu too. On a phone's narrow bar
 * every other hour is labelled, as Apple's labels every second tick.
 */
export function FlowTrack({
  frames,
  steps,
  shown,
  name,
  seek,
  testIdNow,
  onNow,
}: {
  frames: FlowFrame[];
  /** The frames the track runs over, as indices (windowOf). */
  steps: number[];
  shown: number;
  name: string;
  seek: (i: number) => void;
  testIdNow: string;
  onNow: () => void;
}) {
  const phone = useIsMobile();
  const now = nowIndex(frames);
  const at = Math.max(0, steps.indexOf(shown));
  const n = steps.length;
  const stride = phone && steps.filter((i) => i >= now).length > 4 ? 2 : 1;
  const zulu = (i: number) => `${frames[i]!.valid.slice(11, 13)}${frames[i]!.valid.slice(14, 16)}Z`;
  return (
    // eslint-disable-next-line jsx-a11y-x/no-static-element-interactions -- the slider's own keys, caught as they bubble so the toolbar's roving focus does not take them too.
    <div className="flex flex-col gap-1" onKeyDown={keepSliderKeys}>
      <div className="relative">
        <Slider
          min={0}
          max={Math.max(0, n - 1)}
          step={1}
          value={[at]}
          onValueChange={(v) => {
            const k = (Array.isArray(v) ? v[0] : v) ?? 0;
            seek(steps[k] ?? 0);
          }}
          // The track a little heavier and filled in the text's colour, as
          // Apple's is; the thumb's 44-point reach round its 16, a
          // pseudo-element's.
          className="[&_[data-slot=slider-range]]:bg-foreground [&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-track]]:bg-foreground/12"
          thumb={{
            "aria-label": `${name} hour`,
            "aria-valuetext": shown >= 0 ? `${zulu(shown)}, ${hourName(frames, shown)}` : undefined,
            className: "relative after:absolute after:-inset-3.5 after:content-['']",
          }}
          data-testid="weather-flow-scrubber"
        />
        {/* A tick for each hour, over the track and under the thumb. */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {steps.map((i, k) =>
            k === 0 || k === n - 1 ? null : (
              <span
                key={i}
                className={cn("absolute top-1/2 h-1.5 w-px -translate-y-1/2", k <= at ? "bg-background/60" : "bg-foreground/30")}
                style={{ left: place(k, n) }}
              />
            ),
          )}
        </div>
      </div>
      <div className="relative h-5">
        {steps.map((i, k) => {
          if (i < now || (i - now) % stride !== 0) return null;
          const label = i === now ? "Now" : HOUR.format(new Date(frames[i]!.valid));
          return (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              onClick={() => (i === now ? onNow() : seek(i))}
              data-testid={i === now ? testIdNow : undefined}
              className={cn(
                "absolute top-0 -translate-x-1/2 font-semibold whitespace-nowrap outline-none after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']",
                TEXT.caption,
                i === shown ? "text-foreground" : "text-muted-foreground",
              )}
              style={{ left: place(k, n) }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
