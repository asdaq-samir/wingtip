import { Plane } from "lucide-react";
import { useId } from "react";
import { cn } from "cn";
import type { AircraftKind } from "../lib/aircraftKind";
import { Mark, SmallMark } from "./Favorites";

// The airplanes' marks, apart from the airports' (Favorites): drawn only
// in the Aircraft tab and its lists, which wait for the tab to be opened,
// so their shapes are not in the first load (scripts/first-load.mjs).

/** An airplane's mark, in a row (`small`, the Mark's 32) or a strip's tile
 *  (SmallMark's 56): the Favorites' sky disc with a white airplane, turned
 *  to its track where it is heard, red in an emergency -- one mark for
 *  every list of airplanes, where the heard ones were a grey disc with a
 *  sky airplane and Recents and the found ones a bare grey airplane (the
 *  owner, 2026-10-28: "How come nearest airports and aircraft icons look
 *  different than favorites"). */
export function PlaneMark({
  trackDeg,
  emergency = false,
  small = false,
  kind,
}: {
  trackDeg?: number | null;
  emergency?: boolean;
  small?: boolean;
  /** A kept airplane's shape (lib/aircraftKind), nose up; the ones heard,
   *  turned to their track, keep lucide's airplane as the map's traffic
   *  does (the owner: "Keep traffic as is", 2026-11-04). */
  kind?: AircraftKind;
}) {
  const fill = emergency ? "bg-destructive text-white" : "bg-(--badge-airplane) text-white";
  if (kind) {
    // The shapes fill their square, so drawn larger than a glyph: 34 in
    // the tile's 56, 22 in the row's 32.
    const icon = <KindGlyph kind={kind} />;
    return small ? (
      <Mark icon={icon} className={cn(fill, "[&_svg]:size-[22px]")} />
    ) : (
      <SmallMark icon={icon} className={cn(fill, "[&_svg]:size-[34px]")} />
    );
  }
  // lucide's airplane points north-east: turned to its track.
  const icon = <Plane fill="currentColor" style={trackDeg != null ? { transform: `rotate(${trackDeg - 45}deg)` } : undefined} />;
  return small ? <Mark icon={icon} className={fill} /> : <SmallMark icon={icon} className={fill} />;
}

/** An airplane's shape alone, sized by its container's svg rule. */
function KindGlyph({ kind }: { kind: AircraftKind }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <KindShapes kind={kind} strokeWidth={1.5} />
    </svg>
  );
}

/**
 * The seven shapes, seen from above, nose up, on a 64 square, from the
 * owner's sheet of designs (2026-11-04): high wing, low wing (tapered,
 * its canopy cut out), twin, jet, helicopter, glider, and a balloon from
 * the side, as from above it would be a disc. In currentColor, outlined
 * a little so they hold at a row's size.
 */
