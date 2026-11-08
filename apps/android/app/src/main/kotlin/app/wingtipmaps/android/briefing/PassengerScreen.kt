package app.wingtipmaps.android.briefing

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Plan

/**
 * The passenger briefing (PassengerModel): the items ticked off for this
 * flight, each with where it comes from under its title, the count of
 * them in the heading, then the flight in a few lines and Share, which
 * hands it to the phone's share sheet. Each item is a Material list item
 * made toggleable whole, its touch target the row's height.
 */
@Composable
fun PassengerScreen(plan: Plan, modifier: Modifier = Modifier) {
    val model: PassengerModel = viewModel()
    val state by model.state.collectAsStateWithLifecycle()
    val planState by plan.state.collectAsStateWithLifecycle()
    LaunchedEffect(planState.dep, planState.dest, planState.stops) { model.show(planState) }
    val context = LocalContext.current
    val items = PassengerBriefing.ITEMS
    val done = items.count { it.key in state.ticked }

    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            "Brief Your Passengers · $done of ${items.size}",
            style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() },
        )
        items.forEach { item ->
            val on = item.key in state.ticked
            ListItem(
                headlineContent = { Text(item.title) },
                supportingContent = { Text(item.source, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                leadingContent = { Checkbox(checked = on, onCheckedChange = null) },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                modifier = Modifier.fillMaxWidth().toggleable(value = on, role = Role.Checkbox, onValueChange = { model.tick(item.key) }),
            )
        }
        Text("The Flight", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 8.dp).semantics { heading() })
        val message = model.message(planState, state)
        if (message == null) {
            Text("Plan a route first, and the flight is written here to send.", style = MaterialTheme.typography.bodyLarge)
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
                modifier = Modifier.padding(bottom = 24.dp),
            ) {
                Icon(Icons.Filled.Share, contentDescription = null, modifier = Modifier.padding(end = 8.dp))
                Text("Share")
            }
        }
    }
}
