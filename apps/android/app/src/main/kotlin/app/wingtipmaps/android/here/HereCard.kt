package app.wingtipmaps.android.here

import android.content.Intent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.SettingsInputAntenna
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.net.toUri
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.AirspaceBand
import app.wingtipmaps.android.api.generated.TfrHere
import app.wingtipmaps.android.api.generated.VfrMinimums
import app.wingtipmaps.android.design.LoadingRow
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.ui.LocalInk
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SectionTitle

/**
 * What's Here's card (HereModel): where the point is and the ground's
 * height there, the fix it is named off, then from the ground up each
 * class's altitudes (feet MSL), what it takes to go in, what the airplane
 * must carry, the speed limit and its VFR weather minimums by day and
 * night (14 CFR 91.155); the Mode C veil; and the TFRs over it. Every
 * figure and rule is the planner's answer, written here.
 */
@Composable
fun HereCard(lat: Double, lon: Double, model: HereModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(lat, lon) { model.at(lat, lon) }
    val here = state.here
    val where = Format.position(lat, lon)
    Text(
        here?.groundFt?.let { stringResource(R.string.here_ground, where, Format.altitude(it)) } ?: where,
        style = MaterialTheme.typography.bodyLarge,
    )
    here?.point?.let { Text("${it.ident} · ${it.name}", color = MaterialTheme.colorScheme.onSurfaceVariant) }
    when {
        state.loading -> LoadingRow()
        state.problem != null -> {
            ProblemLine(state.problem)
            TextButton(onClick = model::retry) { Text(stringResource(R.string.try_again)) }
        }
        here != null -> {
            SectionTitle(stringResource(R.string.airspace_here))
            here.bands.forEach { BandRow(it) }
            here.modeCVeil?.let { veil ->
                Row(
                    icon = { Icon(Icons.Outlined.SettingsInputAntenna, contentDescription = null) },
                    title = stringResource(R.string.mode_c_veil),
                    lines = listOf(stringResource(R.string.mode_c_veil_line, Format.distance(veil.distanceNm), veil.ident)),
                )
            }
            Tfrs(here.tfrs.orEmpty(), here.tfrsUnavailable == true)
        }
    }
}

/** One class over the point, as the iPhone's BandRow: "Class C ·
 *  Madison", SFC to 4,700 ft MSL, then its rules a line each: its VFR
 *  minimums (one line where day and night agree), what it takes to go
 *  in, the equipment, the speed limit (14 CFR 91.117). */
@Composable
private fun BandRow(band: AirspaceBand) {
    val floor = if (band.floorFt <= 0.0) "SFC" else Format.altitude(band.floorFt)
    val vfr = band.minimums?.let { m ->
        val day = minimums(m.day)
        val night = minimums(m.night)
        if (day == night) "VFR $day" else "VFR by day $day; at night $night"
    }
    Row(
        icon = null,
        title = listOfNotNull("Class ${band.airspaceClass}", band.name).joinToString(" · "),
        lines = listOfNotNull(
            "$floor to ${Format.altitude(band.ceilingFt)} MSL",
            vfr,
            band.entry.takeUnless { it.isEmpty() || it == "Nothing." || it == "Nothing for VFR." },
            band.equipment,
            band.speedKt?.takeIf { it > 0 }?.let { stringResource(R.string.band_speed, it) },
        ),
    )
}

/** "3 sm, 500 ft below, 1,000 ft above, 2,000 ft horizontal", or "1 sm,
 *  clear of clouds": the planner's 91.155 figures as they read. */
private fun minimums(m: VfrMinimums): String {
    val vis = Format.visibility(m.visibilitySm)
    if (m.clearOfClouds) return "$vis, clear of clouds"
    return listOfNotNull(
        vis,
        m.belowFt?.let { "${Format.altitude(it)} below" },
        m.aboveFt?.let { "${Format.altitude(it)} above" },
        m.horizontalFt?.let { "${Format.altitude(it)} horizontal" },
    ).joinToString(", ")
}

/** The TFRs over the point, each opening its page on tfr.faa.gov. */
@Composable
private fun Tfrs(tfrs: List<TfrHere>, unavailable: Boolean) {
    val context = LocalContext.current
    SectionTitle(stringResource(R.string.tfrs))
    when {
        unavailable -> Text(stringResource(R.string.tfrs_unavailable), color = LocalInk.current.cautionInk)
        tfrs.isEmpty() -> Text(stringResource(R.string.tfrs_none), color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    tfrs.forEach { tfr ->
        val page = "https://tfr.faa.gov/tfr3/?page=detail_${tfr.notamId.replace('/', '_')}"
        Row(
            icon = { Icon(Icons.Outlined.Block, contentDescription = null, tint = if (tfr.activeNow) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant) },
            title = "TFR ${tfr.notamId}" + (tfr.kind?.let { " · $it" } ?: ""),
            lines = listOf(listOfNotNull(stringResource(if (tfr.activeNow) R.string.tfr_in_force else R.string.tfr_to_come), tfr.title).joinToString(" · ")),
            onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, page.toUri())) },
        )
    }
}

@Composable
private fun Row(icon: (@Composable () -> Unit)?, title: String, lines: List<String>, onClick: (() -> Unit)? = null) {
    val supporting: @Composable () -> Unit = { Column { lines.forEach { Text(it) } } }
    val colors = ListItemDefaults.colors(containerColor = Color.Transparent)
    val headline: @Composable () -> Unit = { Text(title, style = MaterialTheme.typography.titleMedium) }
    // Material's clickable list item where the row opens something, its
    // plain one where it does not.
    if (onClick != null) {
        ListItem(onClick = onClick, leadingContent = icon, supportingContent = supporting, colors = colors, modifier = Modifier.fillMaxWidth(), content = headline)
    } else {
        ListItem(leadingContent = icon, supportingContent = supporting, colors = colors, modifier = Modifier.fillMaxWidth(), content = headline)
    }
}
