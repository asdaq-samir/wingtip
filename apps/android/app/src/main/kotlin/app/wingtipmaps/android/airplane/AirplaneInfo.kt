package app.wingtipmaps.android.airplane

import android.content.Intent
import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.core.net.toUri
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.AirplaneDetails
import app.wingtipmaps.android.api.generated.PastFlightSummary
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SectionTitle
import app.wingtipmaps.android.ui.card.StatusBadge
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import app.wingtipmaps.android.ui.card.Status as BadgeStatus

private val DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.US)

/** An ISO date of the FAA's or the NTSB's as the app writes every day: "31 Jan 2033". */
internal fun day(iso: String?): String? = iso?.let { runCatching { DAY.format(LocalDate.parse(it.take(10))) }.getOrNull() ?: it }

private fun joined(vararg parts: Any?): String = parts.filter { it != null && it != "" }.joinToString(" · ")

private fun town(city: String?, state: String?): String? = listOfNotNull(city, state).joinToString(", ").ifEmpty { null }

/** One fact, left out where the record has none. */
@Composable
private fun Fact(@StringRes title: Int, value: Any?) {
    if (value == null || value == "") return
    Row(stringResource(title), value.toString())
}

@Composable
private fun Row(title: String, supporting: String? = null, muted: Boolean = false, url: String? = null) {
    val context = LocalContext.current
    val content: @Composable () -> Unit = {
        Text(title, color = if (muted) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
    }
    val under: (@Composable () -> Unit)? = supporting?.let { { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
    val colors = ListItemDefaults.colors(containerColor = Color.Transparent)
    if (url != null) {
        ListItem(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, url.toUri())) }, supportingContent = under, colors = colors, content = content)
    } else {
        ListItem(supportingContent = under, colors = colors, content = content)
    }
}

@Composable
private fun Group(@StringRes title: Int, rows: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = WingtipSpace.Md)) {
        SectionTitle(stringResource(title), Modifier.padding(horizontal = WingtipSpace.Lg))
        rows()
    }
}

/**
 * The airplane card's Info (the owner's P1, 2026-11-14; the web's
 * AirplaneInfo and AirplaneHistory): its public record in claude/plane-data's
 * order -- Registration, Airplane, Engine, Airworthiness, then where it is
 * usually based, its safety and ownership history and the documents filed.
 * The FAA aircraft registry is public data, so its owner is shown for every
 * airplane as the FAA publishes it (the owner, 2026-11-14: "For owner info
 * though, it's public info"), the town, never the street; an owner who
 * asked the FAA to withhold their name (49 U.S.C. 44114(b)) is not in the
 * record, and its row says so. `state.record` is the registry's, at once;
 * `state.details` the rest, null while asked.
 */
