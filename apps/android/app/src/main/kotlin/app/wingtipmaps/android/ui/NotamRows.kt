package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.Badge
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.NotamsRanked
import app.wingtipmaps.android.api.generated.RankedNotam
import app.wingtipmaps.android.design.LoadingRow
import app.wingtipmaps.android.design.generated.WingtipSpace

/**
 * The airport card's NOTAMs, its view model's part the tab draws: the
 * field's NOTAMs best first, each read once by the engine (`said`), the
 * first three or all, and how one opens on a page of its own over the
 * card. The title opens and closes the rest in place, as every list on
 * the card does (the owner, 2026-11-11: "Notams should open like other
 * sections").
 */
class CardNotams(
    val ranked: NotamsRanked?,
    val said: List<FieldNotams.Said>?,
    val problem: String?,
    val all: Boolean,
    val toggle: () -> Unit,
    val open: (List<RankedNotam>) -> Unit,
    /** The engine's empty list for a private field outside the NOTAM
     *  system (airport_notams_none); null for the ordinary one. */
    val none: String? = null,
)

/**
 * The NOTAMs tab: its title with "3 of 9" at the end while it is closed,
 * the engine's first three, and opened every one under its kind (Runway,
 * Taxiway, Obstacle ...), the kinds in the order their first NOTAM ranks,
 * as ForeFlight heads its list's groups (the owner's screenshots,
 * 2026-11-11). Under them, that the TFR list could not be read, so no TFR
 * shown is not read as none.
 */
fun LazyListScope.notamsSection(notams: CardNotams, pad: Modifier) {
    notams.problem?.let { item(key = "notams-problem") { ProblemLine(it, pad) } }
    val said = notams.said
    if (said == null) {
        if (notams.problem == null) item(key = "notams-loading") { LoadingRow(pad) }
        return
    }
    val long = said.size > FieldNotams.FIRST
    item(key = "notams-title") { NotamsTitle(long, notams.all, said.size, notams.toggle, pad) }
    if (said.isEmpty()) {
        item(key = "notams-none") {
            val since = notams.ranked?.coverageSince
            val heard = if (since != null) stringResource(R.string.notams_none_since, since) else stringResource(R.string.notams_none_heard)
            NoteRow(notams.none ?: heard, pad)
        }
    } else if (long && notams.all) {
        FieldNotams.kinds(said).forEach { (kind, group) ->
            item(key = "notams-kind-$kind") {
                val name = when (kind) {
                    null -> stringResource(R.string.notam_kind_tfr)
                    "" -> stringResource(R.string.notam_kind_other)
                    else -> kind
                }
                Text(name, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = pad.padding(top = WingtipSpace.Md).animateItem())
            }
            items(group, key = { "n-" + it.notam.id }) { s -> NotamRow(s, { notams.open(listOf(s.notam)) }, pad.animateItem()) }
        }
    } else {
        items(if (long) said.take(FieldNotams.FIRST) else said, key = { "n-" + it.notam.id }) { s -> NotamRow(s, { notams.open(listOf(s.notam)) }, pad.animateItem()) }
    }
    if (notams.ranked?.unchecked.orEmpty().isNotEmpty()) {
        item(key = "notams-unchecked") {
            Text(stringResource(R.string.notams_tfrs_unread), color = LocalInk.current.cautionInk, style = MaterialTheme.typography.bodyMedium, modifier = pad.padding(vertical = WingtipSpace.Sm))
        }
    }
}

/** The list's title, the way to the rest where there are more than
 *  three, "3 of 9" and the chevron at its end, turned up while open. */
@Composable
private fun NotamsTitle(long: Boolean, all: Boolean, total: Int, toggle: () -> Unit, modifier: Modifier) {
    val colors = ListItemDefaults.colors(containerColor = Color.Transparent)
    val title: @Composable () -> Unit = {
        Text(stringResource(R.string.notams), style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
    }
    if (!long) {
        ListItem(colors = colors, modifier = modifier.fillMaxWidth(), content = title)
        return
    }
    val state = stringResource(if (all) R.string.notams_show_fewer else R.string.notams_show_all)
    ListItem(
        onClick = toggle,
        colors = colors,
        modifier = modifier.fillMaxWidth().semantics { stateDescription = state },
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
                if (!all) Text(stringResource(R.string.notams_shown, FieldNotams.FIRST, total), color = MaterialTheme.colorScheme.onSurfaceVariant)
                Icon(if (all) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            }
        },
        content = title,
    )
}

