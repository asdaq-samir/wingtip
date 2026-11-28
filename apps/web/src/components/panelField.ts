/** The fill of a panel's field -- Airport's and Aircraft's search bars,
 *  FPL's route box and the altitude beside the airplane -- one for all of
 *  them, at the owner's notice ("Why do the input boxes of aircraft and
 *  airport look different than fpl?"): glass, at the owner's pick of the
 *  input styles (2026-10-20, "maybe glass for the two inputs"), a pane
 *  lighter than the sheet with a lit rim and a shadow a field's size, on
 *  the sheet and the pill alike; 41 points tall at least, as Maps' field
 *  is. */
export const PANEL_FIELD_FILL =
  // A white card on the sheet's grey, as Apple's Maps on the web sets its
  // search field and its directions' stops.
  "bg-card shadow-none";
export const PANEL_FIELD = `min-h-[2.5625rem] ${PANEL_FIELD_FILL}`;

/** The sheet's first row's bar, one size on both pages (the owner,
 *  2026-11-14: "keep the n-number strip with buttons in the same size as
 *  search bar"): the one search's field on Search (OneSearchField) and
 *  the airplane's strip on FPL (FplBar), a white card on the sheet's
 *  grey, round-ended, taking the row's room up to the page toggle at its
 *  end. As tall as FPL's head's two rows, so a turn of the page moves
 *  nothing: the title's heading line (Title 3's 25, the look's
 *  --lead-heading) over the pills' 24, 49 at the default size. It was 46,
 *  the title squeezed onto a 22 line to fit (the HIG review, 2026-11-21:
 *  the owner prefers the rule to an exemption). */
export const SHEET_BAR = `h-[calc(var(--lead-heading)+1.5rem)] min-w-0 flex-1 rounded-full ${PANEL_FIELD}`;
