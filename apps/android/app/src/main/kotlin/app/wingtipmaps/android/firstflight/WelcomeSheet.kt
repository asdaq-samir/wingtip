package app.wingtipmaps.android.firstflight

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.search.SearchControl
import app.wingtipmaps.android.ui.AppearanceRow
import app.wingtipmaps.android.ui.OwnShipControl
import app.wingtipmaps.android.ui.SettingsGroup
import app.wingtipmaps.android.ui.ThemeRow
import app.wingtipmaps.android.ui.WingtipIcons

/** The welcome, for the UI tests. */
const val WELCOME_TAG = "welcome"

/**
 * The first flight, a welcome (the owner's option A, 2026-11-13, the
 * web's WelcomeSheet): the first time the app opens with no route on this
 * phone (FirstFlightMemory), Material's stock modal bottom sheet, laid out
 * as a welcome: "Welcome to Wingtip Maps" large and centred, three rows
 * of a tinted icon, a bold title and a line (Search, like Maps; FPL, like
 * your EFB; FAA charts that move like Maps), Settings' own Theme and
 * Appearance rows, which apply at once, and at its foot Android's
 * permission priming: Turn On Location, which asks the system's own
 * question at the tap and turns own ship on where it is allowed, and
 * Later, which goes on without asking. Asked again where it was refused
 * before; where the system no longer asks, the welcome stays with a line
 * saying where to allow it. Allowed already, Let's Go Flying alone.
 *
 * Going on -- either button, or the sheet swiped away -- marks it seen and
 * puts the one search up asking where to, not focused, so no keyboard
 * jumps up (FirstFlightAsks).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WelcomeSheet(plan: Plan, search: SearchControl, ownShip: OwnShipControl, onPlanned: () -> Unit) {
    val context = LocalContext.current
    val memory = remember(context) { FirstFlightMemory.of(context) }
    val seen by memory.seen.collectAsStateWithLifecycle()
    val planned by plan.state.collectAsStateWithLifecycle()
    val model: FirstFlightModel = hiltViewModel()
    FirstFlightAsks(model, plan, search, onPlanned)
    if (seen || planned.routed) return
    val sheet = rememberBottomSheetState(initialValue = SheetValue.Hidden, enabledValues = setOf(SheetValue.Hidden, SheetValue.Expanded))
    var refused by rememberSaveable { mutableStateOf(false) }
    val goOn = {
        memory.markSeen()
        search.pickAirport(R.string.where_to) { ident -> model.pickDest(ident); model.planIt(plan, onPlanned) }
    }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        when {
            granted.values.any { it } -> {
                if (!ownShip.on) ownShip.tap()
                goOn()
            }
            // No question asked (the system's "don't ask again"): stay, and
            // say where to allow it; Later still goes on.
            !ActivityCompat.shouldShowRequestPermissionRationale(context.activity() ?: return@rememberLauncherForActivityResult, Manifest.permission.ACCESS_FINE_LOCATION) ->
                refused = true
            // Refused at the question: the pilot's answer, and on with it.
            else -> goOn()
        }
    }
    val allowed = remember { locationAllowed(context) }
    ModalBottomSheet(onDismissRequest = goOn, sheetState = sheet, modifier = Modifier.testTag(WELCOME_TAG)) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Xl).padding(bottom = WingtipSpace.Lg),
            verticalArrangement = Arrangement.spacedBy(WingtipSpace.Lg),
        ) {
            Text(
                stringResource(R.string.welcome_title),
                style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().semantics { heading() },
            )
            WelcomeRow(Icons.Filled.Search, R.string.welcome_search_title, R.string.welcome_search_line)
            WelcomeRow(WingtipIcons.flightPlan, R.string.welcome_fpl_title, R.string.welcome_fpl_line)
            WelcomeRow(Icons.Filled.Map, R.string.welcome_charts_title, R.string.welcome_charts_line)
            SettingsGroup {
                ThemeRow(index = 0, count = 2)
                AppearanceRow(index = 1, count = 2)
            }
            if (allowed) {
                Button(onClick = goOn, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.lets_go_flying)) }
            } else {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
                    Button(onClick = { ask.launch(OwnShipControl.LOCATION) }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.turn_on_location)) }
                    if (refused) {
                        Text(
                            stringResource(R.string.welcome_location_refused), style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center,
                        )
                    }
                    TextButton(onClick = goOn) { Text(stringResource(R.string.later)) }
                }
            }
        }
    }
}

/** One of the welcome's rows: a tinted icon, a bold title and a line. */
@Composable
private fun WelcomeRow(icon: ImageVector, title: Int, line: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Lg), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        Column(Modifier.weight(1f)) {
            Text(stringResource(title), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(stringResource(line), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/**
 * The first route's asks after the welcome (the web's useFirstFlight):
 * planned from own ship's nearest field, else Home (FirstFlightModel);
 * with neither, the one search asks where from; a pick that is where the
 * pilot already is, where to again. Planned, the FPL comes up (`onPlanned`)
 * and its tip is due (FplTip).
 */
@Composable
private fun FirstFlightAsks(model: FirstFlightModel, plan: Plan, search: SearchControl, onPlanned: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    LaunchedEffect(state.needsFrom, state.from) {
        if (state.needsFrom && state.from == null) {
            search.pickAirport(R.string.where_from) { ident -> model.pickFrom(ident); model.planIt(plan, onPlanned) }
        }
    }
    LaunchedEffect(state.same) {
        if (state.same) {
            search.pickAirport(R.string.where_to) { ident -> model.pickDest(ident); model.planIt(plan, onPlanned) }
        }
    }
    LaunchedEffect(plan) {
        model.planned.collect { FplTip.of(context).due() }
    }
}

/** Whether the phone may read its position already. */
private fun locationAllowed(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

/** The activity a composable's context wraps, for the permission's question. */
private tailrec fun Context.activity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.activity()
    else -> null
}
