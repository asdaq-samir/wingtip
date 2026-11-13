package app.wingtipmaps.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.TfrContact
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.engine.MapRules
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage

/**
 * The NOTAMs opened from the airport card -- a row of its NOTAMs, or the
 * badge on a thing one addresses (the owner, 2026-11-11: "tapping the
 * affected thing should show the notam") -- on a page of their own in
 * the card's stack, ← and Back stepping back to the card (the card rule's
 * 2): one in full, or several as the list's rows, each opening in full
 * over them.
 */
@Composable
fun NotamPage(notams: List<FieldNotams.Said>, ident: String, exit: CardExit) {
    var one by remember(notams) { mutableStateOf(notams.singleOrNull()) }
    val shown = one
    if (shown != null) {
        val many = notams.size > 1
        if (many) BackHandler { one = null }
        val back = if (many) CardExit(back = { one = null }, close = exit.close) else exit
        CardPage(
            title = shown.heading ?: stringResource(R.string.notam_heading),
            subtitle = stringResource(R.string.notam_number, FieldNotams.number(shown.notam, ident)),
            exit = back,
        ) { padding ->
            Box(Modifier.padding(padding)) {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl)) {
                    NotamFull(shown)
                }
            }
        }
        return
    }
    CardPage(title = stringResource(R.string.notams), subtitle = ident, exit = exit) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(bottom = WingtipSpace.Xl)) {
            items(notams, key = { it.notam.id }) { s -> NotamRow(s, { one = s }, Modifier.padding(horizontal = WingtipSpace.Lg)) }
        }
    }
}

/**
 * One NOTAM in full: its Active or Inactive badge over its what, its times
 * and where as its row says them (NotamLines), its words with the FAA's
 * contractions written out where the what says them shorter, both the
 * engine's (notam_read); a TFR's place, instructions and whom to call
 * (TfrDetails); and its text as sent folded beneath, never rewritten.
 * Its times are said once, on its labelled lines (the owner, 2026-11-12:
 * "dates are twice").
 */
@Composable
private fun NotamFull(s: FieldNotams.Said) {
    val muted = !FieldNotams.active(s.notam)
    Column(verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
        NotamState(s.notam)
        Text(
            notamWhat(s.what),
            style = MaterialTheme.typography.titleMedium,
            color = if (muted) MaterialTheme.colorScheme.onSurfaceVariant else Color.Unspecified,
        )
        NotamLines(s)
        if (s.ours) s.read?.words?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (FieldNotams.isTfr(s.notam)) TfrDetails(s)
        Fold(stringResource(if (FieldNotams.isTfr(s.notam)) R.string.tfr_as_sent else R.string.notam_as_sent)) {
            AsSent(s.notam.raw)
        }
    }
}

/**
 * A TFR's own page under its lines: its place's name (tfr_read, the list's
 * title with its dates off), its instructions as the FAA gives them a line
 * each, in sentence case with their codes kept (faa_words), never
 * rewritten, and whom it names to call: the FAA facility it is
 * coordinated through and its point of contact, each telephone a tap
 * that dials.
 */
@Composable
private fun TfrDetails(s: FieldNotams.Said) {
    val t = s.notam.tfr
    s.tfr?.place?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    val instructions = t?.instructions.orEmpty()
    if (instructions.isNotEmpty()) {
        Column(Modifier.padding(top = WingtipSpace.Sm)) {
            Text(stringResource(R.string.tfr_instructions), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            instructions.forEach { line ->
                val words = remember(line) { MapRules.faaWords(line) }
                Text(words, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
    t?.facility?.let { Contact(stringResource(R.string.tfr_facility), it) }
    t?.contact?.let { Contact(stringResource(R.string.tfr_contact), it) }
}

/** One whom-to-call line: its name, its frequency, and its telephone at
 *  the end, a tap that opens the phone's dialler with it. */
@Composable
private fun Contact(label: String, c: TfrContact) {
    val context = LocalContext.current
    val call = c.phone?.let { stringResource(R.string.tfr_call, it) }
    ListItem(
        overlineContent = { Text(label) },
        supportingContent = c.frequency?.let { f -> { Text(f) } },
        trailingContent = c.phone?.let { phone ->
            {
                TextButton(onClick = { CardIntents.call(context, phone) }, modifier = Modifier.semantics { contentDescription = call.orEmpty() }) {
                    Text(phone)
                }
            }
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth(),
    ) { Text(c.name) }
}

/** A fold: its title a text button with the chevron, what it holds shown
 *  under it by Compose's own AnimatedVisibility, closed to begin with. */
@Composable
fun Fold(title: String, content: @Composable () -> Unit) {
    var open by rememberSaveable(title) { mutableStateOf(false) }
    Column {
        TextButton(onClick = { open = !open }, contentPadding = ButtonDefaults.TextButtonWithIconContentPadding) {
            Text(title)
            Icon(if (open) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, contentDescription = null, modifier = Modifier.padding(start = WingtipSpace.Xs))
        }
        AnimatedVisibility(open) { content() }
    }
}

/** Text as sent, in the monospaced face on the muted ground. */
@Composable
fun AsSent(text: String, modifier: Modifier = Modifier) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = MaterialTheme.shapes.small, modifier = modifier.fillMaxWidth()) {
        Text(text, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(WingtipSpace.Sm))
    }
}
