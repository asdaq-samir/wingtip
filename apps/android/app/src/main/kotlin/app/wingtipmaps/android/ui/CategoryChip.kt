package app.wingtipmaps.android.ui

import androidx.compose.material3.Badge
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipSpace

/**
 * The flight categories' colours, one set from the tokens for the map's
 * pips and every chip (the UI audit's #6): VFR green, MVFR blue, IFR red,
 * LIFR magenta. A chip with white words on it takes LIFR's deeper fill,
 * #7E3FB8 (6.4:1), where the map's #A371F7 would be 3.35:1; the others
 * are 4.5:1 and more with white as they are.
 */
object FlightCategory {
    private class Ink(val colour: Color, val hex: String)

    /** The one table of the categories' colours, as Compose's colours
     *  and as the map's "#rrggbb" (AirportWeatherMarks), in order. */
    private val INKS = linkedMapOf(
        "VFR" to Ink(WingtipColors.Category.Vfr, WingtipColors.Category.VFR_HEX),
        "MVFR" to Ink(WingtipColors.Category.Mvfr, WingtipColors.Category.MVFR_HEX),
        "IFR" to Ink(WingtipColors.Category.Ifr, WingtipColors.Category.IFR_HEX),
        "LIFR" to Ink(WingtipColors.Category.Lifr, WingtipColors.Category.LIFR_HEX),
    )

    /** Each category's mark colour as "#rrggbb", for the map's pips. */
    val HEX: Map<String, String> = INKS.mapValues { it.value.hex }

    /** The mark's colour, a pip on the map. */
    fun mark(category: String?): Color = INKS[category?.uppercase()]?.colour ?: WingtipColors.Category.Unknown

    /** A chip's fill under white words. */
    fun chip(category: String?): Color =
        if (category.equals("LIFR", ignoreCase = true)) WingtipColors.Category.LifrChip else mark(category)

    /** The ring round a category's dot, the chart's casing, as the map's
     *  pips are cased: IFR's red is 2.82:1 on the night's ground and
     *  2.29:1 on its card, under the 3:1 a mark needs (WCAG 1.4.11; the
     *  round-4 phones audit, 2026-11-27); the ring keeps its edge. */
    val RING: Color = WingtipColors.Chart.Casing
    val RING_WIDTH: Dp = WingtipSpace.Hairline
}

/** A field's flight category as Material's badge with text: its name in
 *  white on its colour, the name itself there, so the category is never
 *  told by the colour alone. */
@Composable
fun CategoryChip(category: String, modifier: Modifier = Modifier) {
    Badge(
        containerColor = FlightCategory.chip(category),
        contentColor = Color.White,
        modifier = modifier.semantics { contentDescription = "Flight category $category" },
    ) {
        Text(category.uppercase())
    }
}
