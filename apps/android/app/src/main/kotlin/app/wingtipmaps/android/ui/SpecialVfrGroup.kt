package app.wingtipmaps.android.ui

import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.R
import app.wingtipmaps.android.engine.MapRules

/** Special VFR in an airport's surface area (14 CFR 91.157(a)): what it
 *  asks, or why an airplane may not fly it at this airport (part 91
 *  appendix D, section 3), each line with its rule. The engine's
 *  `special_vfr` answers it from the class and the band's primary airport;
 *  an airspace volume's card and What's Here both show it. */
@Composable
fun SpecialVfrGroup(airspaceClass: String, airport: String?) {
    val svfr = remember(airspaceClass, airport) { MapRules.specialVfr(airspaceClass, airport).getOrNull() } ?: return
    val (available, lines) = svfr
    SectionTitle(stringResource(if (available) R.string.special_vfr else R.string.no_special_vfr))
    for ((words, source) in lines) {
        ListItem(
            supportingContent = { Text(source) },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            content = { Text(words, style = MaterialTheme.typography.bodyMedium) },
        )
    }
}