/** A line of the list that is not a NOTAM: that none was heard. */
@Composable
private fun NoteRow(words: String, modifier: Modifier) {
    ListItem(colors = ListItemDefaults.colors(containerColor = Color.Transparent), modifier = modifier.fillMaxWidth()) {
        Text(words, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/**
 * One NOTAM as a row: its Active or Inactive badge where a row's symbol is
 * (the owner, 2026-11-11: "replace the notam symbol with active/inactive
 * badge instead"), its what the line's whole width, and its times and
 * where a line each under it (NotamLines). Its number is only on its own
 * page ("Full card is fine"). A tap opens it there.
 */
@Composable
fun NotamRow(s: FieldNotams.Said, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val muted = !FieldNotams.active(s.notam)
    ListItem(
        onClick = onClick,
        leadingContent = { NotamState(s.notam) },
        supportingContent = { NotamLines(s) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = modifier.fillMaxWidth(),
    ) {
        // The words as sent, where the engine has no what, at most three lines.
        val clamp = s.read?.what == null && !FieldNotams.isTfr(s.notam)
        Text(notamWhat(s.what), color = if (muted) MaterialTheme.colorScheme.onSurfaceVariant else Color.Unspecified, maxLines = if (clamp) 3 else Int.MAX_VALUE, overflow = TextOverflow.Ellipsis)
    }
}

/** Whether it is in force now: "Active" in red, "Inactive" muted, as
 *  nothing is to be done about it yet (the owner, 2026-11-11: "Inactive
 *  notam can be disabled color"). */
@Composable
fun NotamState(n: RankedNotam, modifier: Modifier = Modifier) {
    val active = FieldNotams.active(n)
    val scheme = MaterialTheme.colorScheme
    Badge(
        containerColor = if (active) scheme.error else scheme.surfaceContainerHighest,
        contentColor = if (active) scheme.onError else scheme.onSurfaceVariant,
        modifier = modifier,
    ) { Text(stringResource(if (active) R.string.notam_active else R.string.notam_inactive)) }
}

/** Its first line, "closed" and "out of service" in red where they are in
 *  it, the rest in the text's colour. */
@Composable
fun notamWhat(what: String): AnnotatedString {
    val red = LocalInk.current.stopInk
    return buildAnnotatedString {
        var at = 0
        FieldNotams.RED.findAll(what).forEach { m ->
            append(what.substring(at, m.range.first))
            withStyle(SpanStyle(color = red)) { append(m.value) }
            at = m.range.last + 1
        }
        append(what.substring(at))
    }
}

/**
 * A NOTAM's lines under its what: its times, labelled, in the device's own
 * time (FieldNotams.timeLines), and where it is only where the engine can
 * say it is not obvious (the owner, 2026-11-11: "title(what), when, where
 * ... on different lines"). An inactive one is muted throughout.
 */
@Composable
fun NotamLines(s: FieldNotams.Said, modifier: Modifier = Modifier) {
    val times = FieldNotams.timeLines(s.notam, s.read)
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val words = if (FieldNotams.active(s.notam)) MaterialTheme.colorScheme.onSurface else muted
    Column(modifier) {
        times.forEach { t ->
            val label = stringResource(
                when (t.label) {
                    FieldNotams.Label.SINCE -> R.string.notam_since
                    FieldNotams.Label.STARTS -> R.string.notam_starts
                    FieldNotams.Label.ENDS -> R.string.notam_ends
                    FieldNotams.Label.DURATION -> R.string.notam_duration
                },
            )
            val value = timeWords(t)
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(color = muted)) { append(label) }
                    append("  ")
                    withStyle(SpanStyle(color = words)) { append(value) }
                },
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        s.where?.let { Text(it, color = muted, style = MaterialTheme.typography.bodyMedium) }
    }
}

/** A time line's value: "11/12 08:32 local (est.) (in 18d)", or Permanent. */
@Composable
private fun timeWords(t: FieldNotams.TimeLine): String {
    if (t.permanent) return stringResource(R.string.notam_permanent)
    var v = t.value.orEmpty()
    if (t.local) v = stringResource(R.string.notam_local, v)
    if (t.estimated) v = stringResource(R.string.notam_estimated, v)
    t.soon?.let { v = stringResource(R.string.notam_in, v, it) }
    return v
}
