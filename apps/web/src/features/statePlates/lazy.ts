/**
 * What Settings draws of Plates by state, only inside its own lazily loaded
 * chunk (You). Nothing on the first load imports this file: the bundler keeps
 * every module an imported entry re-exports in the importer's chunk, and the
 * map's keep status reaches index.ts, so the page and its grouped list (about
 * 13 KB) loaded with the map (.dependency-cruiser.cjs, index-not-lazy).
 */

export { PlatesPage, PlatesRowValue } from "./PlatesPage";