function KindShapes({ kind, strokeWidth }: { kind: AircraftKind; strokeWidth: number }) {
  const cut = useId();
  const paint = { fill: "currentColor", stroke: "currentColor", strokeWidth, strokeLinejoin: "round" as const };
  switch (kind) {
    case "high":
      return (
        <g {...paint}>
          <path d="M32 12C34.2 12 35 14.5 35 18L34.2 44 33 51H31L29.8 44 29 18C29 14.5 29.8 12 32 12Z" />
          <rect x="9" y="23" width="46" height="6.5" rx="3" />
          <rect x="23" y="45" width="18" height="4.5" rx="2.2" />
        </g>
      );
    case "low":
      return (
        <>
          <mask id={cut}>
            <rect width="64" height="64" fill="#fff" />
            <ellipse cx="32" cy="20.5" rx="1.9" ry="3.6" fill="#000" />
          </mask>
          <g {...paint} mask={`url(#${cut})`}>
            <path d="M32 12C34.2 12 35 14.5 35 18L34.2 44 33 51H31L29.8 44 29 18C29 14.5 29.8 12 32 12Z" />
            <path d="M30 26 9.5 28C8 28.2 7.5 29 7.5 30.2S8 32.2 9.5 32.2L30 34.5Z" />
            <path d="M34 26 54.5 28C56 28.2 56.5 29 56.5 30.2S56 32.2 54.5 32.2L34 34.5Z" />
            <rect x="24" y="46" width="16" height="4.5" rx="2.2" />
          </g>
        </>
      );
    case "twin":
      return (
        <>
          <mask id={cut}>
            <rect width="64" height="64" fill="#fff" />
            <ellipse cx="32" cy="19" rx="1.9" ry="3.4" fill="#000" />
          </mask>
          <g {...paint} mask={`url(#${cut})`}>
            <path d="M32 11C34.2 11 35 13.5 35 17L34.2 45 33 52H31L29.8 45 29 17C29 13.5 29.8 11 32 11Z" />
            <path d="M30 25 7.5 27.5C6 27.7 5.5 28.5 5.5 29.7S6 31.7 7.5 31.7L30 34Z" />
            <path d="M34 25 56.5 27.5C58 27.7 58.5 28.5 58.5 29.7S58 31.7 56.5 31.7L34 34Z" />
            <rect x="16" y="17.5" width="5.6" height="19" rx="2.8" />
            <rect x="42.4" y="17.5" width="5.6" height="19" rx="2.8" />
            <rect x="22.5" y="47" width="19" height="4.5" rx="2.2" />
          </g>
        </>
      );
    case "jet":
      return (
        <g {...paint}>
          <path d="M32 5C34.3 5 35.5 9 35.5 15V46L33 56H31L28.5 46V15C28.5 9 29.7 5 32 5Z" />
          <path d="M29 24 7 37V40.5L29 34Z" />
          <path d="M35 24 57 37V40.5L35 34Z" />
          <rect x="23" y="39" width="4.6" height="9.5" rx="2.2" />
          <rect x="36.4" y="39" width="4.6" height="9.5" rx="2.2" />
          <path d="M32 49 21 55.5V58L32 55.5 43 58V55.5Z" />
        </g>
      );
    case "helicopter":
      return (
        <g {...paint}>
          <ellipse cx="32" cy="29" rx="6.5" ry="9.5" />
          <rect x="30.8" y="35" width="2.4" height="21" rx="1.2" />
          <rect x="26.5" y="47" width="11" height="2.6" rx="1.3" />
          <rect x="33.2" y="51" width="5" height="2.2" rx="1.1" />
          <rect x="5" y="26.7" width="54" height="2.6" rx="1.3" transform="rotate(32 32 28)" />
          <rect x="5" y="26.7" width="54" height="2.6" rx="1.3" transform="rotate(-32 32 28)" />
        </g>
      );
    case "glider":
      return (
        <g {...paint}>
          <path d="M32 13C33.6 13 34.2 15.5 34.2 19L33.4 47 32.6 56H31.4L30.6 47 29.8 19C29.8 15.5 30.4 13 32 13Z" />
          <path d="M30.5 24 3.5 25.8C2.4 25.9 2 26.4 2 27.2S2.4 28.5 3.5 28.5L30.5 29.5Z" />
          <path d="M33.5 24 60.5 25.8C61.6 25.9 62 26.4 62 27.2S61.6 28.5 60.5 28.5L33.5 29.5Z" />
          <rect x="25.5" y="53" width="13" height="3.2" rx="1.6" />
        </g>
      );
    case "balloon":
      return (
        <>
          <mask id={cut}>
            <rect width="64" height="64" fill="#fff" />
            <path d="M32 8V46M24 10C21 20 23 36 28.5 46M40 10C43 20 41 36 35.5 46" fill="none" stroke="#000" strokeWidth={1.8} />
          </mask>
          <g {...paint}>
            <path
              d="M32 7C44 7 50.5 15 50.5 24.5 50.5 34 42 40 37.5 46.5H26.5C22 40 13.5 34 13.5 24.5 13.5 15 20 7 32 7Z"
              mask={`url(#${cut})`}
            />
            <path d="M27.5 47 29.5 51M36.5 47 34.5 51" fill="none" />
            <rect x="28.5" y="51" width="7" height="6" rx="1.2" />
          </g>
        </>
      );
  }
}

/**
 * The pilot's own airplane's glyph: the app icon in miniature, its
 * airplane seen from above in the dashed airspace ring -- the owner's
 * pick ("I like 3 for my plane", 2026-11-04, beside the icon's A), for
 * the Airplane tile that is to airplanes what Home is to airports; the
 * airplane in it the pilot's own one's shape (lib/aircraftKind). Drawn in
 * currentColor and sized by its container's svg rule, as a lucide glyph
 * is; the ring needs more room than a glyph, so its marks size it up
 * (PLANE_TILE, PLANE_ROW).
 */
export function HomePlane({ kind = "high" }: { kind?: AircraftKind }) {
  return (
    <svg viewBox="6 6 52 52" aria-hidden="true">
      {/* Twelve dashes, as the icon's ring: 2 pi 22 is 138.2, eleven and
          a half a dash. */}
      <circle
        cx="32"
        cy="32"
        r="22"
        fill="none"
        stroke="currentColor"
        strokeWidth={3.6}
        strokeDasharray="8 3.52"
        transform="rotate(-100.4 32 32)"
      />
      <g transform="translate(32 32) scale(0.6) translate(-32 -32)">
        <KindShapes kind={kind} strokeWidth={2} />
      </g>
    </svg>
  );
}

/** HomePlane's sizes: 40 in a strip tile's 56, 24 in a row's 32. */
export const PLANE_TILE = "bg-(--badge-home) text-white [&_svg]:size-10";
export const PLANE_ROW = "bg-(--badge-home) text-white [&_svg]:size-6";
