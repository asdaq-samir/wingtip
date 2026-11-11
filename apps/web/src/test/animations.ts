// jsdom has no Web Animations API, which the app reads in real browsers
// (revealRow reads a row's own animations). A test that draws the page,
// such as features/shell's firstDraw.test.tsx, left a look running past
// its end, and the next look's document.getAnimations() failed the whole
// run (run on e8500abdb, "TypeError: document.getAnimations is not a
// function").
// Under jsdom nothing animates, so both answer an empty list.
if (typeof document !== "undefined" && typeof document.getAnimations !== "function") {
  Object.defineProperty(Document.prototype, "getAnimations", { configurable: true, value: () => [] });
}
if (typeof Element !== "undefined" && typeof Element.prototype.getAnimations !== "function") {
  Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] });
}
