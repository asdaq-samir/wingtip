package app.wingtipmaps.android.airplane

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.TrafficAircraft
import app.wingtipmaps.android.api.name
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.flight.Traffic
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.live.DepartureLine
import app.wingtipmaps.android.ui.CardButtonGroup
import app.wingtipmaps.android.ui.CardPicture
import app.wingtipmaps.android.ui.Fact
import app.wingtipmaps.android.ui.Figure
import app.wingtipmaps.android.ui.GroupAction
import app.wingtipmaps.android.ui.PhotoCarousel
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.card.CardTab
import app.wingtipmaps.android.ui.card.CardTabBar
import app.wingtipmaps.android.ui.card.CardTabBarRoom
import app.wingtipmaps.android.ui.card.cardFoot
import app.wingtipmaps.android.ui.card.StatusBadge
import app.wingtipmaps.android.ui.card.rememberCardFoot
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage
import app.wingtipmaps.android.ui.card.Status as BadgeStatus

/**
 * An airplane heard and tapped on the map (the web's FlightCard), laid out
 * as the airport card's C1 (the owner, 2026-11-14: "make sure the airplane
 * card looks similar to airport card"): its callsign with what it is; Track,
 * which follows it (Tracking) and keeps it ringed on the map; its state
 * led by a badge -- an emergency's code (AIM 6-2-2, 6-3-4, 6-4-2, the
 * engine's squawk_meaning), In the air, or On the ground where it landed
 * (rules.md 9) -- and its altitude as ATC gives it, ground speed and
 * track; its facts in the sideways strip from its FAA record, the
 * traffic's type where there is none (AirplaneFacts); its photo and the
 * sketch of where it has flown as the picture tiles; then Info, first,
 * and Flights, its earlier ones, in the floating bar at the card's foot.
 * Seconds-old internet data from adsb.lol's receivers: for knowing what is
 * about, not for avoiding it (Traffic.credit, under Info).
 */
@Composable
fun TrackedFlightCard(hex: String, exit: CardExit, flight: FlightModel = hiltViewModel(), lookup: AirplaneLookup = hiltViewModel()) {
    val traffic = flight.traffic
    val tracking = flight.tracking
    val planes by traffic.planes.collectAsStateWithLifecycle()
    val marks by traffic.marks.collectAsStateWithLifecycle()
    val trafficProblem by traffic.problem.collectAsStateWithLifecycle()
    val watchProblem by tracking.problem.collectAsStateWithLifecycle()
    val tracked by tracking.hex.collectAsStateWithLifecycle()
    val source by traffic.source.collectAsStateWithLifecycle()
    val i = planes.indexOfFirst { it.hex.equals(hex, ignoreCase = true) }
    val plane = planes.getOrNull(i)
    LaunchedEffect(hex, plane?.registration) { lookup.heard(hex, plane?.registration) }
    val looked by lookup.state.collectAsStateWithLifecycle()
    val record = looked.record
    val name = plane?.name ?: record?.nNumber ?: hex.uppercase()
    val made = listOfNotNull(record?.manufacturer, record?.model).joinToString(" ").ifEmpty { null } ?: plane?.type
    var tab by rememberSaveable(hex) { mutableIntStateOf(0) }
    val foot = rememberCardFoot()
    val pad = Modifier.padding(horizontal = WingtipSpace.Lg)

    CardPage(title = name, exit = exit, subtitle = made) { padding ->
        Box(Modifier.padding(padding).fillMaxSize().cardFoot(foot)) {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = CardTabBarRoom), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
                ProblemLine(trafficProblem, pad)
                ProblemLine(watchProblem, pad)
                // Track is the card's one action, filled, where every card's
                // first action sits (CardButtonGroup).
                if (plane != null) {
                    val isTracked = tracked == hex.lowercase()
                    val trackWord = stringResource(if (isTracked) R.string.stop_tracking else R.string.track)
                    CardButtonGroup(listOf(GroupAction(trackWord, null, filled = true) { tracking.track(if (isTracked) null else hex, plane) }), pad.fillMaxWidth())
                }
                FlightState(plane, looked, lookup::squawkMeaning, pad)
                AirplaneFacts(AirplaneFactsSaid.of(record, looked.details?.model, type = plane?.type))
                FlightPictures(name, looked)
                if (tab == 0) {
                    Column(pad) {
                        marks.getOrNull(i)?.label?.takeIf { it.isNotEmpty() }?.let { Fact(stringResource(R.string.fact_height), it) }
                        // The tower's departure event, where TDES sent one.
                        DepartureLine(plane?.callsign ?: plane?.registration)
                    }
                    if (record != null) AirplaneInfo(looked)
                    Text(Traffic.credit(source), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = pad)
                } else {
                    AirplaneFlights(looked, name)
                }
            }
            CardTabBar(
                listOf(
                    CardTab(stringResource(R.string.airplane_tab_info)),
                    CardTab(stringResource(R.string.airplane_tab_flights), count = looked.flights?.size?.takeIf { it > 0 }),
                ),
                picked = tab,
                onPick = { tab = it },
                foot = foot,
                modifier = Modifier.align(Alignment.BottomCenter),
                tag = "flight-tab-bar",
            )
        }
    }
}

