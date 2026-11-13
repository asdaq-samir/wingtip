package app.wingtipmaps.android.plates

import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ui.WingtipIcons
import kotlinx.coroutines.launch

/**
 * An approach plate's Show on Map, at the end of its row in the airport
 * card's Approaches (the row itself still opens the FAA's page): the
 * plate laid on the chart where its georeference puts it (PlatesOnMap),
 * the map brought to it. `onPlaced` says whether it could be placed, so
 * the row says so where it cannot (a plate with no georeference, or none
 * of the field's coded approaches).
 */
@Composable
fun ShowPlateButton(ident: String, chartName: String, onPlaced: (Boolean) -> Unit) {
    val scope = rememberCoroutineScope()
    IconButton(onClick = { scope.launch { onPlaced(PlatesOnMap.shared.showChart(ident, chartName)) } }) {
        Icon(WingtipIcons.showOnMap, contentDescription = stringResource(R.string.plate_show_on_map))
    }
}

/** A d-TPP chart's kind that is an approach plate (the d-TPP metafile's chart_code). */
const val APPROACH_CHART = "IAP"
