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
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.done
import app.wingtipmaps.android.api.generated.gateway.ConnectionDto
import app.wingtipmaps.android.api.readOrNone
import app.wingtipmaps.android.design.LoadingRow
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.PlainListItem
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import javax.inject.Inject

/** The AI apps connected through the connector (GET and DELETE
 *  /api/me/connections, the gateway's ConnectionsController); a fake in
 *  the tests. */
interface Connections {
    suspend fun list(): List<ConnectionDto>

    suspend fun disconnect(id: String)
}

/**
 * Connected Apps' view model, the web's useConnectedApps: each AI app the
 * pilot connected to Wingtip through its MCP connector (Claude, ChatGPT),
 * fetched as the page opens, and one ended from Wingtip's side once the
 * pilot has said yes, its tokens revoked at once (the deep security
 * review of 2026-11-21, N2). A connection already gone (a 404) is simply
 * no longer listed; any other failure is said where the list is.
 */
@HiltViewModel
class ConnectedAppsModel(private val source: Connections) : ViewModel() {
    @Inject
    constructor() : this(GatewayConnections)

    data class State(
        val connections: List<ConnectionDto> = emptyList(),
        val loading: Boolean = false,
        val problem: String? = null,
        /** The connection the pilot asked to end, until they answer. */
        val asked: ConnectionDto? = null,
        /** The one being ended, its row's Disconnect held. */
        val ending: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(loading = true, problem = null) }
        viewModelScope.launch {
            try {
                val connections = source.list()
                _state.update { it.copy(connections = connections, loading = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, problem = Problems.say("Your connected apps could not be read", e)) }
            }
        }
    }

    /** Disconnect tapped: asked first. */
    fun ask(connection: ConnectionDto?) = _state.update { it.copy(asked = connection) }

    /** The pilot said yes: the connection asked about is ended, then the list read again. */
    fun confirm() {
        val asked = _state.value.asked ?: return
        _state.update { it.copy(asked = null, ending = asked.id) }
        viewModelScope.launch {
            try {
                source.disconnect(asked.id)
                _state.update { it.copy(ending = null) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                val gone = e is Gateway.Refusal && e.status == 404
                _state.update { it.copy(ending = null, problem = if (gone) null else Problems.say("The app was not disconnected", e)) }
            }
            reload()
        }
    }

    private suspend fun reload() {
        try {
            val connections = source.list()
            _state.update { it.copy(connections = connections) }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // The list shown stands; a failed disconnect has said why.
        }
    }

    companion object {
        /** "Last used Nov 14, 2026", in the phone's own date style and
         *  zone, from when the connection's token was last renewed. */
        fun lastUsed(renewedAt: String?, zone: ZoneId = ZoneId.systemDefault()): String? =
            renewedAt?.let { runCatching { DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).format(Instant.parse(it).atZone(zone)) }.getOrNull() }
    }
}

/** The gateway's own connections, through the generated client. */
private object GatewayConnections : Connections {
    override suspend fun list() = Gateway.api.connections().readOrNone().orEmpty()

    override suspend fun disconnect(id: String) = Gateway.api.disconnect(id).done()
}

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
