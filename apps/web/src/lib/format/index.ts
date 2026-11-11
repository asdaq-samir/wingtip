/** Every figure the web app writes, from one module: altitudes, distances,
 *  speeds, directions and weights (figures), times and durations (time),
 *  and the same figures said in words for a screen reader (spoken). Each
 *  is held to the shared example table in lib/fixtures/formats.json
 *  (formats.test.ts), the one the phones' formatters test against too. */
export * from "./figures";
export * from "./time";
export * from "./spoken";
export * from "./days";
