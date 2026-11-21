package app.wingtipmaps.android.share

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.plan.PlanTanks

/**
 * The route's Share: the plan as a link (SharedPlan) through Android's
 * sharesheet, which opens the app where it is installed (App Links) and
 * the web otherwise. The N-number stays off the link unless the pilot
 * ticks it in; with none known there is nothing to ask, and the
 * sharesheet opens at once. The tap that shares, for a button or a menu's
 * item (the plan's More, the nav log's Share); its question is drawn
 * where it is called.
 */
@Composable
fun rememberShareRoute(state: Plan.State): () -> Unit {
    val context = LocalContext.current
    val tail by remember(context) { FlightChoices.of(context).tail }.collectAsStateWithLifecycle()
    var asking by rememberSaveable { mutableStateOf(false) }
    var withTail by rememberSaveable { mutableStateOf(false) }
    val number = tail
    if (asking && number != null) {
        AlertDialog(
            onDismissRequest = { asking = false },
            title = { Text(stringResource(R.string.share_route)) },
            text = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = withTail, onCheckedChange = { withTail = it })
                    Text(stringResource(R.string.share_include_tail, number))
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    asking = false
                    send(context, planOf(state, number.takeIf { withTail }))
                }) { Text(stringResource(R.string.share)) }
            },
            dismissButton = { TextButton(onClick = { asking = false }) { Text(stringResource(R.string.not_now)) } },
        )
    }
    return { if (tail == null) send(context, planOf(state, null)) else asking = true }
}

/** The plan as the link carries it: the airplane's type where one is
 *  picked (the pilot's own record's, else the planner's profile), never
 *  one assumed, and the fuel set on its gauges. */
internal fun planOf(state: Plan.State, tail: String?): SharedPlan = SharedPlan(
    dep = state.dep,
    dest = state.dest,
    stops = state.stops,
    altitudeFt = state.altitudeFt?.let { Math.round(it).toInt() },
    // As an instant in UTC, as every app's link writes it.
    depart = Plan.departMs(state.depart)?.let { java.time.Instant.ofEpochMilli(it).toString() },
    type = state.own?.type?.ifEmpty { null } ?: state.aircraft.takeIf { it.isNotEmpty() && it != "own" }?.uppercase(),
    rules = state.rules,
    tail = tail,
    // The fuel the pilot set on the route's gauges, its fields' alone.
    tanks = PlanTanks.state.value.own.filterKeys { k -> (listOf(state.dep) + state.stops + state.dest).any { it.equals(k, ignoreCase = true) } },
)

private fun send(context: Context, plan: SharedPlan) {
    val title = (listOf(plan.dep) + plan.stops + plan.dest).joinToString(" → ")
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, title)
        putExtra(Intent.EXTRA_TEXT, plan.link(Config.gateway))
    }
    context.startActivity(Intent.createChooser(send, context.getString(R.string.share_send)))
}
