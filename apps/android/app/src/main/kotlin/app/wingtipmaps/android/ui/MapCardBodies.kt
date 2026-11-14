package app.wingtipmaps.android.ui

import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.engine.MapRules
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.map.MapStyle

// The bodies of the map's cards for the chart's own marks: an airspace
// volume, a VOR, a fix or a VFR waypoint (ThingCard holds them).

/** The sectional's ink of each class (MapStyle.AIRSPACE_INK). */
private fun classInk(cls: String) = ink(MapStyle.AIRSPACE_INK[cls]?.colour ?: MapStyle.MAGENTA)

/** When a volume is in effect, in words (the web's airspaceHours), or
 *  none where the file says nothing: NASR's WKHR_CODE "H24" continuous,
 *  "NOTAM" part-time at the times a NOTAM sets (FAA JO 7400.11), with
 *  its remark where it says more than that. */
fun airspaceHours(code: String?, remark: String?): String? {
    val said = remark?.trim()?.takeIf { it.isNotEmpty() && !NOTAM_ONLY.matches(it) }?.let(MapRules::faaWords)
    return when (code) {
        "H24" -> "Continuous"
        "NOTAM" -> if (said != null) "By NOTAM. $said" else "By NOTAM"
        else -> said
    }
}

private val NOTAM_ONLY = Regex("^legal description references notam\\.?$", RegexOption.IGNORE_CASE)

/** Feet MSL as the sectional's figures write a floor or a ceiling. */
private fun msl(ft: Double) = "${Format.altitude(ft)} MSL"

/** A volume's card (the web's AirspaceCardBody): its floor and ceiling in
 *  feet MSL, "up to but not including" where the file says TNI (the
 *  sectional's minus), its hours; whom to call before entering, from the
 *  primary airport's frequencies (NASR FRQ); and what it takes to go in,
 *  each rule with its section. */
@Composable
internal fun AirspaceCard(volume: MapPick.Airspace) {
    val name = remember(volume.name) { if (volume.name.isEmpty()) "" else MapRules.placeName(volume.name) }
    Head(classInk(volume.airspaceClass), stringResource(R.string.airspace), name)
    Fact(stringResource(R.string.fact_floor), if (volume.floorSfc) "SFC" else msl(volume.floorFt))
    Fact(
        stringResource(R.string.fact_ceiling),
        volume.ceilingFt?.let { (if (volume.ceilingExcluded) "Up to but not including " else "") + msl(it) } ?: Format.NONE,
    )
    airspaceHours(volume.hoursCode, volume.hoursRemark)?.let { Fact(stringResource(R.string.fact_hours), it) }
    val asked = remember(volume.airspaceClass) { MapRules.entryRules(volume.airspaceClass) }
    val rules = asked.getOrNull()
    val types = rules?.call.orEmpty()
    val field by produceState<AirportPlace?>(null, volume.ident) {
        value = volume.ident?.let { runCatching { Planner.place(it) }.getOrNull() }
    }
    val calls = field?.frequencies.orEmpty().filter { it.frequencyMhz != null && it.type?.uppercase() in types }
    val first = types.firstOrNull { type -> calls.any { it.type?.uppercase() == type } }
    if (first != null) {
        SectionTitle(stringResource(if (first == "APP") R.string.call_approach else R.string.call_tower))
        for (f in calls.filter { it.type?.uppercase() == first }.take(3)) {
            FrequencyRow(f.description ?: f.type ?: "", Format.frequency(f.frequencyMhz!!))
        }
    }
    asked.exceptionOrNull()?.let { ProblemLine("The entry rules failed: ${it.message}") }
    if (!rules?.rules.isNullOrEmpty()) {
        SectionTitle(stringResource(R.string.to_enter))
        for (r in rules.rules) {
            ListItem(
                supportingContent = { Text(r.cite) },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                content = { Text(r.rule, style = MaterialTheme.typography.bodyMedium) },
            )
        }
    }
}

private fun MapPick.Vor.station() = app.wingtipmaps.android.engine.Station(ident, lat, lon, magVar)

