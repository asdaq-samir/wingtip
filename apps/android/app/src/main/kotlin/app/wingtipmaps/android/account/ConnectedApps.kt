package app.wingtipmaps.android.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.LoadingRow
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.PlainListItem
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage

/**
 * You's Connected Apps, a card on the sheet's stack: one row a
 * connection, the app's name and when it was last used, with Disconnect
 * at its end, which asks first (Material's dialog, its confirm in the
 * error colour as Delete Account's is), then revokes that connection's
 * tokens, so the app's next call is refused and it must be connected
 * again. The web's ConnectedAppsPage.
 */
@Composable
fun ConnectedAppsCard(exit: CardExit, model: ConnectedAppsModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { model.load() }
    CardPage(title = stringResource(R.string.connected_apps), exit = exit) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding).testTag("connected-apps"),
            contentPadding = PaddingValues(bottom = WingtipSpace.Xl),
            verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs),
        ) {
            state.problem?.let { item(key = "problem") { ProblemLine(it, Modifier.padding(horizontal = WingtipSpace.Lg), onRetry = model::load) } }
            if (state.loading) item(key = "loading") { LoadingRow(Modifier.padding(WingtipSpace.Lg)) }
            if (!state.loading && state.problem == null && state.connections.isEmpty()) {
                item(key = "none") {
                    Text(stringResource(R.string.connected_apps_none), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(WingtipSpace.Lg))
                }
            }
            items(state.connections, key = { it.id }) { c ->
                PlainListItem(
                    supportingContent = { ConnectedAppsModel.lastUsed(c.renewedAt)?.let { Text(stringResource(R.string.connected_apps_last_used, it)) } },
                    trailingContent = {
                        TextButton(
                            onClick = { model.ask(c) },
                            enabled = state.ending != c.id,
                            colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                            modifier = Modifier.testTag("disconnect-app"),
                        ) { Text(stringResource(R.string.connected_apps_disconnect)) }
                    },
                    content = { Text(c.app, style = MaterialTheme.typography.titleMedium) },
                )
            }
        }
    }
    state.asked?.let { asked ->
        AlertDialog(
            onDismissRequest = { model.ask(null) },
            title = { Text(stringResource(R.string.connected_apps_disconnect_question, asked.app)) },
            text = { Text(stringResource(R.string.connected_apps_disconnect_text)) },
            confirmButton = {
                TextButton(onClick = model::confirm, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) {
                    Text(stringResource(R.string.connected_apps_disconnect))
                }
            },
            dismissButton = { TextButton(onClick = { model.ask(null) }) { Text(stringResource(R.string.cancel)) } },
        )
    }
}