@Composable
fun AirplaneInfo(state: AirplaneLookup.State) {
    val details = state.details
    val full = details?.registration ?: state.record
    if (full == null) {
        Group(R.string.info_registration) { Row(stringResource(R.string.info_no_record), muted = true) }
    } else {
        val ref = details?.model
        val engine = details?.engine
        val hp = engine?.horsepower ?: full.horsepower
        val thrust = engine?.thrustLb ?: full.thrustLb
        val power = hp?.let { stringResource(R.string.info_hp, it) } ?: thrust?.let { stringResource(R.string.info_lb_thrust, it) }
        Group(R.string.info_registration) {
            Fact(R.string.info_owner, full.owner ?: stringResource(R.string.info_not_in_record))
            Fact(R.string.info_owner_type, full.ownerType)
            Fact(R.string.info_town, listOfNotNull(full.city, full.state ?: full.country?.takeIf { it != "US" }).joinToString(", "))
            Fact(R.string.info_co_owners, full.coOwnerNames?.takeIf { it.isNotEmpty() }?.joinToString(", ") ?: full.coOwners?.takeIf { it > 0 })
            Fact(R.string.info_status, full.status)
            Fact(R.string.info_issued, day(full.certificateIssued))
            Fact(R.string.info_expires, day(full.expires))
            Fact(R.string.info_last_action, day(full.lastAction))
            Fact(R.string.info_faa_region, full.region)
            if (full.fractional == true) Fact(R.string.info_fractional, stringResource(R.string.info_yes))
        }
        Group(R.string.info_airplane) {
            Fact(R.string.info_type, listOfNotNull(full.manufacturer, full.model).joinToString(" "))
            Fact(R.string.info_year, full.year)
            Fact(R.string.info_category, ref?.category ?: full.aircraftType)
            Fact(R.string.info_builder_cert, ref?.builderCertification)
            Fact(R.string.info_seats, ref?.seats ?: full.seats)
            Fact(R.string.info_engines, ref?.engines ?: full.engines)
            Fact(R.string.info_weight_class, ref?.weightClass)
            // The FAA's reference record's average cruise, statute miles an
            // hour (ACFTREF, ardata.pdf): a reference figure, never one to
            // plan with, and said so.
            Fact(R.string.info_ref_cruise, ref?.cruiseMph?.let { stringResource(R.string.info_ref_cruise_value, it) })
            Fact(R.string.info_kit, full.kit)
            Fact(R.string.info_serial, full.serial)
            Fact(R.string.info_mode_s, full.modeSHex?.uppercase())
            Fact(R.string.info_mode_s_octal, full.modeSOctal)
        }
        if (full.engine != null || engine != null || power != null) {
            Group(R.string.info_engine) {
                Fact(R.string.info_model, listOfNotNull(engine?.manufacturer, engine?.model).joinToString(" ").ifEmpty { full.engine })
                Fact(R.string.info_type, engine?.engineType ?: full.engineType)
                Fact(if (hp != null) R.string.info_horsepower else R.string.info_thrust, power)
            }
        }
        Group(R.string.info_airworthiness) {
            Fact(R.string.info_class_ops, full.airworthiness ?: stringResource(R.string.info_not_in_record))
            Fact(R.string.info_issued, day(full.airworthinessDate))
            Fact(R.string.info_tcds, ref?.tcDataSheet)
            Fact(R.string.info_holder, ref?.tcHolder)
        }
    }
    AirplaneHistory(details, state.detailsProblem)
}

/** Its history past the record: where it is usually based, its NTSB cases
 *  (each a link to the NTSB's CAROL report, and its docket), its past
 *  registrations (this airframe's first) and the documents filed, each
 *  group saying in place where it has none. */
