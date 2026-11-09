package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
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
    /** The mark's colour, a pip on the map. */
    fun mark(category: String?): Color = when (category?.uppercase()) {
        "VFR" -> WingtipColors.Category.Vfr
        "MVFR" -> WingtipColors.Category.Mvfr
        "IFR" -> WingtipColors.Category.Ifr
        "LIFR" -> WingtipColors.Category.Lifr
        else -> WingtipColors.Category.Unknown
    }

    /** A chip's fill under white words. */
    fun chip(category: String?): Color =
        if (category.equals("LIFR", ignoreCase = true)) WingtipColors.Category.LifrChip else mark(category)
}

/** A field's flight category as a chip: its name in white on its colour,
 *  the name itself there, so the category is never told by the colour
 *  alone. */
@Composable
fun CategoryChip(category: String, modifier: Modifier = Modifier) {
    Surface(
        color = FlightCategory.chip(category),
        contentColor = Color.White,
        shape = MaterialTheme.shapes.extraSmall,
        modifier = modifier.semantics { contentDescription = "Flight category $category" },
    ) {
        Text(category.uppercase(), style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(horizontal = WingtipSpace.Sm, vertical = WingtipSpace.Unit / 2))
    }
}
