import type { Course } from "./api/types";

// The route's ends as a flight has them: departure, any stops, destination.
type Ends = Pick<Course, "departure" | "destination"> & Partial<Pick<Course, "stops">>;

/** Every point of the route in order, fixes included. */
export function coursePoints<T extends Ends>(course: T): T["departure"][] {
  return [course.departure, ...(course.stops ?? []), course.destination];
}

/** The route's airports in order: coursePoints without the fixes. */
export function courseFields<T extends Ends>(course: T): T["departure"][] {
  return coursePoints(course).filter((a) => a.kind !== "fix");
}
