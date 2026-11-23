package app.wingtipmaps.android.account

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.done
import app.wingtipmaps.android.api.generated.gateway.ConnectionDto
import app.wingtipmaps.android.api.readOrNone
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
