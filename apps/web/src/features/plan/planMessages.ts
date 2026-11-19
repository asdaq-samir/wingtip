/* The plan's small helpers over its queries' answers (usePlan). */

/** Whether a briefing's query key ("briefing", dep, dest, via, …) is for
 *  this route. */
export function sameRoute(key: readonly unknown[], route: [string, string, string]): boolean {
  return route.every((part, i) => key[i + 1] === part);
}

export function stripType<T extends { type: string }>(message: T): Omit<T, "type"> {
  const { type: _type, ...rest } = message;
  return rest;
}
