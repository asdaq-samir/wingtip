package app.wingtipmaps.android.ui.sheet

/**
 * What a swipe down past the sheet's lowest size does, by the card on top
 * (docs/design/rules.md, the card rule's 10; the owner, 2026-11-14:
 * "Apple Maps closes all setting drawers on swipe down", then "Settings
 * cards should only close from a swipe down when in medium detents"):
 *
 * - [Close]: a settings card (You and its pages, the Map card) at half
 *   closes, as its ✕ does;
 * - [Lower]: the same card all the way up comes to half and stays open,
 *   however far or fast the drag went;
 * - [Park]: a content card (a field, an airplane, a TFR, Nearest, the
 *   Nav Log, Emergency …) parks at its smallest size, its bar alone in
 *   sight, and never closes on a swipe;
 * - [Hold]: nothing to do, the sheet springs back (the search and the
 *   plan, which never hide, or a card parked already).
 */
enum class SwipeDown {
    Close,
    Lower,
    Park,
    Hold,
    ;

    companion object {
        /**
         * @param covers whether a card is up (not the search or the plan).
         * @param swipeCloses whether that card is a settings card.
         * @param fromFull whether the sheet was all the way up.
         * @param parked whether the card is parked at its bar already.
         */
        fun of(covers: Boolean, swipeCloses: Boolean, fromFull: Boolean, parked: Boolean): SwipeDown = when {
            !covers -> Hold
            swipeCloses -> if (fromFull) Lower else Close
            parked -> Hold
            else -> Park
        }
    }
}
