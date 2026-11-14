import { lazy } from "react";

/** The radar and satellite loop on the map (the owner, 2026-11-09): its
 *  layers on the map, its bar over it, and its submenu in the Map card's Weather menu.
 *  The layers and the submenu are small and imported as they are; the bar
 *  (with its slider) is on a chunk of its own, fetched once a loop is
 *  turned on, and lazy here rather than at its caller: one module
 *  imported both ways is put on the first load all the same, and the
 *  bundler's warning of it fails the build (vite-plugins/strictBuild). */
export { RadarFrameGl, WeatherLoopGl } from "./WeatherLoopGl";
export { LoopMenu } from "./LoopMenu";
export const LoopBar = lazy(() => import("./LoopBar").then((m) => ({ default: m.LoopBar })));
