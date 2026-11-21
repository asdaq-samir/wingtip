package app.wingtipmaps.android.ui

import androidx.compose.foundation.text.input.InputTransformation
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.snapshotFlow

/**
 * A text field's state for text a view model owns. Compose's state-based
 * field (the value-and-onValueChange one is deprecated since the Compose
 * BOM 2026.11.01) keeps its own text, so the two are kept in step here:
 * what the pilot types goes up to [onValueChange], and a value the model
 * sets from elsewhere (a reset, a load, a photo's or the radio's words)
 * comes back into the field. The model's echoes of what was typed are not
 * written back: its state reaches the screen a frame late and would undo
 * the newest keys.
 */
@Composable
fun rememberFieldText(value: String, onValueChange: (String) -> Unit): TextFieldState {
    val state = rememberSaveable(saver = TextFieldState.Saver) { TextFieldState(value) }
    val sync = remember(state) { FieldSync(state.text.toString()) }
    val report by rememberUpdatedState(onValueChange)
    LaunchedEffect(state) {
        snapshotFlow { state.text.toString() }.collect { if (sync.typed(it)) report(it) }
    }
    LaunchedEffect(state, value) {
        if (sync.arrived(value, shown = state.text.toString())) state.setTextAndPlaceCursorAtEnd(value)
    }
    return state
}

/** A read-only field's text, a menu's pick: a new state for each pick, as
 *  nothing is typed into it to keep. */
@Composable
fun rememberShownText(text: String): TextFieldState = remember(text) { TextFieldState(text) }

/**
 * A field's text kept as its model keeps it ([keep], the model's own
 * function), as the value-and-onValueChange field showed it: a key the
 * model refuses is undone where it was typed, and a paste is kept to what
 * the model takes.
 */
fun keptAs(keep: (String) -> String): InputTransformation = InputTransformation {
    val typed = asCharSequence().toString()
    val kept = keep(typed)
    when (kept) {
        typed -> Unit
        originalText.toString() -> revertAllChanges()
        else -> replace(0, length, kept)
    }
}

/** What the field has sent up and the model has not yet given back, to
 *  tell its echoes from a value set elsewhere. */
internal class FieldSync(private var last: String) {
    private val sent = ArrayDeque<String>()

    /** The field's text now: true when it is new and goes up to the model. */
    fun typed(text: String): Boolean {
        if (text == last) return false
        last = text
        sent.addLast(text)
        return true
    }

    /** The model's value now: true when it was set elsewhere and goes into the field. */
    fun arrived(value: String, shown: String): Boolean {
        val i = sent.indexOf(value)
        if (i >= 0) {
            // The model's state is conflated, so once it gives back the
            // newest text sent no older echo can follow.
            if (value == sent.last()) sent.clear() else repeat(i + 1) { sent.removeFirst() }
            return false
        }
        sent.clear()
        if (value == shown) return false
        last = value
        return true
    }
}
