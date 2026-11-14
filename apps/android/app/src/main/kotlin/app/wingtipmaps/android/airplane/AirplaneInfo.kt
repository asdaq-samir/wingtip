package app.wingtipmaps.android.airplane

import android.content.Intent
import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.net.toUri
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.AirplaneDetails
import app.wingtipmaps.android.api.generated.PastFlightSummary
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SectionTitle
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.US)

/** An ISO date of the FAA's or the NTSB's as the app writes every day: "31 Jan 2033". */
internal fun day(iso: String?): String? = iso?.let { runCatching { DAY.format(LocalDate.parse(it.take(10))) }.getOrNull() ?: it }

private fun joined(vararg parts: Any?): String = parts.filter { it != null && it != "" }.joinToString(" · ")

private fun town(city: String?, state: String?): String? = listOfNotNull(city, state).joinToString(", ").ifEmpty { null }

/** One fact, left out where the record has none. */
@Composable
private fun Fact(title: String, value: Any?) {
    if (value == null || value == "") return
    Row(title, value.toString())
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
private fun Group(title: String, rows: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = WingtipSpace.Md)) {
        SectionTitle(title, Modifier.padding(horizontal = WingtipSpace.Lg))
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
        Group("Registration") { Row("The FAA's registry has no record of this N-number.", muted = true) }
    } else {
        val ref = details?.model
        val engine = details?.engine
        val hp = engine?.horsepower ?: full.horsepower
        val thrust = engine?.thrustLb ?: full.thrustLb
        val power = hp?.let { String.format(Locale.US, "%,d hp", it) } ?: thrust?.let { String.format(Locale.US, "%,d lb thrust", it) }
        Group("Registration") {
            Fact("Owner", full.owner ?: "Not in the record")
            Fact("Owner type", full.ownerType)
            Fact("Town", listOfNotNull(full.city, full.state ?: full.country?.takeIf { it != "US" }).joinToString(", "))
            Fact("Co-owners", full.coOwnerNames?.takeIf { it.isNotEmpty() }?.joinToString(", ") ?: full.coOwners?.takeIf { it > 0 })
            Fact("Status", full.status)
            Fact("Issued", day(full.certificateIssued))
            Fact("Expires", day(full.expires))
            Fact("Last action", day(full.lastAction))
            Fact("FAA region", full.region)
            if (full.fractional == true) Fact("Fractional ownership", "Yes")
        }
        Group("Airplane") {
            Fact("Type", listOfNotNull(full.manufacturer, full.model).joinToString(" "))
            Fact("Year", full.year)
            Fact("Category", ref?.category ?: full.aircraftType)
            Fact("Builder certification", ref?.builderCertification)
            Fact("Seats", ref?.seats ?: full.seats)
            Fact("Engines", ref?.engines ?: full.engines)
            Fact("Weight class", ref?.weightClass)
            // The FAA's reference record's average cruise, statute miles an
            // hour (ACFTREF, ardata.pdf): a reference figure, never one to
            // plan with, and said so.
            Fact("FAA reference cruise", ref?.cruiseMph?.let { "$it mph, not for planning" })
            Fact("Kit", full.kit)
            Fact("Serial", full.serial)
            Fact("Mode S address", full.modeSHex?.uppercase())
            Fact("Mode S (octal)", full.modeSOctal)
        }
        if (full.engine != null || engine != null || power != null) {
            Group("Engine") {
                Fact("Model", listOfNotNull(engine?.manufacturer, engine?.model).joinToString(" ").ifEmpty { full.engine })
                Fact("Type", engine?.engineType ?: full.engineType)
                Fact(if (hp != null) "Horsepower" else "Thrust", power)
            }
        }
        Group("Airworthiness") {
            Fact("Class and operations", full.airworthiness ?: "Not in the record")
            Fact("Issued", day(full.airworthinessDate))
            Fact("Type certificate data sheet", ref?.tcDataSheet)
            Fact("Holder", ref?.tcHolder)
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
        Group("History") {
            if (problem != null) ProblemLine(problem, Modifier.padding(horizontal = WingtipSpace.Lg)) else Row("Fetching its history…", muted = true)
        }
        return
    }
    val based = details.based
    if (based?.field != null || details.basedPending == true) {
        Group("Usually based at") {
            val field = based?.field
            if (field != null) Row(joined(field.ident, field.name), "${based.count ?: 0} of ${based.ends ?: 0} takeoffs and landings")
            else Row("Looking…", muted = true)
        }
    }
    val ntsb = details.ntsb.orEmpty()
    Group("Safety history") {
        if (ntsb.isEmpty()) Row("No NTSB accident or incident on record since 2008.", muted = true)
        ntsb.forEach { c -> Row(joined(day(c.date), c.kind, c.ntsbNo), joined(town(c.city, c.state), c.phase, c.damage, c.highestInjury), url = c.carolUrl) }
        ntsb.filter { it.docketUrl != null }.forEach { c -> Row("Docket ${c.ntsbNo.orEmpty()}".trim(), url = c.docketUrl) }
    }
    val past = details.pastRegistrations.orEmpty().sortedByDescending { it.sameAirframe == true }
    Group("Ownership history") {
        if (past.isEmpty()) Row("No past registrations.", muted = true)
        past.forEach { p ->
            Row(
                joined(p.nNumber, if (p.sameAirframe == true) "This airframe" else "Another airplane", p.status),
                joined(
                    listOfNotNull(p.manufacturer, p.model).joinToString(" ").ifEmpty { null }, p.year, p.owner, town(p.city, p.state),
                    p.cancelDate?.let { "canceled ${day(it)}" }, p.exportCountry?.let { "exported to $it" },
                ),
            )
        }
    }
    val documents = details.documents.orEmpty()
    val reservation = details.reservation
    Group("Documents filed") {
        if (documents.isEmpty() && reservation == null) Row("None filed in the last month.", muted = true)
        documents.forEach { d -> Row(d.kind ?: "Document", joined(d.received?.let { "received ${day(it)}" }, d.entered?.let { "entered ${day(it)}" }).ifEmpty { null }) }
        if (reservation != null) {
            Row(
                "N-number reserved",
                joined(reservation.registrant, town(reservation.city, reservation.state), day(reservation.reserved), reservation.kind, reservation.changeTo?.let { "changing to $it" }),
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
            flights == null -> Row(if (hex == null && state.recordAsked && state.inAir !is InAir.Checking) "No ICAO address to look its flights up by." else "Fetching its flights…", muted = true)
            flights.isEmpty() -> Row("Not heard in the last 6 weeks", muted = true)
        }
        flights.orEmpty().forEach { f -> FlightRow(f, hex, name) }
    }
}

private val TAKEOFF = DateTimeFormatter.ofPattern("d MMM, HH:mm", Locale.US)

@Composable
private fun FlightRow(f: PastFlightSummary, hex: String?, name: String) {
    val route = listOf(f.origin?.ident ?: "?", if (f.inAir) "in the air" else f.destination?.ident ?: "?").joinToString(" → ")
    val off = runCatching { TAKEOFF.format(Instant.ofEpochMilli((f.off * 1000).toLong()).atZone(ZoneId.systemDefault())) }.getOrNull()
    val minutes = (f.on - f.off) / 60
    val said = stringResource(R.string.said_replay_flight, route)
    ListItem(
        supportingContent = { Text(joined(off, Format.duration(minutes), Format.reportedAltitude(f.maxAltFt)), color = MaterialTheme.colorScheme.onSurfaceVariant) },
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
