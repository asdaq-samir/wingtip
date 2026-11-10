package app.wingtipmaps.android.airplane

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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.checklist.ChecklistKind
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.ui.FlownAirplaneRows
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
 * large, its type under it, shrinking as the card scrolls -- with ✕; its
 * sections in a tab row, its figures (AirplaneProfileScreen: each with
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

    CardPage(
        title = name,
        exit = exit,
        subtitle = type?.takeIf { it != name },
        floatingActionButton = {
            if (canFly) {
                ExtendedFloatingActionButton(
                    onClick = {
                        val choice = FlyThis.choice(airplane.tail, at.type ?: airplane.aircraft.ifEmpty { null }, airplane.record, books.keys)
                        FlightChoices.of(context).setTail(choice.tail)
                        plan.setAircraft(choice.aircraft)
                        onFlown()
                    },
                    icon = { Icon(WingtipIcons.airplane, contentDescription = null) },
                    text = { Text(stringResource(R.string.fly_this_airplane)) },
                )
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            SecondaryTabRow(selectedTabIndex = section, containerColor = Color.Transparent) {
                listOf(R.string.profile_figures, R.string.checklists).forEachIndexed { i, title ->
                    Tab(selected = section == i, onClick = { section = i }, text = { Text(stringResource(title)) })
                }
            }
            if (section == 0) {
                AirplaneProfileScreen(airplane, at.focus) {
                    if (flownCard) FlownAirplaneRows(plan, onYourAirplanes = { onOpen(SheetPage.YourAirplanes) })
                }
            } else {
                // Scrolls like the figures, so no row is out of reach at a
                // large text size (the scrolling rule, 2026-11-10).
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) { ChecklistRows(airplane.name != null, openChecklist) }
            }
        }
    }
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