/** A VOR's card (the web's VorCard): the radial the airplane is on and the
 *  course to fly to it, to the station's own declination, where own ship
 *  is on; its identifier as it sends it (the only sure way to know the
 *  station tuned is the one meant, AIM 1-1-3); its DME channel, service
 *  volume, elevation, declination and hours; and its remarks, as the
 *  Chart Supplement lists them, under Restrictions where it is in service
 *  with them. Its name, kind, place and frequency are its card's bar's
 *  (ThingCard), no mark before them (the web's 8439547dc). */
@Composable
internal fun VorCard(vor: MapPick.Vor, flight: FlightModel = hiltViewModel()) {
    val fix by flight.ownShip.fix.collectAsStateWithLifecycle()
    val radial = fix?.let { MapRules.radialOf(vor.station(), it.lat, it.lon) }
    radial?.exceptionOrNull()?.let { ProblemLine("The radial failed: ${it.message}") }
    val on = radial?.getOrNull()
    if (on != null) {
        Text(
            "On the ${Format.headingFigures(on.radial)} radial · ${Format.distance(on.nm)}",
            style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold,
        )
        Text("${Format.heading(on.toCourse)} to fly to it", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    val morseAsked = remember(vor.ident) { MapRules.morse(vor.ident) }
    morseAsked.exceptionOrNull()?.let { ProblemLine("The identifier's Morse failed: ${it.message}") }
    morseAsked.getOrNull()?.let { morse ->
        ListItem(
            trailingContent = {
                Text(morse, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { contentDescription = vor.ident.toList().joinToString(" ") })
            },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            content = { Text(stringResource(R.string.fact_identifier)) },
        )
    }
    vor.channel?.let { Fact(stringResource(R.string.fact_dme_channel), it) }
    val volume = stringResource(R.string.fact_service_volume)
    val _ = remember(vor.serviceVolume) { MapRules.serviceVolume(vor.serviceVolume) }.fold(
        { it?.let { Fact(volume, it, description = true) } },
        { ProblemLine("The service volume failed: ${it.message}") },
    )
    vor.elevationFt?.let { Fact(stringResource(R.string.fact_elevation), Format.altitude(it)) }
    vor.magVar?.let { Fact(stringResource(R.string.fact_declination), Format.variation(it)) }
    val hours = stringResource(R.string.fact_hours)
    val _ = remember(vor.hours) { MapRules.navaidHours(vor.hours) }.fold(
        { it?.let { Fact(hours, it) } },
        { ProblemLine("The hours failed: ${it.message}") },
    )
    if (vor.remarks.isNotEmpty()) {
        var open by rememberSaveable(vor.ident) { mutableStateOf(false) }
        TextButton(onClick = { open = !open }) {
            Text(
                stringResource(if (vor.restricted) R.string.restrictions else R.string.remarks),
                color = if (vor.restricted) LocalWingtipPalette.current.cautionInk else MaterialTheme.colorScheme.primary,
            )
        }
        if (open) {
            for (remark in vor.remarks) {
                Text(remark, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
    Fact(stringResource(R.string.fact_position), Format.position(vor.lat, vor.lon))
}

/** A fix's or a VFR waypoint's card (the web's FixCard, WaypointCard):
 *  where it is off the nearest VOR on the map, as a controller and a
 *  flight plan give it (its fix/radial/distance, AIM 5-1-6), and its
 *  place. */
@Composable
internal fun PointCard(point: MapPick.Point) {
    val frdAsked = remember(point) { MapRules.fixRadialDistance(point.lat, point.lon, point.vors.map { it.station() }) }
    Head(
        ink(if (point.vfr) MapStyle.VFR_GREEN else MapStyle.FIX_INK),
        stringResource(if (point.vfr) R.string.vfr_waypoint else R.string.fix),
        frdAsked.getOrNull(),
    )
    frdAsked.exceptionOrNull()?.let { ProblemLine("The fix, radial and distance failed: ${it.message}") }
    Fact(stringResource(R.string.fact_position), Format.position(point.lat, point.lon))
}
