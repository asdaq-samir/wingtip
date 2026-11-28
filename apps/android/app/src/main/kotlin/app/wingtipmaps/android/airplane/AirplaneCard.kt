package app.wingtipmaps.android.airplane

import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SecondaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.checklist.ChecklistKind
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.registeredProfile
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.receiver.ReceiverHeard
import app.wingtipmaps.android.records.WatchKind
import app.wingtipmaps.android.search.SearchGroups
import app.wingtipmaps.android.ui.CardPicture
import app.wingtipmaps.android.ui.FlownAirplaneRows
import app.wingtipmaps.android.ui.PhotoCarousel
import app.wingtipmaps.android.ui.SheetPage
import app.wingtipmaps.android.ui.WingtipIcons
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage

/**
 * An airplane's card, built the Android way (the owner, 2026-11-09), and
 * the one airplane card everywhere (the card rule, 2026-11-10): the
 * search's Airplanes, the plan's Airplane, a link's `airplane`, Ready to
 * Fly's Pick an Airplane and the logbook's N-numbers all open this. Its
 * bar where the search was (CardPage) -- ← and its N-number (or type)
 * large, its type under it, shrinking as the card scrolls -- with Share
 * and ✕ (the web's CardTitle). An N-number's card has the web's four
 * buttons (AirplaneActionRow: Track or Fly This, Alerts, Favorite,
 * Figures; the owner, 2026-11-27: "Yes, match the web"), then Info and
 * Flights in a tab row, Info first; its figures a page of their own from
 * the fourth button (FiguresPage), at once where a figure was asked for.
 * The flown airplane's card and a type's keep their figures and
 * checklists as tabs, and Fly This Airplane as the extended floating
 * action button, which makes it the plan's airplane (FlyThis) and shows
 * the plan (`onFlown`). Opened with no N-number nor type, it is the
 * airplane flown now, with its picker, registration and the rest above
 * its figures (FlownAirplaneRows).
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun AirplaneCard(at: ProfileOpen.At, plan: Plan, exit: CardExit, onFlown: () -> Unit, onOpen: (SheetPage) -> Unit) {
    val context = LocalContext.current
    val own = rememberAirplaneOf(at.tail, plan, at.type)
    val flown = rememberAirplaneNow(plan)
    val books by AirplaneBook.profiles.collectAsStateWithLifecycle()
    var section by rememberSaveable(at) { mutableIntStateOf(0) }
    val flownCard = at.tail == null && at.type == null
    val name = own.name ?: stringResource(if (flownCard) R.string.airplane else R.string.profile_airplane)
    // An own airplane of no stock type keeps its checklists by its N-number.
    val checklistKey = own.aircraft.ifEmpty { own.base().key }
    val openChecklist: (ChecklistKind) -> Unit = { kind -> onOpen(SheetPage.Checklist(checklistKey, kind.name)) }
    // The checklist asked for by its name (OpenScreen) opens on this card's
    // stack; with no airplane picked there is none, and the card says so.
    val wanted by ScreenRequests.wanted.collectAsStateWithLifecycle()
    LaunchedEffect(wanted, own.name) {
        if (flownCard && own.name != null && ScreenRequests.take(setOf(Screen.CHECKLISTS)) != null) openChecklist(ChecklistKind.NORMAL)
    }

    // An N-number's card (the owner's P1, 2026-11-14): its FAA record
    // at once, the rest as it comes (AirplaneLookup).
    val lookup: AirplaneLookup = hiltViewModel()
    val looked by lookup.state.collectAsStateWithLifecycle()
    val tail = at.tail?.takeIf { SearchGroups.looksLikeTail(it) }
    // Its flights and history: the pilot's own always, another's while
    // Settings' Extras has Other Airplanes on, else neither offered nor
    // its flights fetched (OtherAirplanes).
    val history = rememberHistoryOffered(tail) || own.record != null
    LaunchedEffect(tail, history) { if (tail != null) lookup.open(tail, flights = history) }
    val record = looked.record.takeIf { tail != null }
    // The planner's book for its registered type (the engine's
    // registered_profile, the web's profileOfRegistered), none assumed.
    val stock = remember(record) { record?.let { Engine.registeredProfile(it.manufacturer, it.model, it.year?.toDouble()).getOrNull() } }
    // A registered airplane not the pilot's is shown, and flown, on its type's book.
    val airplane = if (tail != null && own.record == null && stock != null && own.aircraft.isEmpty()) {
        remember(tail, stock, books) { AirplaneNow.of(stock, tail, null, AirplaneBook.of(books, stock)) }
    } else {
        own
    }
    val type = (airplane.record?.type?.ifEmpty { null } ?: airplane.aircraft.ifEmpty { null })?.uppercase()
    val flying = FlyThis.isFlown(airplane, flown)
    val canFly = airplane.name != null && !flying
    // "Piper PA-28, 1971": its maker and model in a few words, the planner's
    // make_short and model_short (the engine's airplane_short_type), as the web's card.
    val line = record?.let { r -> listOfNotNull(listOfNotNull(r.makeShort, r.modelShort).joinToString(" ").ifEmpty { null }, r.year?.toString()).joinToString(", ").ifEmpty { null } }
    val fly: () -> Unit = {
        val choice = FlyThis.choice(airplane.tail, at.type ?: airplane.aircraft.ifEmpty { null }, airplane.record, books.keys)
        FlightChoices.of(context).setTail(choice.tail)
        plan.setAircraft(choice.aircraft)
        onFlown()
    }
    // Its figures a page of their own, opened from the fourth button, or at once for a figure asked for.
    var figures by rememberSaveable(at) { mutableStateOf(tail != null && (at.focus != null || at.figures)) }
    if (tail != null && figures) {
        FiguresPage(airplane, at.focus, name, CardExit(back = { figures = false }, close = exit.close)) { ChecklistRows(airplane.name != null, openChecklist) }
        return
    }
    val tabs = if (tail != null) listOfNotNull(R.string.airplane_tab_info, R.string.airplane_tab_flights.takeIf { history }) else listOf(R.string.profile_figures, R.string.checklists)

    CardPage(
        title = name,
        exit = exit,
        subtitle = line ?: type?.takeIf { it != name },
        // Share in the card's head, as the web's CardTitle, its close after it.
        actions = { if (tail != null) ShareAirplane(tail) },
        floatingActionButton = {
            // An N-number's card has Fly This among its buttons; the flown
            // airplane's and a type's keep it as the floating action.
            if (canFly && tail == null) {
                ExtendedFloatingActionButton(
                    onClick = fly,
                    icon = { Icon(WingtipIcons.airplane, contentDescription = null) },
                    text = { Text(stringResource(R.string.wording_fly_this_airplane)) },
                )
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            if (tail != null) {
                // Its photo, only where Planespotters.net answers, with its
                // photographer beside it (their terms).
                looked.photo?.let { p ->
                    val credit = stringResource(R.string.airplane_photo_by, p.photographer ?: "Planespotters.net")
                    // Its thumbnail leads back to the photo's page there (their terms).
                    PhotoCarousel(
                        listOf(CardPicture(tail, p.thumbnailLarge ?: p.thumbnail ?: p.link, credit, page = p.link, tapOpensPage = true)),
                        Modifier.padding(vertical = WingtipSpace.Xs),
                    )
                }
                val flyable = AirplaneRow.flyable(tail, stock, owned = own.record != null, flying = flying)
                AirplaneButtons(tail, looked, flyable, flying, fly, { figures = true }, Modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Xs))
            }
            SecondaryTabRow(selectedTabIndex = section.coerceAtMost(tabs.lastIndex), containerColor = Color.Transparent) {
                tabs.forEachIndexed { i, title ->
                    Tab(selected = section == i, onClick = { section = i }, text = { Text(stringResource(title)) })
                }
            }
            if (tail != null) {
                // The one status line under the tabs: in the air, else where
                // it last landed, else not heard (statusLine).
                val status = statusLine(looked.inAir, looked.flights)
                Text(
                    status.words(), style = MaterialTheme.typography.bodyMedium,
                    color = if (status.problem) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Xs),
                )
                // Heard by the cockpit's own receiver, not the internet's,
                // and how long ago.
                (looked.hex ?: looked.record?.modeSHex)?.let { hex ->
                    ReceiverHeard(hex, Modifier.padding(horizontal = WingtipSpace.Lg))
                }
            }
            val page = tabs.getOrNull(section) ?: tabs.first()
            when (page) {
                R.string.airplane_tab_flights -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) { AirplaneFlights(looked, name) }
                R.string.airplane_tab_info -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) { AirplaneInfo(looked, own = own.record != null, history = history) }
                R.string.profile_figures -> AirplaneProfileScreen(airplane, at.focus) {
                    if (flownCard) FlownAirplaneRows(plan, onYourAirplanes = { onOpen(SheetPage.YourAirplanes) })
                }
                else -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) { ChecklistRows(airplane.name != null, openChecklist) }
            }
        }
    }
}

/** An airplane's figures, a page of their own over its card (the web's
 *  FiguresCard): its ← back to the airplane, every figure edited in
 *  place, its checklists over them. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterial3ExpressiveApi::class)
@Composable
private fun FiguresPage(airplane: AirplaneNow, focus: String?, name: String, exit: CardExit, under: @Composable () -> Unit) {
    BackHandler(onBack = exit.back)
    CardPage(title = stringResource(R.string.profile_figures), exit = exit, subtitle = name) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) { AirplaneProfileScreen(airplane, focus) { under() } }
    }
}

/** Share, in the card's head: its link. */
@Composable
private fun ShareAirplane(tail: String) {
    val context = LocalContext.current
    val shareTitle = stringResource(R.string.share_airplane)
    IconButton(onClick = {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, "${Config.gateway}/app/plan?airplane=$tail")
        }
        context.startActivity(Intent.createChooser(send, shareTitle))
    }) { Icon(WingtipIcons.share, contentDescription = shareTitle) }
}

