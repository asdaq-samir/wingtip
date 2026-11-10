package app.wingtipmaps.android.airplane

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ui.Figure

/** The airplane's cruise, burn and ceiling as the planner flies it -- the
 *  pilot's own figures over its book's -- a tap opening its profile, where
 *  each is set. A figure not given reads "—", never another airplane's. */
@Composable
fun AirplaneFigureStrip(airplane: AirplaneNow) {
    val open = stringResource(R.string.profile_open)
    // Material's clickable surface, clear, over the figures.
    Surface(onClick = { ProfileOpen.open(airplane.tail) }, color = Color.Transparent, modifier = Modifier.fillMaxWidth().semantics { onClick(label = open, action = null) }) {
        Row(Modifier.fillMaxWidth()) {
            listOf(FigureKey.CRUISE to R.string.figure_cruise, FigureKey.BURN to R.string.figure_burn, FigureKey.CEILING to R.string.figure_ceiling).forEach { (key, name) ->
                Figure(stringResource(name), airplane.value(key)?.let(key::show) ?: "—")
            }
        }
    }
}
