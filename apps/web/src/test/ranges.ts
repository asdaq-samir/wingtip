// jsdom lays nothing out and gives a Range no boxes, which the app reads in
// real browsers (useFiguresFit measures each figure's text by its range).
// A test that draws a figure strip, such as ClaudeView.test.tsx, failed
// with "range.getBoundingClientRect is not a function" (PR #591's
// test-web). Under jsdom every box is empty, as an element's own is.
if (typeof Range !== "undefined" && typeof Range.prototype.getBoundingClientRect !== "function") {
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
}
