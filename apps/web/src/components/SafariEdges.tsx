/**
 * Two thin bands of the look's own ground at the page's top and bottom
 * edges, for Safari's bars. Since Safari 26 (and on in 27) a browser tab
 * ignores theme-color (BrandLook still sets it, for an installed app and
 * Android's Chrome) and colours its status bar and toolbar from a fixed
 * element touching that edge, near the full width and a few points tall;
 * finding none -- the map's layers and the sheet's head band are
 * see-through -- it left its own light grey round a dark app (the
 * owner's iPhone, 2026-11-13). The top one takes the page's ground, the
 * bottom one the sheet's, which is what a phone has at its foot; from md
 * up there is no bottom sheet, so no bottom band. Nothing to touch, and
 * not printed.
 */
export default function SafariEdges() {
  return (
    <>
      <div
        aria-hidden="true"
        data-safari-edge="top"
        className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 bg-background print:hidden"
      />
      <div
        aria-hidden="true"
        data-safari-edge="bottom"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 h-1 bg-(--sheet) md:hidden print:hidden"
      />
    </>
  );
}
