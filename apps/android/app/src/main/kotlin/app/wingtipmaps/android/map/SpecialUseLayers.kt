package app.wingtipmaps.android.map

import app.wingtipmaps.android.design.generated.WingtipColors

/**
 * The special-use areas' inks and the pictures their layers ask for: each
 * boundary a solid line and a hatched band along its inside, and
 * ForeFlight's tab on its boundary (the owner's screenshot near Brady, TX,
 * 2026-11-12). The layers are design/map-style.json's (OverlayStyle), the
 * web's the same; the pictures are OverlayPictures'.
 */
object SpecialUseLayers {
    /** The areas' inks, ForeFlight's over the sectional (the owner's
     *  screenshot over Lake Michigan, 2026-11-08): restricted, prohibited,
     *  warning and danger areas orange-brown, MOAs and alert areas magenta.
     *  By the FAA's TYPE_CODE (wingtip.sua TYPES). */
    const val RESTRICTED_INK = WingtipColors.Chart.SPECIAL_USE_HEX
    val MOA_INK = MapStyle.AIRSPACE_INK.getValue("C").colour
    const val HATCH_RESTRICTED = "sua|hatch|restricted"
    const val HATCH_MOA = "sua|hatch|moa"

    /** The tabs' pictures, by ink (the web's suaTab). */
    const val TAB_RESTRICTED = "sua|tab|restricted"
    const val TAB_MOA = "sua|tab|moa"
}
