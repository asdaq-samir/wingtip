package app.wingtipmaps.android.airplane

import android.content.Intent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.AirplanePhoto
import app.wingtipmaps.android.checklist.ChecklistKind
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.records.WatchKind
import app.wingtipmaps.android.search.SearchGroups
import app.wingtipmaps.android.ui.CardButtonGroup
import app.wingtipmaps.android.ui.CardPicture
import app.wingtipmaps.android.ui.FlownAirplaneRows
import app.wingtipmaps.android.ui.GroupAction
import app.wingtipmaps.android.ui.PhotoCarousel
import app.wingtipmaps.android.ui.SheetPage
import app.wingtipmaps.android.ui.WingtipIcons
import app.wingtipmaps.android.ui.card.CardTab
import app.wingtipmaps.android.ui.card.CardTabBar
import app.wingtipmaps.android.ui.card.CardTabBarRoom
import app.wingtipmaps.android.ui.card.rememberCardFoot
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage

/**
 * An airplane's card, built the Android way (the owner, 2026-11-09), and
 * the one airplane card everywhere (the card rule, 2026-11-10): the
 * search's Airplanes, the plan's Airplane, a link's `airplane`, Ready to
 * Fly's Pick an Airplane and the logbook's N-numbers all open this. Its
 * bar where the search was (CardPage) -- ← and its N-number (or type)
 * large, its type under it, shrinking as the card scrolls -- with ✕; an
 * N-number's buttons, status line, fact strip and photo tile under it, as
 * the airport card's C1; its pages in the floating bar at the card's foot
 * (CardTabBar): Flights, Info and Figures for an N-number, its figures (AirplaneProfileScreen: each with
 * where it comes from, a tap to edit in place) and its checklists, each
 * opened on the card's own stack (`onOpen`); and Fly This Airplane as the
 * extended floating action button, which makes it the plan's airplane
 * (FlyThis) and shows the plan (`onFlown`). Not offered on the airplane
 * flown already, nor with no airplane to fly. Opened with no N-number nor
 * type, it is the airplane flown now, with its picker, registration and
 * the rest above its figures (FlownAirplaneRows).
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun AirplaneCard(at: ProfileOpen.At, plan: Plan, exit: CardExit, onFlown: () -> Unit, onOpen: (SheetPage) -> Unit) {
    val context = LocalContext.current
    val airplane = rememberAirplaneOf(at.tail, plan, at.type)
    val flown = rememberAirplaneNow(plan)
    val books by AirplaneBook.profiles.collectAsStateWithLifecycle()
    var section by rememberSaveable(at) { mutableIntStateOf(0) }
    val flownCard = at.tail == null && at.type == null
    val name = airplane.name ?: stringResource(if (flownCard) R.string.airplane else R.string.profile_airplane)
    val type = (airplane.record?.type?.ifEmpty { null } ?: airplane.aircraft.ifEmpty { null })?.uppercase()
    val canFly = airplane.name != null && !FlyThis.isFlown(airplane, flown)
    // An own airplane of no stock type keeps its checklists by its N-number.
    val checklistKey = airplane.aircraft.ifEmpty { airplane.base().key }
    val openChecklist: (ChecklistKind) -> Unit = { kind -> onOpen(SheetPage.Checklist(checklistKey, kind.name)) }
    // The checklist asked for by its name (OpenScreen) opens on this card's
    // stack; with no airplane picked there is none, and the card says so.
    val wanted by ScreenRequests.wanted.collectAsStateWithLifecycle()
    LaunchedEffect(wanted, airplane.name) {
        if (flownCard && airplane.name != null && ScreenRequests.take(setOf(Screen.CHECKLISTS)) != null) openChecklist(ChecklistKind.NORMAL)
    }

    // An N-number's card (the owner's P1, 2026-11-14): its FAA record
    // at once, the rest as it comes (AirplaneLookup).
    val lookup: AirplaneLookup = hiltViewModel()
    val looked by lookup.state.collectAsStateWithLifecycle()
    val tail = at.tail?.takeIf { SearchGroups.looksLikeTail(it) }
    LaunchedEffect(tail) { if (tail != null) lookup.open(tail) }
    val record = looked.record.takeIf { tail != null }
    val line = record?.let { r -> listOfNotNull(listOfNotNull(r.manufacturer, r.model).joinToString(" ").ifEmpty { null }, r.year?.toString()).joinToString(", ").ifEmpty { null } }
    val fly: () -> Unit = {
        val choice = FlyThis.choice(airplane.tail, at.type ?: airplane.aircraft.ifEmpty { null }, airplane.record, books.keys)
        FlightChoices.of(context).setTail(choice.tail)
        plan.setAircraft(choice.aircraft)
        onFlown()
    }
    val tabs = if (tail != null) listOf(R.string.airplane_tab_flights, R.string.airplane_tab_info, R.string.profile_figures) else listOf(R.string.profile_figures, R.string.checklists)

    val foot = rememberCardFoot()
    CardPage(
        title = name,
        exit = exit,
        subtitle = line ?: type?.takeIf { it != name },
        floatingActionButton = {
            // An N-number's card has Fly This among its buttons; the flown
            // airplane's and a type's keep it as the floating action.
            if (canFly && tail == null) {
                ExtendedFloatingActionButton(
                    onClick = fly,
                    icon = { Icon(WingtipIcons.airplane, contentDescription = null) },
                    text = { Text(stringResource(R.string.fly_this_airplane)) },
                )
            }
        },
    ) { padding ->
        // An N-number's head, laid out as the airport card's C1 (the owner,
        // 2026-11-14: "make sure the airplane card looks similar to airport
        // card"): its four buttons, its status line, its facts in a sideways
        // strip, its photo as a picture tile; then the page picked, in the
        // same scroll, under the floating bar.
        val top: @Composable ColumnScope.() -> Unit = {
            if (tail != null) {
                AirplaneButtons(tail, looked, canFly, fly, Modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Xs))
                // In the air, else where it last landed, else not heard (statusLine).
                StatusLine(statusLine(looked.inAir, looked.flights), Modifier.padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Xs))
                AirplaneFacts(AirplaneFactsSaid.of(record, looked.details?.model))
                AirplanePhotoTile(name, looked.photo)
            }
        }
        val pageRoom = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = CardTabBarRoom)
        Box(foot.frame(Modifier.padding(padding).fillMaxSize())) {
            val page = tabs.getOrNull(section) ?: tabs.first()
            when (page) {
                R.string.airplane_tab_flights -> Column(pageRoom) { top(); AirplaneFlights(looked, name) }
                R.string.airplane_tab_info -> Column(pageRoom) { top(); AirplaneInfo(looked) }
                R.string.profile_figures -> AirplaneProfileScreen(airplane, at.focus, bottom = CardTabBarRoom, top = top) {
                    if (flownCard) FlownAirplaneRows(plan, onYourAirplanes = { onOpen(SheetPage.YourAirplanes) })
                    // An N-number's card has its checklists under its figures.
                    if (tail != null) ChecklistRows(airplane.name != null, openChecklist)
                }
                else -> Column(pageRoom) { top(); ChecklistRows(airplane.name != null, openChecklist) }
            }
            CardTabBar(
                tabs.map { t -> CardTab(stringResource(t), count = looked.flights?.size?.takeIf { t == R.string.airplane_tab_flights && it > 0 }) },
                picked = section.coerceAtMost(tabs.lastIndex),
                onPick = { section = it },
                foot = foot,
                modifier = Modifier.align(Alignment.BottomCenter),
                tag = "airplane-tab-bar",
            )
        }
    }
}

/** Its Planespotters.net photo as the card's picture tile, a tap to its
 *  page there and its photographer named on it, as their terms ask. */
