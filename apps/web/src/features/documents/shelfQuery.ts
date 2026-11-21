import { queryOptions } from "@tanstack/react-query";
import { api } from "../../lib/api/client";

/** The library's shelf, the planner's: new editions come a few times a
 *  year, so it is asked again at most each hour, and silently, as a cite's
 *  link waits on it and says nothing where it cannot be had. On a file of
 *  its own, so a cite's link (Cited) carries nothing of the device's store. */
export const libraryQuery = queryOptions({ queryKey: ["library"], queryFn: api.library, staleTime: 3_600_000, meta: { silent: true } });
