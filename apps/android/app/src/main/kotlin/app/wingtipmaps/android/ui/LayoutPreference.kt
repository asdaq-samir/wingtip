package app.wingtipmaps.android.ui

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.platform.LocalContext
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.Kept
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The screen's layout, the plan under the one search (the owner's of
 * 2026-11-09) or the strip (StripLayout: one field and
 * the flight as one strip, the owner's pick of 2026-11-04), kept in
 * the app's "wingtip" store (Kept) under the web app's key "layout" and held in one
 * StateFlow, so the root and Setup's Screen row, which sits inside
 * either layout, see the same value the moment it changes.
 */
object LayoutPreference {
    const val PLAN = "plan"
    const val STRIP = "strip"
    private val KEY = stringPreferencesKey("layout")

    private val state = MutableStateFlow<String?>(null)

    /** The layout as kept, read once from disk the first time it is asked. */
    fun flow(context: Context): StateFlow<String?> {
        if (state.value == null) {
            state.value = Kept.of(context, "wingtip")[KEY] ?: PLAN
        }
        return state.asStateFlow()
    }

    fun set(context: Context, layout: String) {
        Kept.of(context, "wingtip").edit { it[KEY] = layout }
        state.value = layout
    }
}

/** The layout as a Compose state, "plan" until the disk has been read. */
@Composable
fun rememberLayout(): State<String?> {
    val context = LocalContext.current
    return LayoutPreference.flow(context).collectAsState()
}
