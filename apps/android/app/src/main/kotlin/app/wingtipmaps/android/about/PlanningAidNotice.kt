package app.wingtipmaps.android.about

import android.content.Context
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Kept
import app.wingtipmaps.android.R
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Whether the planning-aid notice has been accepted on this install: shown
 * once, at first launch, before anything else is relied on (the store
 * audit's S2: the words were only in About and two in-flight lines). The
 * reading and writing are handed in, so the tests keep it in memory, as
 * WelcomeMemory does.
 */
class PlanningAidMemory(read: () -> Boolean, private val write: (Boolean) -> Unit) {
    private val _accepted = MutableStateFlow(read())
    val accepted: StateFlow<Boolean> = _accepted.asStateFlow()

    fun accept() {
        write(true)
        _accepted.value = true
    }

    companion object {
        private const val FILE = "wingtip"
        private val KEY = booleanPreferencesKey("planning_aid_accepted")

        @Volatile
        private var shared: PlanningAidMemory? = null

        fun of(context: Context): PlanningAidMemory =
            shared ?: synchronized(this) {
                shared ?: Kept.of(context, FILE).let { prefs ->
                    PlanningAidMemory(read = { prefs[KEY] ?: false }, write = { yes -> prefs.edit { it[KEY] = yes } })
                }.also { shared = it }
            }
    }
}

/**
 * The planning aid's words every app says (docs/legal/credits.md, "A
 * planning aid"; the terms' "A planning aid, not for navigation"), in the
 * stock alert once at first launch, with I Understand; About keeps them
 * after (AboutScreen). Not dismissed by a tap beside it: it is accepted.
 */
@Composable
fun PlanningAidNotice() {
    val context = LocalContext.current
    val memory = remember { PlanningAidMemory.of(context) }
    val accepted by memory.accepted.collectAsStateWithLifecycle()
    if (accepted) return
    AlertDialog(
        onDismissRequest = {},
        title = { Text(stringResource(R.string.planning_aid_title)) },
        text = { Text(stringResource(R.string.about_planning_aid_text)) },
        confirmButton = { TextButton(onClick = memory::accept) { Text(stringResource(R.string.planning_aid_accept)) } },
    )
}