@Composable
private fun AirplaneHistory(details: AirplaneDetails?, problem: String?) {
    if (details == null) {
        Group(R.string.info_history) {
            if (problem != null) ProblemLine(problem, Modifier.padding(horizontal = WingtipSpace.Lg)) else Row(stringResource(R.string.info_fetching_history), muted = true)
        }
        return
    }
    val based = details.based
    if (based?.field != null || details.basedPending == true) {
        Group(R.string.info_based_at) {
            val field = based?.field
            if (field != null) Row(joined(field.ident, field.name), pluralStringResource(R.plurals.info_based_count, based.ends ?: 0, based.count ?: 0, based.ends ?: 0))
            else Row(stringResource(R.string.info_looking), muted = true)
        }
    }
    val ntsb = details.ntsb.orEmpty()
    Group(R.string.info_safety) {
        if (ntsb.isEmpty()) Row(stringResource(R.string.info_no_ntsb), muted = true)
        ntsb.forEach { c -> Row(joined(day(c.date), c.kind, c.ntsbNo), joined(town(c.city, c.state), c.phase, c.damage, c.highestInjury), url = c.carolUrl) }
        ntsb.filter { it.docketUrl != null }.forEach { c -> Row(stringResource(R.string.info_docket, c.ntsbNo.orEmpty()).trim(), url = c.docketUrl) }
    }
    val past = details.pastRegistrations.orEmpty().sortedByDescending { it.sameAirframe == true }
    Group(R.string.info_ownership) {
        if (past.isEmpty()) Row(stringResource(R.string.info_no_past), muted = true)
        past.forEach { p ->
            Row(
                joined(p.nNumber, stringResource(if (p.sameAirframe == true) R.string.info_this_airframe else R.string.info_another_airplane), p.status),
                joined(
                    listOfNotNull(p.manufacturer, p.model).joinToString(" ").ifEmpty { null }, p.year, p.owner, town(p.city, p.state),
                    p.cancelDate?.let { stringResource(R.string.info_canceled, day(it).orEmpty()) }, p.exportCountry?.let { stringResource(R.string.info_exported, it) },
                ),
            )
        }
    }
    val documents = details.documents.orEmpty()
    val reservation = details.reservation
    Group(R.string.info_documents) {
        if (documents.isEmpty() && reservation == null) Row(stringResource(R.string.info_none_filed), muted = true)
        documents.forEach { d -> Row(d.kind ?: stringResource(R.string.info_document), joined(d.received?.let { stringResource(R.string.info_received, day(it).orEmpty()) }, d.entered?.let { stringResource(R.string.info_entered, day(it).orEmpty()) }).ifEmpty { null }) }
        if (reservation != null) {
            Row(
                stringResource(R.string.info_reserved),
                joined(reservation.registrant, town(reservation.city, reservation.state), day(reservation.reserved), reservation.kind, reservation.changeTo?.let { stringResource(R.string.info_changing_to, it) }),
            )
        }
    }
}

/**
 * The airplane card's Flights: its past flights by its ICAO address, newest
 * first (adsb.lol's archive, about six weeks), each "KMSN → KOSH", when it
 * took off, how long and how high, with ▶ playing it on the map
 * (PastFlightReplay); said in place while looked for, failed, or none.
 */
@Composable
fun AirplaneFlights(state: AirplaneLookup.State, name: String) {
    val flights = state.flights
    val hex = state.hex
    Column(Modifier.fillMaxWidth()) {
        when {
            state.flightsProblem != null -> ProblemLine(state.flightsProblem, Modifier.padding(horizontal = WingtipSpace.Lg))
            flights == null -> Row(if (hex == null && state.recordAsked && state.inAir !is InAir.Checking) stringResource(R.string.info_no_icao) else stringResource(R.string.info_fetching_flights), muted = true)
            flights.isEmpty() -> Row(stringResource(R.string.status_none_heard), muted = true)
        }
        flights.orEmpty().forEach { f -> FlightRow(f, hex, name) }
    }
}

private val TAKEOFF = DateTimeFormatter.ofPattern("d MMM, HH:mm", Locale.US)

@Composable
private fun FlightRow(f: PastFlightSummary, hex: String?, name: String) {
    val route = listOf(f.origin?.ident ?: "?", if (f.inAir) stringResource(R.string.info_in_the_air) else f.destination?.ident ?: "?").joinToString(" → ")
    val off = runCatching { TAKEOFF.format(Instant.ofEpochMilli((f.off * 1000).toLong()).atZone(ZoneId.systemDefault())) }.getOrNull()
    val minutes = (f.on - f.off) / 60
    val said = stringResource(R.string.said_replay_flight, route)
    ListItem(
        // A flight still under way leads with the In the air badge (rules.md 9).
        supportingContent = {
            Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm), verticalAlignment = Alignment.CenterVertically) {
                if (f.inAir) StatusBadge(BadgeStatus.InAir)
                Text(joined(off, Format.duration(minutes), Format.reportedAltitude(f.maxAltFt)), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        trailingContent = {
            if (hex != null) {
                IconButton(onClick = { PastFlightReplay.play(hex, f.id, "$name $route") }) {
                    Icon(Icons.Filled.PlayArrow, contentDescription = said, tint = MaterialTheme.colorScheme.primary)
                }
            }
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        content = { Text(route) },
    )
}
