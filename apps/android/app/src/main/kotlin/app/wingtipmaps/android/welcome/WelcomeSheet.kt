package app.wingtipmaps.android.welcome

import android.Manifest
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.notify.Notifications
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.ui.OwnShipControl
import app.wingtipmaps.android.ui.sheet.WingtipSheet
import app.wingtipmaps.android.welcome.WelcomeModel.Ending
import app.wingtipmaps.android.welcome.WelcomeModel.Step

/**
 * The welcome, once per install, as a sheet over the map at its whole
 * height: a page a step (WelcomePage), Skip on each, Back a page, Close
 * the same as Skip. The permission pages say why in one sentence before
 * the system asks, and it asks only on Allow; Not Now goes on without.
 * At its end, Open Sample Flight plans Madison to Oshkosh and shows it;
 * Plan My Own shows the first flight's "Where to?". What was said is
 * applied as it ends: the airplane to the plan, the home airport to the
 * flight's choices.
 *
 * @param onOpen the welcome ended on its last page (true for the sample):
 *   the root raises its sheet to show the flight, or the field to plan one.
 */
@Composable
fun WelcomeHost(plan: Plan, onOpen: (sample: Boolean) -> Unit) {
    val context = LocalContext.current
    val model = viewModel { WelcomeModel(WelcomeMemory.of(context)) }
    val seen by model.seen.collectAsStateWithLifecycle()
    if (seen) return
    val choices = remember(context) { FlightChoices.of(context) }
    // Opened once each time it is to be shown (a rotation keeps the page).
    var opened by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        if (opened) return@LaunchedEffect
        opened = true
        val steps = WelcomeModel.steps(askLocation = !OwnShip.of(context).permitted, askNotifications = !Notifications.allowed(context))
        model.open(airplane = plan.state.value.aircraft, home = choices.home.value, steps = steps)
    }
    val end: (WelcomeModel.Outcome) -> Unit = { outcome ->
        opened = false
        if (outcome.airplane != plan.state.value.aircraft) plan.setAircraft(outcome.airplane)
        choices.setHome(outcome.home)
        outcome.route?.let { plan.plan(it.dep, it.dest, it.stops) }
        if (outcome.ending != Ending.SKIPPED) onOpen(outcome.ending == Ending.SAMPLE)
    }
    val location = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { model.next() }
    val notifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        Notifications.answered()
        model.next()
    }
    val state by model.state.collectAsStateWithLifecycle()

    WingtipSheet(title = stringResource(R.string.welcome), onClose = { end(model.skip()) }, full = true) {
        // Back goes a page back.
        BackHandler(enabled = state.index > 0) { model.back() }
        // Where the pilot is in the welcome: Material's linear progress
        // indicator stepped by page, said as "Step 2 of 5".
        val said = stringResource(R.string.said_welcome_step, state.index + 1, state.steps.size)
        LinearProgressIndicator(
            progress = { (state.index + 1f) / state.steps.size },
            modifier = Modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Lg).semantics { stateDescription = said },
        )
        Column(
            Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(top = WingtipSpace.Lg),
            verticalArrangement = Arrangement.spacedBy(WingtipSpace.Lg),
        ) {
            // A page gives way to the next with AnimatedContent's own transition.
            AnimatedContent(state.index, label = "welcomePage") { i -> WelcomePage(state.steps[i], state, plan, model) }
        }
        // The page's buttons at the sheet's foot, under the thumb, where
        // they stay as the page scrolls (Google's research on big
        // actions near the thumb).
        Column(Modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Lg).padding(top = WingtipSpace.Sm, bottom = WingtipSpace.Lg)) {
            WelcomeButtons(
                step = state.step,
                onSkip = { end(model.skip()) },
                onNext = model::next,
                onAllow = {
                    when (state.step) {
                        Step.LOCATION -> location.launch(OwnShipControl.LOCATION)
                        Step.NOTIFICATIONS -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            notifications.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else {
                            model.next()
                        }
                        else -> model.next()
                    }
                },
                onFinish = { sample -> end(model.finish(sample)) },
            )
        }
    }
}

/**
 * The page's buttons, Android's onboarding way: one full-width filled
 * button -- Next, or Allow on a permission page -- with Skip, and Not Now
 * on a permission page, as text buttons under it; on the last page the
 * sample flight filled, Plan My Own tonal, then Skip.
 */
@Composable
private fun WelcomeButtons(step: Step, onSkip: () -> Unit, onNext: () -> Unit, onAllow: () -> Unit, onFinish: (Boolean) -> Unit) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        when (step) {
            Step.FINISH -> {
                Button(onClick = { onFinish(true) }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.welcome_sample)) }
                FilledTonalButton(onClick = { onFinish(false) }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.welcome_own)) }
            }
            Step.LOCATION, Step.NOTIFICATIONS -> Button(onClick = onAllow, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.allow)) }
            else -> Button(onClick = onNext, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.welcome_next)) }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onSkip) { Text(stringResource(R.string.welcome_skip)) }
            Spacer(Modifier.weight(1f))
            if (step == Step.LOCATION || step == Step.NOTIFICATIONS) TextButton(onClick = onNext) { Text(stringResource(R.string.not_now)) }
        }
    }
}
