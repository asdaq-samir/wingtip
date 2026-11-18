import { Suspense, lazy, type ComponentProps } from "react";

// A past flight's card and its replay -- the timeline, the camera menu,
// the track -- in a chunk of their own, fetched at the tap that opens one:
// the route panel's chunk, which the map page fetches as soon as it is
// idle, carried them for every pilot whether a past flight was opened or
// not.
const Card = lazy(() => import("./PastFlightCard"));

/** PastFlightCard, drawn once its chunk is in; nothing until then. */
export default function LazyPastFlightCard(props: ComponentProps<typeof Card>) {
  return (
    <Suspense fallback={null}>
      <Card {...props} />
    </Suspense>
  );
}
