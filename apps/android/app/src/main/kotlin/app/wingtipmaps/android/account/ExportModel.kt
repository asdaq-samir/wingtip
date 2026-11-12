package app.wingtipmaps.android.account

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.AccountExport
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.exportAccount
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/**
 * Export My Data: the pilot's file fetched from the gateway, then saved
 * where they pick through the system's own file picker (Storage Access
 * Framework's CreateDocument), so the app needs no storage permission and
 * no FileProvider of its own. The file is held here between the two, as
 * the picker is another activity and the screen may be recreated under it.
 */
@HiltViewModel
class ExportModel @Inject constructor(app: Application) : AndroidViewModel(app) {
    data class State(
        val fetching: Boolean = false,
        /** The name to offer the picker, once, while a file waits for it. */
        val toSave: String? = null,
        val saved: Boolean = false,
        val problem: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    private var file: AccountExport? = null

    fun fetch() {
        if (_state.value.fetching) return
        _state.value = State(fetching = true)
        viewModelScope.launch {
            try {
                val fetched = Gateway.exportAccount()
                file = fetched
                _state.value = State(toSave = fetched.fileName)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.value = State(problem = Problems.say("Your data could not be fetched", e))
            }
        }
    }

    /** The picker has been opened: it is not opened again on recomposition. */
    fun offered() = _state.update { it.copy(toSave = null) }

    /** Where the pilot picked, or null where they backed out. */
    fun save(uri: Uri?) {
        val kept = file ?: return
        if (uri == null) {
            file = null
            return
        }
        viewModelScope.launch {
            val done = withContext(Dispatchers.IO) {
                runCatching {
                    getApplication<Application>().contentResolver.openOutputStream(uri)?.use { it.write(kept.bytes) }
                        ?: error("the folder could not be written to")
                }
            }
            file = null
            _state.value = done.fold(
                { State(saved = true) },
                { State(problem = "Your data could not be saved: ${it.message}") },
            )
        }
    }
}
