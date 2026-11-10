package app.wingtipmaps.android.airplane

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeFlexibleTopAppBar
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SecondaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.checklist.ChecklistKind
import app.wingtipmaps.android.checklist.ChecklistScreen
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.ui.WingtipIcons
import app.wingtipmaps.android.ui.sheet.WingtipSheet

/**
 * An airplane's card, built the Android way (the owner, 2026-11-09):
 * Material's large flexible top app bar -- its N-number (or type) large,
 * its type under it, shrinking as the card scrolls -- with its close; its
 * sections in a tab row, its figures (AirplaneProfileScreen: each with
 * where it comes from, a tap to edit) and its checklists; and Fly This
 * Airplane as the extended floating action button, which makes it the
 * plan's airplane (FlyThis) and shows the plan (`onFlown`). Not offered on
 * the airplane flown already, nor with no airplane to fly.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun AirplaneCard(at: ProfileOpen.At, plan: Plan, onClose: () -> Unit, onFlown: () -> Unit) {
    val context = LocalContext.current
    val airplane = rememberAirplaneOf(at.tail, plan, at.type)
    val flown = rememberAirplaneNow(plan)
    val books by AirplaneBook.profiles.collectAsStateWithLifecycle()
    val scroll = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    var section by rememberSaveable(at) { mutableIntStateOf(0) }
    var checklist by remember { mutableStateOf<ChecklistKind?>(null) }
    val name = airplane.name ?: stringResource(R.string.profile_airplane)
    val type = (airplane.record?.type?.ifEmpty { null } ?: airplane.aircraft.ifEmpty { null })?.uppercase()
    val canFly = airplane.name != null && !FlyThis.isFlown(airplane, flown)

    Scaffold(
        modifier = Modifier.fillMaxSize().nestedScroll(scroll.nestedScrollConnection),
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0),
        topBar = {
            LargeFlexibleTopAppBar(
                title = { Text(name) },
                subtitle = type?.takeIf { it != name }?.let { t -> { Text(t) } },
                // Close at the end, as every level's title row has it
                // (decision 0015), never a back arrow at the start.
                actions = { IconButton(onClick = onClose) { Icon(WingtipIcons.close, contentDescription = stringResource(R.string.close)) } },
                windowInsets = WindowInsets(0),
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
                scrollBehavior = scroll,
            )
        },
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
                AirplaneProfileScreen(airplane, at.focus)
            } else {
                ChecklistKind.entries.forEach { kind ->
                    val normal = kind == ChecklistKind.NORMAL
                    ListItem(
                        supportingContent = { Text(stringResource(if (normal) R.string.checklist_normal_line else R.string.checklist_emergency_line), color = MaterialTheme.colorScheme.onSurfaceVariant) },
                        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                        modifier = Modifier.fillMaxWidth().clickable(enabled = airplane.name != null, role = Role.Button) { checklist = kind },
                        content = { Text(stringResource(if (normal) R.string.checklist_normal else R.string.checklist_emergency)) },
                    )
                }
            }
        }
    }
    checklist?.let { kind ->
        // An own airplane of no stock type keeps its checklists by its N-number.
        val key = airplane.aircraft.ifEmpty { airplane.base().key }
        WingtipSheet(title = stringResource(R.string.checklists_of, key.uppercase()), onClose = { checklist = null }, full = true) {
            ChecklistScreen(airplane = key, kind = kind, modifier = Modifier.padding(bottom = WingtipSpace.Xl))
        }
    }
}