@Composable
private fun AirplanePhotoTile(name: String, photo: AirplanePhoto?) {
    val p = photo ?: return
    val credit = stringResource(R.string.airplane_photo_by, p.photographer ?: "Planespotters.net")
    val label = stringResource(R.string.airplane_photo_label, name)
    PhotoCarousel(listOf(CardPicture(label, p.thumbnailLarge ?: p.thumbnail ?: p.link, credit, link = p.link)), Modifier.padding(vertical = WingtipSpace.Sm))
}

/** An N-number's buttons, the four of the owner's P1 in a button group:
 *  Fly This (where it is not flown already), Follow (alerts as it takes
 *  off and lands, Tracking's watches), Favorite and Share (its link). */
@Composable
private fun AirplaneButtons(tail: String, looked: AirplaneLookup.State, canFly: Boolean, fly: () -> Unit, modifier: Modifier) {
    val context = LocalContext.current
    val shareTitle = stringResource(R.string.share_airplane)
    val tracking = hiltViewModel<FlightModel>().tracking
    val favorites by tracking.favorites.collectAsStateWithLifecycle()
    val watches by tracking.watches.collectAsStateWithLifecycle()
    val hex = looked.hex ?: looked.record?.modeSHex?.lowercase()
    val what = looked.record?.let { listOfNotNull(it.manufacturer, it.model).joinToString(" ") }
    val starred = hex != null && favorites.any { it.hex == hex }
    val following = hex != null && watches.any { it.hex == hex }
    val items = buildList {
        if (canFly) add(GroupAction(stringResource(R.string.fly_this_airplane), WingtipIcons.airplane, filled = true, onClick = fly))
        add(
            GroupAction(stringResource(if (following) R.string.airplane_unfollow else R.string.airplane_follow), null, enabled = hex != null, checked = following) {
                if (hex != null) WatchKind.entries.forEach { kind -> if (tracking.watching(hex, kind) == following) tracking.toggleWatch(hex, tail, kind) }
            },
        )
        add(GroupAction(stringResource(R.string.action_favorite), if (starred) Icons.Filled.Star else Icons.Outlined.StarOutline, enabled = hex != null, checked = starred) {
            if (hex != null) tracking.toggleFavorite(hex, tail, what)
        })
        add(GroupAction(stringResource(R.string.share), null) {
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, "${Config.gateway}/app/plan?airplane=$tail")
            }
            context.startActivity(Intent.createChooser(send, shareTitle))
        })
    }
    CardButtonGroup(items, modifier)
}

/** The airplane's checklists, normal and emergency, each opened on the
 *  card's stack; none with no airplane picked. */
@Composable
private fun ChecklistRows(enabled: Boolean, onOpen: (ChecklistKind) -> Unit) {
    ChecklistKind.entries.forEach { kind ->
        val normal = kind == ChecklistKind.NORMAL
        ListItem(
            onClick = { onOpen(kind) },
            enabled = enabled,
            supportingContent = { Text(stringResource(if (normal) R.string.checklist_normal_line else R.string.checklist_emergency_line), color = MaterialTheme.colorScheme.onSurfaceVariant) },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            modifier = Modifier.fillMaxWidth(),
            content = { Text(stringResource(if (normal) R.string.checklist_normal else R.string.checklist_emergency)) },
        )
    }
}
