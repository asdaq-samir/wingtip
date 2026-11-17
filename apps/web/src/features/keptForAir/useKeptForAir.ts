import type { Course } from "../../lib/api/types";
import { keptRecordStore, keptRoute, readyKept } from "./keptRecord";
import { courseFields } from "../../lib/course";

/** Ready to fly's `kept` for the route on screen: what Keep for the Air
 *  holds of it, read through the record's store so a keep finished draws
 *  the row again. Null where nothing can be kept (no service worker). */
export function useKeptForAir(course: Course | null, alternate: string | null, canKeep: boolean) {
  const record = keptRecordStore()((s) => s.value);
  if (!course || !canKeep) return null;
  const fields = courseFields(course).map((a) => a.ident);
  const route = keptRoute(fields, alternate);
  return readyKept(record?.route === route ? record : null);
}
