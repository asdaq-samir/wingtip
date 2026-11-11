/** The Drawer's curve, cubic-bezier(0.32, 0.72, 0, 1), as a function of
 *  time for the map's own eases (MapLibre takes `easing(t)`), so the map
 *  and the sheet move on one curve. Solved for x by Newton's method, then
 *  bisection where that stalls, as browsers solve a CSS cubic-bezier. */
export function drawerEasing(t: number): number {
  const [x1, y1, x2, y2] = [0.32, 0.72, 0, 1];
  const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
  const slope = (a: number, b: number, s: number) => 3 * a * (1 - s) ** 2 + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s ** 2;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let s = t;
  for (let i = 0; i < 8; i++) {
    const dx = at(x1, x2, s) - t;
    const d = slope(x1, x2, s);
    if (Math.abs(dx) < 1e-6) return at(y1, y2, s);
    if (Math.abs(d) < 1e-6) break;
    s -= dx / d;
  }
  let lo = 0,
    hi = 1;
  s = t;
  for (let i = 0; i < 30 && hi - lo > 1e-6; i++) {
    if (at(x1, x2, s) < t) lo = s;
    else hi = s;
    s = (lo + hi) / 2;
  }
  return at(y1, y2, s);
}
