package app.wingtipmaps.android.strip

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.Session
import app.wingtipmaps.android.api.AskScreenModel
import app.wingtipmaps.android.api.AssistantSource
import app.wingtipmaps.android.api.AssistantTurn
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.navigation.CardRequests
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.ui.BriefModel
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SheetPage
import app.wingtipmaps.android.ui.SourceDialog
import app.wingtipmaps.android.ui.sheet.MapSheet
import app.wingtipmaps.android.ui.sheet.halfWindow
import app.wingtipmaps.android.ui.sheet.rememberMapSheetState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map

/**
 * The strip layout: the map under Material's standard bottom sheet
 * (MapSheet: its peek or expanded), the sheet's one row at its foot the one search (OneSearch,
 * the root's `searchRow`) with its microphone and the account button, and over the field, when the sheet is
 * up, the flight as one strip in time -- the ribbon (StripRibbon), the
 * head with the Brief's verdict and at most three actions (StripHead,
 * BriefModel), and the timeline (stripList). In the air the ribbon
 * carries the airplane and the next checkpoint large (StripAir). The
 * cards and pages the search, the account button, a checkpoint and the
 * verdict open -- a field, the airplane, a leg, Settings, the Brief, Ask --
 * take the search's and the strip's place in this sheet, the same cards
 * as the plan's sheet shows (`cards`, the root's stack), ← and Back
 * closing each in turn.
 *
 * Mounted by the root beside the plan's sheet as a switch: the root owns
 * the map, own ship, the search and the permission asks, and hands them
 * here.
 */
