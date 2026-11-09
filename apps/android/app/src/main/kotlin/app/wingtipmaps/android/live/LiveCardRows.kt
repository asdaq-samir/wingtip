package app.wingtipmaps.android.live

import androidx.compose.foundation.layout.Column
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ui.LocalInk
import app.wingtipmaps.android.ui.SectionTitle

/**
 * The airspace card's special-use areas at the point tapped, with
 * SFDPS's word on each now (SpecialUseModel), as the web's AirspaceCard
 * has them: the area's name and kind, its altitudes, times of use and
 * controlling agency, and "Active now until 2130Z (FAA SFDPS)" in the
 * caution ink where it is in use.
 */
@Composable
fun SpecialUseRows(lat: Double, lon: Double, model: SpecialUseModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(lat, lon) { model.at(lat, lon) }
    SectionTitle(stringResource(R.string.special_use))
    when {
        state.loading -> LinearProgressIndicator(Modifier.fillMaxWidth())
        state.unavailable -> Text(stringResource(R.string.special_use_unavailable), color = LocalInk.current.cautionInk)
        state.areas.isNullOrEmpty() -> Text(stringResource(R.string.special_use_none), color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    state.areas.orEmpty().forEach { area ->
        ListItem(
            leadingContent = { Icon(Icons.Filled.Shield, contentDescription = null) },
            headlineContent = { Text("${area.name} · ${area.kind}", fontWeight = FontWeight.SemiBold) },
            supportingContent = {
                Column {
                    if (area.line.isNotEmpty()) Text(area.line)
                    area.status?.let {
                        Text(it, fontWeight = FontWeight.SemiBold, color = if (area.active) LocalInk.current.cautionInk else MaterialTheme.colorScheme.onSurface)
                    }
                }
            },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        )
    }
}

/** The followed airplane's tower departure event in a line, where TDES
 *  sent one (DepartureModel). */
@Composable
fun DepartureLine(ident: String?, model: DepartureModel = viewModel()) {
    val line by model.line.collectAsStateWithLifecycle()
    LaunchedEffect(ident) { model.of(ident) }
    line?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
}
