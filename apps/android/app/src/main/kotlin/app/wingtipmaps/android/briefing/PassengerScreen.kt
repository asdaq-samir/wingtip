package app.wingtipmaps.android.briefing

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SectionTitle
import app.wingtipmaps.android.ui.WingtipIcons

/**
 * The passenger briefing (PassengerModel): the items ticked off for this
 * flight, each with where it comes from under its title, the count of
 * them in the heading, then the flight in a few lines and Share, which
 * hands it to the phone's share sheet. Each item is Material's checkable
 * list item, its touch target the row's height.
 */
@Composable
fun PassengerScreen(plan: Plan, modifier: Modifier = Modifier) {
    val model: PassengerModel = hiltViewModel()
    val state by model.state.collectAsStateWithLifecycle()
    val planState by plan.state.collectAsStateWithLifecycle()
    LaunchedEffect(planState.dep, planState.dest, planState.stops) { model.show(planState) }
    val context = LocalContext.current
    val items = state.items
    val done = items.count { it.key in state.ticked }

    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg),
        verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
    ) {
        Text(
            stringResource(R.string.passengers_briefed, done, items.size),
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        ProblemLine(state.problem)
        items.forEach { item ->
            val on = item.key in state.ticked
            ListItem(
                checked = on,
                onCheckedChange = { model.tick(item.key) },
                supportingContent = { Text(item.rule, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                leadingContent = { Checkbox(checked = on, onCheckedChange = null) },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                modifier = Modifier.fillMaxWidth(),
                content = { Text(item.title) },
            )
        }
        SectionTitle(stringResource(R.string.the_flight))
        val message = model.message(planState, state)
        if (message == null) {
            Text(stringResource(R.string.passenger_plan_first), style = MaterialTheme.typography.bodyLarge)
        } else {
            Text(message, style = MaterialTheme.typography.bodyLarge)
            Button(
                onClick = {
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_SUBJECT, "Our flight")
                        putExtra(Intent.EXTRA_TEXT, message)
                    }
                    context.startActivity(Intent.createChooser(send, "Send the flight"))
                },
                contentPadding = ButtonDefaults.ButtonWithIconContentPadding,
                modifier = Modifier.padding(bottom = WingtipSpace.Xl),
            ) {
                Icon(WingtipIcons.share, contentDescription = null, modifier = Modifier.padding(end = WingtipSpace.Sm))
                Text(stringResource(R.string.share))
            }
        }
    }
}
