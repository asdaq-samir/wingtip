package app.wingtipmaps.android.map

import androidx.compose.foundation.layout.Column
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.map.flow.FlowKind
import app.wingtipmaps.android.map.flow.ModelWeather

/** The test tag of the Weather tile's ••• (the web's weather-more). */
const val WEATHER_MORE_TAG = "weather-more"

/** Which of the menu's pages is up: its first, or a pick's own list. */
private enum class WeatherPage { TOP, LOOP, MODEL }

/**
 * Which weather the Weather layer draws (the web's WeatherPicks, the ••• in
 * its tile's corner, 2026-11-14): the radar and satellite loop, with its
 * speed while one plays, and the model weather, each as it was picked
 * before the four layers and off by default. Android's own cascading
 * menu: the first page names each pick with its value, and a tap opens
 * that pick's list in the same stock DropdownMenu, its first row back. The
 * web's AIRMETs and SIGMETs, PIREPs and winds aloft are not drawn on this
 * map yet, so they have no row.
 */
@Composable
fun WeatherMoreButton(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val loop = remember(context) { WeatherLoop.of(context) }
    val model = remember(context) { ModelWeather.of(context) }
    val loopState by loop.state.collectAsStateWithLifecycle()
    val modelState by model.state.collectAsStateWithLifecycle()
    var page by remember { mutableStateOf<WeatherPage?>(null) }
    val close = { page = null }
    IconButton(onClick = { page = WeatherPage.TOP }, modifier = modifier.testTag(WEATHER_MORE_TAG)) {
        Icon(Icons.Filled.MoreHoriz, contentDescription = stringResource(R.string.weather_to_show))
    }
    DropdownMenu(expanded = page != null, onDismissRequest = close) {
        val off = stringResource(R.string.model_weather_off)
        when (page) {
            WeatherPage.LOOP -> {
                Back(stringResource(R.string.loop_kind)) { page = WeatherPage.TOP }
                for (kind in LoopKind.entries) Choice(kind.label, kind == loopState.kind) { loop.pick(kind) }
                if (loopState.kind != LoopKind.OFF) {
                    HorizontalDivider()
                    Heading(stringResource(R.string.loop_speed))
                    for (speed in LoopSpeed.entries) Choice(speed.label, speed == loopState.speed) { loop.speed(speed) }
                }
            }
            WeatherPage.MODEL -> {
                Back(stringResource(R.string.model_weather)) { page = WeatherPage.TOP }
                Choice(off, modelState.field == null) { model.pick(null) }
                for (kind in FlowKind.entries) Choice(stringResource(kind.label), kind == modelState.field) { model.pick(kind) }
            }
            else -> {
                Heading(stringResource(R.string.weather_to_show))
                Opens(stringResource(R.string.loop_kind), loopState.kind.label) { page = WeatherPage.LOOP }
                Opens(stringResource(R.string.model_weather), modelState.field?.let { stringResource(it.label) } ?: off) { page = WeatherPage.MODEL }
            }
        }
    }
}

@Composable
private fun Heading(text: String) {
    DropdownMenuItem(
        text = { Text(text, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) },
        onClick = {},
        enabled = false,
    )
}

@Composable
private fun Opens(name: String, value: String, onClick: () -> Unit) {
    DropdownMenuItem(
        text = {
            Column {
                Text(name)
                Text(value, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        trailingIcon = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
        onClick = onClick,
    )
}

@Composable
private fun Back(name: String, onClick: () -> Unit) {
    DropdownMenuItem(
        text = { Text(name, style = MaterialTheme.typography.labelLarge) },
        leadingIcon = { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.back)) },
        onClick = onClick,
    )
}

/** A pick in a list, checked where it is the one picked; the menu stays
 *  open so the pilot sees it taken. */
@Composable
private fun Choice(name: String, picked: Boolean, onClick: () -> Unit) {
    DropdownMenuItem(
        text = { Text(name) },
        trailingIcon = if (picked) ({ Icon(Icons.Filled.Check, contentDescription = null) }) else null,
        onClick = onClick,
    )
}
