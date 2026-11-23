import { lazy } from "react";

/** The runway proximity advisor on the FAA's airport diagram: own ship on
 *  the page, the hot spots ringed, and "Approaching runway 9-27", said
 *  and shown (the card's Airport diagram, DiagramRow's `viewer`). Its
 *  code, pdf.js's among it, loaded with the first diagram opened. */
export const AdvisedDiagram = lazy(() => import("./AdvisedDiagram"));
