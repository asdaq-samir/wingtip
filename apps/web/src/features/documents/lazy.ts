/**
 * What You draws of the documents library, only inside its own lazily
 * loaded chunk: its row and its page; and an airplane's POH row, drawn in
 * the airplane card's own chunk. Nothing on the first load imports this
 * file: the map page reaches index.ts for the reader, and the bundler keeps
 * every module an imported entry re-exports in the importer's chunk, so the
 * row and the console pages' list under it (about 12 KB) loaded with the map
 * (.dependency-cruiser.cjs, index-not-lazy).
 */

export { DocumentsRow } from "./DocumentsRow";
export { DocumentsPage } from "./DocumentsPageLazy";
export { default as PohRow } from "./PohRow";
