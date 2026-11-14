/** The address's stops are these, in this order ("C81,KRYV"; a user point
 *  "VPBNG/280/20"), whether the browser wrote the commas and slashes as
 *  they are or escaped (%2C, %2F): the one test of the `stops` parameter
 *  every spec makes. */
export function stopsAre(stops: string): RegExp {
  const each = stops
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll(",", "(%2C|,)")
    .replaceAll("/", "(%2F|\\/)");
  return new RegExp(`[?&]stops=${each}(&|$)`);
}
