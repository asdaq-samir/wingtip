import { TokenFieldValue } from "react-aria-components";

/**
 * The route box's words as React Aria's TokenField holds them: each point
 * of the route a token, its ident its text and its place in the route its
 * value, and what the pilot is typing a run of text among them, where the
 * caret was put. The
 * points are the route's (RouteBox's props); the tokens only say them,
 * and the box turns a change to them back into a change of the route.
 */
export type RouteValue = TokenFieldValue<number>;
type Segment = RouteValue["segments"][number];
type Position = RouteValue["caretPosition"];

const START: Position = { index: 0, offset: 0 };

/** Where a value ends, after its last segment. */
function endOf(value: RouteValue): Position {
  return { index: value.segments.length, offset: 0 };
}

/** The place before point `at`, or (null, or past the last) after the last. */
function placeOf(segments: readonly Segment[], at: number | null): number {
  if (at === null) return segments.length;
  let seen = 0;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i]!.type !== "token") continue;
    if (seen === at) return i;
    seen++;
  }
  return segments.length;
}

/**
 * The points as tokens, what is typed before point `at` (null: after the
 * last), the caret after it. From a value the field had, the new one
 * follows it in the field's own undo history, so Undo goes back to it --
 * or, `coalesce`d, takes its place there, as the end of the same edit
 * (one Undo then goes back past both).
 */
export function routeValue(points: string[], typed = "", at: number | null = null, from?: RouteValue, coalesce = false): RouteValue {
  const tokens: Segment[] = points.map((p, i) => ({ type: "token", text: p, value: i }));
  const where = at === null ? tokens.length : Math.min(Math.max(at, 0), tokens.length);
  const segments: Segment[] = typed ? [...tokens.slice(0, where), { type: "text", text: typed }, ...tokens.slice(where)] : tokens;
  const caret = { index: where, offset: typed.length };
  const value = from ? from.replaceRangeWithSegments(START, endOf(from), segments, coalesce) : new TokenFieldValue<number>(segments);
  return value.withCaretPosition(caret);
}

/** The points the tokens say, in order. */
export function tokensOf(value: RouteValue): string[] {
  return value.segments.filter((s) => s.type === "token").map((s) => s.text);
}

/** How many points are before a place in the value. */
function pointsBefore(value: RouteValue, pos: Position): number {
  const before = value.segments.slice(0, pos.index).filter((s) => s.type === "token").length;
  return before + (value.segments[pos.index]?.type === "token" && pos.offset > 0 ? 1 : 0);
}

/** A count of points before a place as the box says it: null after the last. */
function placeAt(value: RouteValue, before: number): number | null {
  return before >= tokensOf(value).length ? null : before;
}

/**
 * What is typed and where: every run of text among the points, joined
 * (typed in two places before either went in, it goes in together at the
 * first), and before which point it is -- null after the last. With
 * nothing typed, where the caret is.
 */
export function typedOf(value: RouteValue): { text: string; at: number | null } {
  const first = value.segments.findIndex((s) => s.type === "text");
  if (first < 0) return { text: "", at: placeAt(value, pointsBefore(value, value.caretPosition)) };
  const text = value.segments
    .filter((s) => s.type === "text")
    .map((s) => s.text)
    .join(" ");
  return { text, at: placeAt(value, pointsBefore(value, { index: first, offset: 0 })) };
}

/**
 * Words ended by a space or a comma, as a flight plan's route is typed
 * ("KMSP BAEE1 BAE"): the words, before which point they were typed (null
 * after the last), and the value without them, the unfinished word after
 * the last space kept where it was. Null where no word has been ended.
 */
export function endedWords(value: RouteValue): { words: string[]; at: number | null; rest: RouteValue } | null {
  const index = value.segments.findIndex((s) => s.type === "text" && /[\s,]/.test(s.text));
  if (index < 0) return null;
  const parts = value.segments[index]!.text.split(/[\s,]+/);
  const unfinished = parts.pop() ?? "";
  const words = parts.filter(Boolean);
  const at = placeAt(value, pointsBefore(value, { index, offset: 0 }));
  return { words, at, rest: routeValue(tokensOf(value), unfinished, at, value) };
}

/**
 * Everything typed, taken out to go in: its words, before which point
 * (null after the last), and the value with nothing typed. Null where
 * nothing is typed, so what was taken once is never taken again.
 */
export function takeTyped(value: RouteValue): { words: string[]; at: number | null; rest: RouteValue } | null {
  const typed = typedOf(value);
  if (!typed.text.trim()) return null;
  return { words: typed.text.split(/[\s,]+/).filter(Boolean), at: typed.at, rest: routeValue(tokensOf(value), "", typed.at, value) };
}

/** The one point taken out of `points` to leave `list`, or null where the
 *  two differ in another way (moved, added, more than one gone). */
export function removedPoint(points: string[], list: string[]): number | null {
  if (list.length !== points.length - 1) return null;
  const i = points.findIndex((p, j) => p !== list[j]);
  const at = i < 0 ? points.length - 1 : i;
  return points.every((p, j) => j === at || p === list[j < at ? j : j - 1]) ? at : null;
}

/** Whether two lists of points are the same, in the same order. */
export function samePoints(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((p, i) => p === b[i]);
}

/** The place before point `at` (null: after the last), as a caret. */
export function caretBefore(value: RouteValue, at: number | null): Position {
  return { index: placeOf(value.segments, at), offset: 0 };
}
