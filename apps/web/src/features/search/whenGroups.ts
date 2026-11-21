/** The routes by when they were planned, newest first, as Maps' Recents
 *  head them: since midnight, the last seven days, the last thirty, and
 *  before; a heading with nothing under it is left out. The days are the
 *  calendar's, counted by Date's own calendar (a day of the month past its
 *  start rolls back into the month before), where midnight less six times
 *  24 hours was an hour off across a change of clocks, and a route planned
 *  in the hour either side of that midnight went under the wrong heading. */
export function whenGroups<T extends { at: number }>(routes: T[], now: number): { title: string; routes: T[] }[] {
  const today = new Date(now);
  const midnight = (daysBack: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysBack).getTime();
  const bounds: [string, number][] = [
    ["Today", midnight(0)],
    ["This Week", midnight(6)],
    ["This Month", midnight(29)],
    ["Earlier", -Infinity],
  ];
  return bounds
    .map(([title, from], i) => ({ title, routes: routes.filter((r) => r.at >= from && (i === 0 || r.at < bounds[i - 1]![1])) }))
    .filter((g) => g.routes.length > 0);
}