@Composable
fun StripLayout(
    plan: Plan,
    session: Session,
    ownShip: OwnShip,
    flying: Boolean,
    map: @Composable () -> Unit,
    searchRow: @Composable (problem: String?) -> Unit,
    covered: Boolean,
    cards: @Composable (Modifier) -> Unit,
    raise: Int = 0,
    model: StripModel = hiltViewModel(),
    assistant: AskScreenModel = hiltViewModel(),
    brief: BriefModel = hiltViewModel(),
) {
    val state by plan.state.collectAsStateWithLifecycle()
    val strip by model.state.collectAsStateWithLifecycle()
    val briefed by brief.state.collectAsStateWithLifecycle()
    val pilot by session.pilot.collectAsStateWithLifecycle()
    val conversation by assistant.conversation.collectAsStateWithLifecycle()
    val rows = remember(state.legs, state.dep, state.dest, state.stops) { StripData.rows(state) }
    val points = remember(rows) { StripData.ribbonPoints(rows) }
    // Where the airplane is on the route, asked of the engine once a fix
    // off the main thread; the strip is drawn again only when the answer
    // changes, not at every fix.
    val positionAsked by remember(ownShip, state.course, state.legs) {
        val line = state.course?.courseLine.orEmpty()
        ownShip.fix.map { fix -> StripData.positionAlong(line, state.legs, fix?.lat, fix?.lon) }.distinctUntilChanged().flowOn(Dispatchers.Default)
    }.collectAsStateWithLifecycle(Result.success(null))
    val position = positionAsked.getOrNull()
    // Where the engine could not place the airplane on the route, the
    // field's row says so rather than the ribbon showing it nowhere.
    val positionProblem = positionAsked.exceptionOrNull()?.let { "Where the airplane is on the route failed: ${it.message}" }
    // When the flight leaves: the plan's time where it has one (Plan.setDepart,
    // a trip leg used), else now; the times down the strip are this plus
    // the planner's minutes.
    val leaveMs = remember(state.legs, state.depart) { Plan.departMs(state.depart) ?: AppClock.nowMs() }
    var unfolded by rememberSaveable { mutableStateOf(false) }
    var source by remember { mutableStateOf<AssistantSource?>(null) }
    val verdict = briefed.verdict.takeIf { state.routed }

    // The fields' cards for the chips, asked once each; the Brief once
    // the nav log is whole.
    LaunchedEffect(state.dep, state.dest, state.stops) {
        if (state.routed) model.loadFields(listOf(state.dep) + state.stops + state.dest)
    }
    LaunchedEffect(state.totals, state.planning) { brief.brief(state) }

    val sheet = rememberMapSheetState()
    // The sheet up from its foot once a line is done, as the web's sheet
    // comes up from the pill (fieldLine's `up`).
    LaunchedEffect(strip.done) {
        if (strip.done > 0 && sheet.atPeek) sheet.expand()
    }
    // And when the welcome ends into a flight (`raise` bumped by the root):
    // the sample's strip, or "Where to?" over the field.
    LaunchedEffect(raise) {
        if (raise > 0 && sheet.atPeek) sheet.expand()
    }

    val ask = conversation.turns.lastOrNull()?.takeIf { it.role == AssistantTurn.Role.ASSISTANT }
    val answerShown = ask != null && strip.answerShown
    val dismissAnswer = { assistant.clear(); model.dismissAnswer() }
    // The foot is the handle and the field's row; in the air the ribbon
    // and the next checkpoint too, since they are what is glanced at.
    val navigationBar = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val foot = (if (flying && rows.isNotEmpty()) StripAirPeek else WingtipSize.TapTarget * 2 + WingtipSpace.Lg + WingtipSpace.Xs) + navigationBar
    // A card opens at half, its peek while it is open, and grows when pulled up.
    val peek = if (covered) halfWindow() else foot
    MapSheet(state = sheet, peek = peek, lowerOnBack = !covered, body = { Box(Modifier.fillMaxSize()) { map() } }) {
        // A card takes the search's and the strip's place, as on the plan's
        // sheet (the root's cards: the sheet's own stack, SheetCard).
        cards(if (covered) Modifier.weight(1f).padding(bottom = navigationBar) else Modifier.height(0.dp))
        if (covered) return@MapSheet
        // The one search, the root's (OneSearch), as the plan's sheet has it.
        searchRow(positionProblem)
        if (flying && rows.isNotEmpty()) {
            StripAir(state = state, rows = rows, position = position)
        } else {
            StripRibbon(state = state, verdict = verdict, points = points, position = position)
        }
        LazyColumn(
            Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(top = WingtipSpace.Sm, bottom = WingtipSpace.Xl + navigationBar),
            verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
        ) {
            if (ask != null && answerShown) {
                item(key = "answer") {
                    AnswerCard(
                        turn = ask, answering = conversation.answering, status = conversation.status,
                        onStop = assistant::cancel, onClose = dismissAnswer,
                        onSource = { source = it }, modifier = Modifier.padding(horizontal = WingtipSpace.Lg),
                    )
                }
            }
            if (!state.routed || state.course == null) {
                item(key = "welcome") { StripWelcome(Modifier.padding(horizontal = WingtipSpace.Lg)) }
            } else {
                item(key = "head") {
                    StripHead(
                        verdict = verdict, line = StripData.headLine(state), actions = briefed.actions, ways = emptyList(), wayKey = null, onWay = {},
                        onAction = { ScreenRequests.ask(Screen.BRIEF) }, onBrief = { ScreenRequests.ask(Screen.BRIEF) },
                        problem = briefed.problem, modifier = Modifier.padding(horizontal = WingtipSpace.Lg),
                    )
                }
                state.stage?.let { stage ->
                    item(key = "stage") {
                        Row(Modifier.padding(horizontal = WingtipSpace.Lg), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                            Loading(Modifier.size(WingtipSpace.Lg))
                            Text(stage, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
            state.problem?.let { why -> item(key = "problem") { ProblemLine(why, Modifier.padding(horizontal = WingtipSpace.Lg)) } }
            if (state.routed && state.course != null) {
                stripList(
                    rows = rows, cards = strip.cards, leaveMs = leaveMs,
                    departDetail = emptyList(), arriveDetail = emptyList(),
                    unfolded = unfolded, onUnfold = { unfolded = true },
                    onField = { CardRequests.open(MapPick.Airport(it)) },
                    onCheckpoint = { row -> state.legs.indexOf(row.leg).takeIf { it >= 0 }?.let { CardRequests.open(MapPick.RouteLeg(it)) } },
                    onClearance = { CardRequests.open(SheetPage.Clearance) },
                )
            }
        }
    }

    source?.let { shown -> SourceDialog(shown, onClose = { source = null }) }
}

/** The sheet's foot in the air: the field, the ribbon with the airplane
 *  and the next checkpoint large (StripAir). */
private val StripAirPeek = WingtipSize.TapTarget * 5 + WingtipSpace.Xl + WingtipSpace.Xs
