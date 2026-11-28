import { fromChunk } from "../../lib/fromChunk";

// The Brief's card and its pages on a chunk of their own (briefPages): the
// pages' sections -- the weather along the route, the takeoff and landing,
// the alternate, the risk and the paperwork -- were all in the route
// panel's chunk, though a route link draws none of them until the Brief is
// opened, and its scripts ran past their budget (route-load.spec). The
// route panel asks for it a few seconds after the route has drawn
// (prefetchTapCards), so the Brief opens at once, drawn straight from the
// chunk (fromChunk), and its pages print whole. Apart from BriefCardPart,
// which may export its component alone (fast refresh).
const loadBriefPages = () => import("./briefPages");
export const { Part: BriefingPageChunk, prefetch: prefetchBriefPages } = fromChunk(loadBriefPages, (m) => m.BriefingPage);
export const { Part: BriefCardChunk } = fromChunk(loadBriefPages, (m) => m.BriefCard);
