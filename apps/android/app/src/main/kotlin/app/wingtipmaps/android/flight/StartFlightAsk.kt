package app.wingtipmaps.android.flight

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R

/**
 * Start Flight, asked once the airplane reaches flying speed (OwnShip's
 * `offer`): the stock alert, as every question is (docs/design/rules.md
 * §1.7). Its yes starts the location foreground service, which keeps the
 * position, the alerts ahead and the path flown going with the screen
 * off until the airplane slows below flying speed; Not Now leaves the
 * reading with the app in front only, and is not asked again this flight.
 * Google Play allows a location foreground service only for a use the
 * pilot starts, so it is never started without this tap.
 */
@Composable
fun StartFlightAsk(ship: OwnShip) {
    val offer by ship.offer.collectAsStateWithLifecycle()
    if (!offer) return
    AlertDialog(
        onDismissRequest = ship::notNow,
        title = { Text(stringResource(R.string.start_flight_title)) },
        text = { Text(stringResource(R.string.start_flight_line)) },
        confirmButton = { TextButton(onClick = ship::startFlight) { Text(stringResource(R.string.start_flight)) } },
        dismissButton = { TextButton(onClick = ship::notNow) { Text(stringResource(R.string.not_now)) } },
    )
}
