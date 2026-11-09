package app.wingtipmaps.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.name
import app.wingtipmaps.android.engine.MapRules
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.flight.Traffic
import app.wingtipmaps.android.flight.Tracking
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.map.MapStyle
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * The card of what was tapped on the map, as the web's map opens one in
 * its sheet (MapCard: AirspaceCardBody, VorCard, FixCard, WaypointCard,
 * the field's card, a traffic airplane's): what it is, the figures a
 * pilot reads off it, each from the tapped feature's own fields or the
 * engine (MapRules), and a field's from the planner as it opens. Shown
 * in a modal sheet over the map, as Ask is.
 */
@Composable
fun MapCard(pick: MapPick) {
    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).navigationBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        when (pick) {
            is MapPick.Airport -> AirportCard(pick.ident)
            is MapPick.Airspace -> AirspaceCard(pick)
            is MapPick.Vor -> VorCard(pick)
            is MapPick.Point -> PointCard(pick)
            is MapPick.Plane -> PlaneCard(pick.hex)
        }
        Box(Modifier.height(16.dp))
    }
}

/** The card's head: its mark's colour, its name and what it is, and a
 *  line under them. */
@Composable
private fun Head(colour: Color, title: String, kind: String, subtitle: String?) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(width = 6.dp, height = 36.dp).background(colour, RoundedCornerShape(3.dp)))
        Column {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
                Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                Text(kind, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (!subtitle.isNullOrEmpty()) {
                Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** A row of a card: a name and its value, Material's list item. */
@Composable
private fun Fact(name: String, value: String, description: Boolean = false) {
    ListItem(
        headlineContent = { Text(name) },
        supportingContent = if (description) ({ Text(value) }) else null,
        trailingContent = if (description) null else ({ Text(value, style = MaterialTheme.typography.bodyLarge) }),
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
    )
}

@Composable
private fun Section(title: String) {
    Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
}

private fun ink(hex: String) = Color(android.graphics.Color.parseColor(hex))

/** Feet in the sectional's figures, "10,000". */
private fun feet(x: Double) = String.format(Locale.US, "%,d", x.roundToInt())

/** Degrees as a radial or a course is said: three figures, 360 for north
 *  ("the 360 radial"), never 000 (the web's threeFigures). */
fun threeFigures(deg: Double): String {
    val whole = ((deg.roundToInt() % 360) + 360) % 360
    return String.format(Locale.US, "%03d", if (whole == 0) 360 else whole)
}

/** A declination as a chart writes it: "2° E". */
fun declinationOf(east: Double): String {
    val n = abs(east)
    val figure = if (n == n.roundToInt().toDouble()) n.roundToInt().toString() else n.toString()
    return "$figure° ${if (east < 0) "W" else "E"}"
}

/** A place in degrees and minutes, "41°52.3′ N 87°37.8′ W". */
fun degreesMinutes(lat: Double, lon: Double): String {
    fun part(v: Double, pos: String, neg: String): String {
        val a = abs(v)
        val d = a.toInt()
        return String.format(Locale.US, "%d°%04.1f′ %s", d, (a - d) * 60, if (v < 0) neg else pos)
    }
    return "${part(lat, "N", "S")} ${part(lon, "E", "W")}"
}

// ---- The airspace ---------------------------------------------------------

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

/** A volume's card (the web's AirspaceCardBody): its floor and ceiling in
 *  feet MSL, "up to but not including" where the file says TNI (the
 *  sectional's minus), its hours; whom to call before entering, from the
 *  primary airport's frequencies (NASR FRQ); and what it takes to go in,
 *  each rule with its section. */
@Composable
private fun AirspaceCard(volume: MapPick.Airspace) {
    val name = remember(volume.name) { if (volume.name.isEmpty()) "" else MapRules.placeName(volume.name) }
    Head(classInk(volume.airspaceClass), "Class ${volume.airspaceClass}", "Airspace", name)
    Fact("Floor", if (volume.floorSfc) "SFC" else "${feet(volume.floorFt)} ft MSL")
    Fact(
        "Ceiling",
        volume.ceilingFt?.let { "${if (volume.ceilingExcluded) "Up to but not including " else ""}${feet(it)} ft MSL" } ?: "—",
    )
    airspaceHours(volume.hoursCode, volume.hoursRemark)?.let { Fact("Hours", it) }
    val rules = remember(volume.airspaceClass) { MapRules.entryRules(volume.airspaceClass) }
    val types = rules?.call?.map { it.value }.orEmpty()
    val field by produceState<AirportPlace?>(null, volume.ident) {
        value = volume.ident?.let { runCatching { Planner.place(it) }.getOrNull() }
    }
    val calls = field?.frequencies.orEmpty().filter { it.frequencyMhz != null && it.type?.uppercase() in types }
    val first = types.firstOrNull { type -> calls.any { it.type?.uppercase() == type } }
    if (first != null) {
        Section(if (first == "APP") "Call approach" else "Call the tower")
        for (f in calls.filter { it.type?.uppercase() == first }.take(3)) {
            Fact(f.description ?: f.type ?: "", String.format(Locale.US, "%.3f", f.frequencyMhz!!).trimEnd('0').let { if (it.endsWith('.')) "${it}0" else it })
        }
    }
    if (!rules?.rules.isNullOrEmpty()) {
        Section("To enter")
        for (r in rules!!.rules) {
            ListItem(
                headlineContent = { Text(r.rule, style = MaterialTheme.typography.bodyMedium) },
                supportingContent = { Text(r.cite) },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            )
        }
    }
}

// ---- A VOR, a fix, a waypoint ----------------------------------------------

private fun MapPick.Vor.station() = MapRules.Station(ident, lat, lon, magVar)

/** A VOR's card (the web's VorCard): the radial the airplane is on and the
 *  course to fly to it, to the station's own declination, where own ship
 *  is on; its identifier as it sends it (the only sure way to know the
 *  station tuned is the one meant, AIM 1-1-3); its DME channel, service
 *  volume, elevation, declination and hours; and its remarks, as the
 *  Chart Supplement lists them, under Restrictions where it is in service
 *  with them. */
@Composable
private fun VorCard(vor: MapPick.Vor) {
    Head(ink(MapStyle.BLUE), vor.ident, vor.kind, listOfNotNull(vor.name?.let(MapRules::placeName), vor.freq).joinToString(" · "))
    val context = LocalContext.current
    val fix by OwnShip.of(context).fix.collectAsStateWithLifecycle()
    val on = fix?.let { MapRules.radialOf(vor.station(), it.lat, it.lon) }
    if (on != null) {
        Text(
            "On the ${threeFigures(on.radial)} radial · ${nm(on.nm)}",
            style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold,
        )
        Text("${threeFigures(on.toCourse)}° to fly to it", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    val morse = remember(vor.ident) { MapRules.morse(vor.ident) }
    if (morse != null) {
        ListItem(
            headlineContent = { Text("Identifier") },
            trailingContent = {
                Text(morse, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { contentDescription = vor.ident.toList().joinToString(" ") })
            },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        )
    }
    vor.channel?.let { Fact("DME channel", it) }
    remember(vor.serviceVolume) { MapRules.serviceVolume(vor.serviceVolume) }?.let { Fact("Service volume", it, description = true) }
    vor.elevationFt?.let { Fact("Elevation", ft(it)) }
    vor.magVar?.let { Fact("Declination", declinationOf(it)) }
    remember(vor.hours) { MapRules.navaidHours(vor.hours) }?.let { Fact("Hours", it) }
    if (vor.remarks.isNotEmpty()) {
        var open by rememberSaveable(vor.ident) { mutableStateOf(false) }
        TextButton(onClick = { open = !open }) {
            Text(
                if (vor.restricted) "Restrictions" else "Remarks",
                color = if (vor.restricted) LocalWingtipPalette.current.caution else MaterialTheme.colorScheme.primary,
            )
        }
        if (open) {
            for (remark in vor.remarks) {
                Text(remark, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
    Fact("Position", degreesMinutes(vor.lat, vor.lon))
}

/** A fix's or a VFR waypoint's card (the web's FixCard, WaypointCard):
 *  where it is off the nearest VOR on the map, as a controller and a
 *  flight plan give it (its fix/radial/distance, AIM 5-1-6), and its
 *  place. */
@Composable
private fun PointCard(point: MapPick.Point) {
    val frd = remember(point) { MapRules.fixRadialDistance(point.lat, point.lon, point.vors.map { it.station() }) }
    Head(
        ink(if (point.vfr) MapStyle.VFR_GREEN else MapStyle.FIX_INK),
        point.ident,
        if (point.vfr) "VFR waypoint" else "Fix",
        frd,
    )
    Fact("Position", degreesMinutes(point.lat, point.lon))
}

// ---- A field ----------------------------------------------------------------

/** A field's card, asked of the planner as it opens (the web's airport
 *  card), where the strip has no Airport tab to open it in. */
@Composable
private fun AirportCard(ident: String) {
    val place by produceState<Result<AirportPlace>?>(null, ident) {
        value = runCatching { Planner.place(ident) }
    }
    when (val got = place) {
        null -> CircularProgressIndicator(Modifier.size(24.dp))
        else -> got.fold({ PlaceCard(it) }, { ProblemLine(it.message) })
    }
}

// ---- An airplane of the traffic ---------------------------------------------

/** An airplane heard (the web's traffic card): what it is, its height
 *  against own ship's as TCAS writes it (the engine's `traffic_marks`),
 *  its speed and track, and Track, which follows it (Tracking) and keeps
 *  it ringed on the map. */
@Composable
private fun PlaneCard(hex: String) {
    val context = LocalContext.current
    val traffic = remember(context) { Traffic.of(context) }
    val tracking = remember(context) { Tracking.of(context) }
    val planes by traffic.planes.collectAsStateWithLifecycle()
    val marks by traffic.marks.collectAsStateWithLifecycle()
    val tracked by tracking.hex.collectAsStateWithLifecycle()
    val i = planes.indexOfFirst { it.hex.equals(hex, ignoreCase = true) }
    val plane = planes.getOrNull(i)
    if (plane == null) {
        Head(ink(MapStyle.TRAFFIC_FAR), hex.uppercase(), "Traffic", "No longer heard.")
        return
    }
    val mark = marks.getOrNull(i)
    Head(
        ink(if (mark?.near == true) MapStyle.TRAFFIC_NEAR else MapStyle.TRAFFIC_FAR),
        plane.name,
        plane.type ?: "Traffic",
        plane.registration?.takeIf { it != plane.name },
    )
    mark?.label?.takeIf { it.isNotEmpty() }?.let { Fact("Height", it) }
    plane.altitudeFt?.let { Fact("Altitude", ft(it)) }
    plane.speedKt?.let { Fact("Ground speed", kt(it)) }
    plane.trackDeg?.let { Fact("Track", "${threeFigures(it)}° true") }
    HorizontalDivider()
    val isTracked = tracked == hex.lowercase()
    OutlinedButton(onClick = { tracking.track(if (isTracked) null else hex, plane) }, modifier = Modifier.fillMaxWidth()) {
        Text(if (isTracked) "Stop Tracking" else "Track")
    }
    val source by traffic.source.collectAsStateWithLifecycle()
    Text(Traffic.credit(source), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}
