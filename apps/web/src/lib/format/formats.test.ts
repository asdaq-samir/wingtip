import { describe, expect, it } from "vitest";
import formats from "../fixtures/formats.json";
import {
  bearing,
  duration,
  feet,
  feetRange,
  flightLevel,
  gal,
  hm,
  knots,
  magneticVariation,
  mapLevel,
  nm,
  pounds,
  spokenAltitude,
  spokenDistance,
  spokenDuration,
  spokenFuel,
  spokenHeading,
  spokenHeadingMagnetic,
  spokenHeadingTrue,
  spokenSpeed,
  spokenZulu,
  windCorrection,
  zuluTime,
} from ".";

/**
 * Every figure format, held to the shared example table design/tokens.json
 * makes (scripts/build/design-tokens.sh writes lib/fixtures/formats.json):
 * the phones' formatters test against the same table, so a figure reads
 * the same on each app. A format added to the tokens with no formatter
 * here fails, as does a formatter that writes a figure another way.
 */
type Input = number | null | number[] | string;
const n = (x: Input) => x as number;
const FORMATTERS: Record<string, (x: Input) => string> = {
  cruiseAltitude: (x) => flightLevel(x as number | null),
  mapLevel: (x) => mapLevel(n(x)),
  altitude: (x) => feet(x as number | null),
  altitudeRange: (x) => feetRange(x as number[]),
  duration: (x) => duration(n(x)),
  navLogTime: (x) => hm(n(x)),
  zulu: (x) => zuluTime(new Date(x as string)),
  heading: (x) => bearing(n(x)),
  distance: (x) => nm(x as number | null),
  speed: (x) => knots(x as number | null),
  fuel: (x) => gal(x as number | null),
  weight: (x) => pounds(n(x)),
  windCorrection: (x) => windCorrection(n(x)),
  variation: (x) => magneticVariation(n(x)),
  spokenAltitude: (x) => spokenAltitude(x as number | null),
  spokenHeading: (x) => spokenHeading(n(x)),
  spokenHeadingMagnetic: (x) => spokenHeadingMagnetic(n(x)),
  spokenHeadingTrue: (x) => spokenHeadingTrue(n(x)),
  spokenDistance: (x) => spokenDistance(x as number | null),
  spokenSpeed: (x) => spokenSpeed(x as number | null),
  spokenFuel: (x) => spokenFuel(x as number | null),
  spokenDuration: (x) => spokenDuration(n(x)),
  spokenZulu: (x) => spokenZulu(new Date(x as string)),
};

const table = Object.entries(formats).filter(([name]) => !name.startsWith("$")) as [
  string,
  { examples: { input: Input; written: string }[] },
][];

describe("figures are written as the shared format table has them", () => {
  it("has a formatter for every format in the table", () => {
    expect(table.map(([name]) => name).sort()).toEqual(Object.keys(FORMATTERS).sort());
  });

  for (const [name, { examples }] of table) {
    it.each(examples.map((e) => [JSON.stringify(e.input), e.written, e.input] as const))(
      `${name}: %s is written %s`,
      (_, written, input) => {
        expect(FORMATTERS[name]!(input)).toBe(written);
      },
    );
  }
});