/** An N-number's four buttons (AirplaneActionRow): Track while it is in
 *  the air (the map keeps it in sight, Tracking), else Fly This; Alerts
 *  as it takes off and lands (Tracking's watches, by its ICAO address);
 *  Favorite; Figures. */
@Composable
private fun AirplaneButtons(tail: String, looked: AirplaneLookup.State, flyable: Boolean, flying: Boolean, fly: () -> Unit, openFigures: () -> Unit, modifier: Modifier) {
    val tracking = hiltViewModel<FlightModel>().tracking
    val favorites by tracking.favorites.collectAsStateWithLifecycle()
    val watches by tracking.watches.collectAsStateWithLifecycle()
    val tracked by tracking.hex.collectAsStateWithLifecycle()
    val follow by tracking.follow.collectAsStateWithLifecycle()
    val hex = looked.hex ?: looked.record?.modeSHex?.lowercase()
    val what = looked.record?.let { listOfNotNull(it.manufacturer, it.model).joinToString(" ") }
    val inAir = looked.inAir as? InAir.Flying
    val alerting = hex != null && watches.any { it.hex == hex }
    val shown = AirplaneRowState(following = inAir != null && follow && tracked == inAir.hex.lowercase(), alerting = alerting, starred = hex != null && favorites.any { it.hex == hex })
    val can = AirplaneRow.Can(airborne = inAir != null, trackable = inAir != null, flyable = flyable, flying = flying, hex = hex, keepable = hex != null)
    AirplaneActionRow(
        can, shown,
        onTrack = { on ->
            if (inAir != null) {
                tracking.track(inAir.hex)
                tracking.follow.value = on
            }
        },
        onFly = fly,
        onAlerts = { if (hex != null) WatchKind.entries.forEach { kind -> if (tracking.watching(hex, kind) == alerting) tracking.toggleWatch(hex, tail, kind) } },
        onFavorite = { if (hex != null) tracking.toggleFavorite(hex, tail, what) },
        onFigures = openFigures,
        modifier = modifier,
    )
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
