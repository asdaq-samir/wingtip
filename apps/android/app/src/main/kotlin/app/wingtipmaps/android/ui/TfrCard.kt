package app.wingtipmaps.android.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.Tfr
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.MapRules
import app.wingtipmaps.android.engine.generated.tfrRead
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.map.TfrLayer
import app.wingtipmaps.android.ui.card.Status
import app.wingtipmaps.android.ui.card.StatusBadge
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * A temporary flight restriction's card, the web's TfrCard (the owner's
 * iPhone, 2026-11-14, TFR 6/4116): its kind with whether it is in force
 * now as a badge beside it (Active, or Later before it starts; the owner:
 * "Use badges where we can for example tfr active"), its floor and
 * ceiling, when it is in force on the phone's clock with its zone and UTC,
 * its purpose or the rule it is issued under with its section (the
 * engine's `tfr_read`: "Special security instructions, 14 CFR 99.7"), and
 * its own page on tfr.faa.gov. Read from the list the map draws
 * (TfrLayer); one no longer listed, or the list not come in, said in
 * place. Its title and Share are ThingCard's bar's.
 */
@Composable
internal fun TfrCardBody(notamId: String) {
    val heard by TfrLayer.heard.collectAsStateWithLifecycle()
    val tfr = heard.tfrs?.firstOrNull { it.notamId == notamId }
    when {
        tfr != null -> TfrFacts(tfr, TfrLayer.inForce(tfr, AppClock.nowMs()))
        heard.tfrs != null || heard.failed -> {
            Text(stringResource(if (heard.tfrs == null) R.string.tfr_card_unloaded else R.string.tfr_card_gone))
            TfrPageRow(notamId)
        }
    }
}

@Composable
private fun TfrFacts(tfr: Tfr, active: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        tfr.kind?.let { Text(it, style = MaterialTheme.typography.titleMedium) }
        StatusBadge(if (active) Status.Active else Status.Later)
    }
    // Its levels and the rule it is under, the engine's words for both.
    val read = remember(tfr) {
        Engine.tfrRead(
            kind = tfr.kind, rule = tfr.rule, title = tfr.title,
            floorFt = tfr.floorFt, floorRef = tfr.floorRef, ceilingFt = tfr.ceilingFt, ceilingRef = tfr.ceilingRef,
        )
    }
    read.exceptionOrNull()?.let { ProblemLine("The TFR's reading failed: ${it.message}") }
    read.getOrNull()?.where?.let { Text(it) }
    val times = remember(tfr) { TfrTimes.say(tfr.effective, tfr.expires) }
    times?.let { (form, words) ->
        Text(
            when (form) {
                TfrTimes.Form.SPAN -> words
                TfrTimes.Form.FROM -> stringResource(R.string.tfr_card_from, words)
                TfrTimes.Form.UNTIL -> stringResource(R.string.tfr_card_until, words)
            },
        )
    }
    // Its purpose as the FAA gives it, in sentence case, else the rule it
    // is issued under with its section: a line of the card's like the rest.
    (tfr.purpose?.let(MapRules::faaWords) ?: read.getOrNull()?.rule)?.let { Text(it) }
    TfrPageRow(tfr.notamId)
}

/** Its own page on tfr.faa.gov, a row with the list's 56-dp touch area. */
@Composable
private fun TfrPageRow(notamId: String) {
    val uri = LocalUriHandler.current
    ListItem(
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable(role = Role.Button) { uri.openUri(TfrTimes.faaPage(notamId)) },
        content = { Text(stringResource(R.string.tfr_card_faa_page), color = MaterialTheme.colorScheme.primary) },
    )
}

/**
 * When a TFR is in force, on the phone's clock with its zone and UTC
 * beside it, as the web's tfrTimes and the Brief write a time (a NOTAM's
 * own times are UTC, FAA JO 7930.2 3-3-2): "Tue 6 Oct, 18:00 CDT (2300Z)
 * – 20:00 CDT (0100Z)". Each end with its own zone, one running across a
 * change to or from daylight time; the year on both ends where either is
 * not this year's.
 */
object TfrTimes {
    enum class Form { SPAN, FROM, UNTIL }

    /** Its own page on tfr.faa.gov, the number's slash an underscore. */
    fun faaPage(notamId: String) = "https://tfr.faa.gov/tfr3/?page=detail_${notamId.replace("/", "_")}"

    fun say(effective: String?, expires: String?, now: Instant = AppClock.javaNow(), zone: ZoneId = ZoneId.systemDefault()): Pair<Form, String>? {
        val from = effective?.let { runCatching { Instant.parse(it) }.getOrNull() }?.atZone(zone)
        val to = expires?.let { runCatching { Instant.parse(it) }.getOrNull() }?.atZone(zone)
        val year = now.atZone(zone).year
        val withYear = listOfNotNull(from, to).any { it.year != year }
        val day = DateTimeFormatter.ofPattern(if (withYear) "EEE d MMM yyyy" else "EEE d MMM", Locale.US)
        val clock = DateTimeFormatter.ofPattern("HH:mm zzz", Locale.US)
        fun at(t: java.time.ZonedDateTime) = "${clock.format(t)} (${Format.zulu(t.toInstant())})"
        fun dayAt(t: java.time.ZonedDateTime) = "${day.format(t)}, ${at(t)}"
        return when {
            from != null && to != null -> Form.SPAN to "${dayAt(from)} – ${if (from.toLocalDate() == to.toLocalDate()) at(to) else dayAt(to)}"
            from != null -> Form.FROM to dayAt(from)
            to != null -> Form.UNTIL to dayAt(to)
            else -> null
        }
    }
}
