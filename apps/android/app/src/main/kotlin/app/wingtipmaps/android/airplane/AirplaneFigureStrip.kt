package app.wingtipmaps.android.airplane

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ui.Figure

/** The airplane's cruise, burn and ceiling as the planner flies it -- the
 *  pilot's own figures over its book's -- a tap opening its profile, where
 *  each is set. A figure not given reads "—", never another airplane's. */
@Composable
fun AirplaneFigureStrip(airplane: AirplaneNow) {
    val open = stringResource(R.string.profile_open)
    Row(Modifier.fillMaxWidth().clickable(role = Role.Button, onClickLabel = open) { ProfileOpen.open(airplane.tail) }) {
        listOf(FigureKey.CRUISE to R.string.figure_cruise, FigureKey.BURN to R.string.figure_burn, FigureKey.CEILING to R.string.figure_ceiling).forEach { (key, name) ->
            Figure(stringResource(name), airplane.value(key)?.let(key::show) ?: "—")
        }
    }
}
