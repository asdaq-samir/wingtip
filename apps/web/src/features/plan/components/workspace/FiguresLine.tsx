import { figuresLine } from "../../figures";

/** The Nav Log card's totals line, worked out by the engine (figures.ts'
 *  strip_fuel) only once it is in: the card is kept drawn from the page's
 *  first paint (keepMounted), before the .wasm, and asking it then threw
 *  "The engine is not loaded yet" -- "Part of the app didn't load" on the
 *  owner's iPhone, 2026-11-11. */
export default function FiguresLine({ input }: { input: Parameters<typeof figuresLine>[0] }) {
  return <>{figuresLine(input)}</>;
}