/**
 * Its state, led by the status a pilot scans for: heard now, an
 * emergency's code as its own badge with what it means, then In the air
 * with its altitude, ground speed and track; not heard, the N-number
 * card's line (on the ground where it landed, else when last heard).
 */
@Composable
private fun FlightState(plane: TrafficAircraft?, looked: AirplaneLookup.State, meaningOf: (String?) -> String?, modifier: Modifier) {
    if (plane == null) {
        StatusLine(statusLine(InAir.Ground, looked.flights).takeIf { looked.flights != null } ?: Status.Checking, modifier)
        return
    }
    val meaning = meaningOf(plane.squawk)
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm), verticalAlignment = Alignment.CenterVertically) {
        if (meaning != null) {
            StatusBadge(BadgeStatus.Emergency, words = plane.squawk)
            Text(meaning, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
        } else {
            StatusBadge(BadgeStatus.InAir)
        }
    }
    // Its figures at a glance, as the planner hears them, each its name
    // over it; a figure not heard is a dash.
    Row(modifier.fillMaxWidth()) {
        Figure(stringResource(R.string.fact_altitude), plane.altitudeFt?.let(Format::reportedAltitude) ?: Format.NONE)
        Figure(stringResource(R.string.fact_ground_speed), plane.speedKt?.let(Format::speed) ?: Format.NONE)
        Figure(stringResource(R.string.fact_track), plane.trackDeg?.let { "${Format.heading(it)} true" } ?: Format.NONE)
    }
}

/** Its photo where Planespotters has one, linked to its page as their
 *  terms ask, then the sketch of its newest flight. */
@Composable
private fun FlightPictures(name: String, looked: AirplaneLookup.State) {
    val photo = looked.photo?.let { p ->
        CardPicture(
            stringResource(R.string.airplane_photo_label, name),
            p.thumbnailLarge ?: p.thumbnail ?: p.link,
            stringResource(R.string.airplane_photo_by, p.photographer ?: "Planespotters.net"),
            link = p.link,
        )
    }
    val trail = looked.trail.orEmpty()
    val empty = when {
        looked.flightsProblem != null -> stringResource(R.string.flight_sketch_unread)
        looked.flights == null -> stringResource(R.string.info_fetching_flights)
        else -> stringResource(R.string.flight_sketch_none)
    }
    val sketch = CardPicture(stringResource(R.string.flight_sketch_label, name), "", drawn = { FlightSketch(trail.map { it.lat }, trail.map { it.lon }, empty) })
    PhotoCarousel(listOfNotNull(photo, sketch), Modifier.padding(vertical = WingtipSpace.Sm))
}
