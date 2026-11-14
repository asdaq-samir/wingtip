package app.wingtipmaps.android.airplane

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.PastFlightSummary
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.ui.card.StatusBadge
import kotlin.math.roundToInt
import app.wingtipmaps.android.ui.card.Status as BadgeStatus

/** How long since, in the largest unit: 5 min, 3 h, 2 days. */
data class Ago(val unit: Unit, val n: Long) {
    enum class Unit { MINUTES, HOURS, DAYS }
}

fun ago(ms: Long): Ago {
    val min = (ms / 60_000).coerceAtLeast(0)
    return when {
        min < 60 -> Ago(Ago.Unit.MINUTES, min)
        min < 48 * 60 -> Ago(Ago.Unit.HOURS, min / 60)
        else -> Ago(Ago.Unit.DAYS, min / (24 * 60))
    }
}

/** An Ago as words, from the app's strings. */
@Composable
fun Ago.words(): String = when (unit) {
    Ago.Unit.MINUTES -> stringResource(R.string.ago_minutes, n)
    Ago.Unit.HOURS -> stringResource(R.string.ago_hours, n)
    Ago.Unit.DAYS -> pluralStringResource(R.plurals.ago_days, n.toInt(), n)
}

/**
 * What the airplane card's status line says, kept as what it means so the
 * words come from res/values/strings.xml when it is drawn (`words`), and a
 * unit test reads it without a screen. `problem` is said in the error style.
 */
sealed interface Status {
    val problem: Boolean get() = false

    data object Checking : Status
    /** `altitude` as ATC gives it, to the hundred feet (Format.reportedAltitude). */
    data class Flying(val altitude: String?, val speedKt: Int?) : Status
    data object Ground : Status
    data object Unknown : Status { override val problem get() = true }
    /** The words of a failure, already the model's own (Problems.say). */
    data class Failed(val why: String) : Status { override val problem get() = true }
    data class Landed(val at: String, val since: Ago) : Status
    data class LastHeard(val since: Ago) : Status
    data object NoneHeard : Status
}

/** What a page says of an airplane's air: the web's inAirWords. */
fun inAirStatus(inAir: InAir): Status = when (inAir) {
    InAir.Checking -> Status.Checking
    is InAir.Flying -> Status.Flying(inAir.altitudeFt?.let(Format::reportedAltitude), inAir.speedKt?.roundToInt())
    InAir.Ground -> Status.Ground
    InAir.Unknown -> Status.Unknown
    is InAir.Failed -> Status.Failed(inAir.why)
}

/**
 * The airplane card's one status line, under its tabs (the owner's P1,
 * 2026-11-14; the web's statusLine): in the air from the live find; else
 * where its last flight ended, from its past flights; else that none was
 * heard in adsb.lol's archive, about six weeks (wingtip.traffic
 * ARCHIVE_DAYS). `flights` newest first, null while still looked for.
 */
fun statusLine(inAir: InAir, flights: List<PastFlightSummary>?, nowMs: Long = AppClock.nowMs()): Status {
    if (inAir != InAir.Ground) return inAirStatus(inAir)
    val latest = flights?.firstOrNull { !it.inAir }
    if (latest != null) {
        val since = ago(nowMs - (latest.on * 1000).toLong())
        val at = latest.destination?.ident
        return if (latest.landed && at != null) Status.Landed(at, since) else Status.LastHeard(since)
    }
    if (flights != null && flights.isEmpty()) return Status.NoneHeard
    return inAirStatus(inAir)
}

/** The status in words, the strings' own. */
@Composable
fun Status.words(): String = when (this) {
    Status.Checking -> stringResource(R.string.status_checking)
    is Status.Flying -> listOfNotNull(stringResource(R.string.status_in_the_air), altitude, speedKt?.let { stringResource(R.string.speed_kt, it) }).joinToString(" · ")
    Status.Ground -> stringResource(R.string.status_ground)
    Status.Unknown -> stringResource(R.string.status_unknown)
    is Status.Failed -> why
    is Status.Landed -> stringResource(R.string.status_landed, at, since.words())
    is Status.LastHeard -> stringResource(R.string.status_last_heard, since.words())
    Status.NoneHeard -> stringResource(R.string.status_none_heard)
}

/** The status a pilot scans for that the line leads with, as a badge
 *  (rules.md 9; the web's StatusWords.badge): In the air, or On the
 *  ground where it landed; none for the rest, said in words alone. */
val Status.badge: BadgeStatus?
    get() = when (this) {
        is Status.Flying -> BadgeStatus.InAir
        is Status.Landed -> BadgeStatus.Ground
        else -> null
    }

/** The words after the badge: how high and fast, or where it landed. */
@Composable
fun Status.rest(): String? = when (this) {
    is Status.Flying -> listOfNotNull(altitude, speedKt?.let { stringResource(R.string.speed_kt, it) }).joinToString(" · ").ifEmpty { null }
    is Status.Landed -> stringResource(R.string.status_landed_rest, at, since.words())
    else -> words()
}

/** The card's status line: its badge, then the words after it; a problem
 *  in the error ink. */
@Composable
fun StatusLine(status: Status, modifier: Modifier = Modifier) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm), verticalAlignment = Alignment.CenterVertically) {
        status.badge?.let { StatusBadge(it) }
        status.rest()?.let {
            Text(
                it, style = MaterialTheme.typography.bodyMedium,
                color = if (status.problem) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
