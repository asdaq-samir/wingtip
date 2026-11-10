package app.wingtipmaps.android.strip

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.Session
import app.wingtipmaps.android.api.AssistantClient
import app.wingtipmaps.android.api.AssistantContext
import app.wingtipmaps.android.api.AssistantSource
import app.wingtipmaps.android.api.AssistantTurn
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.navigation.CardRequests
import app.wingtipmaps.android.navigation.Over
import app.wingtipmaps.android.navigation.OverRequests
import app.wingtipmaps.android.ready.ReadyToFlyRow
import app.wingtipmaps.android.ui.BriefModel
import app.wingtipmaps.android.ui.BriefSheet
import app.wingtipmaps.android.ui.LegSheet
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SourceSheet
import app.wingtipmaps.android.ui.sheet.MapSheet
import app.wingtipmaps.android.ui.sheet.rememberMapSheetState

/**
 * The strip layout: the map under Material's standard bottom sheet
 * (MapSheet: its peek or expanded), the sheet's one row at its foot the one search (OneSearch,
 * the root's `searchRow`) with its microphone and the account button, and over the field, when the sheet is
 * up, the flight as one strip in time -- the ribbon (StripRibbon), the
 * head with the Brief's verdict and at most three actions (StripHead,
 * BriefModel), and the timeline (stripList). In the air the ribbon
 * carries the airplane and the next checkpoint large (StripAir). The
 * screens the search and the account button open -- a field's card, the
 * airplane, Settings, Ask -- and a checkpoint's leg and the Brief are each
 * a sheet with a close that goes back one level (the root's).
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
    raise: Int = 0,
    model: StripModel = viewModel(),
    assistant: AssistantClient = viewModel(),
    brief: BriefModel = viewModel(),
) {
    val state by plan.state.collectAsStateWithLifecycle()
    val strip by model.state.collectAsStateWithLifecycle()
    val briefed by brief.state.collectAsStateWithLifecycle()
    val pilot by session.pilot.collectAsStateWithLifecycle()
    val fix by ownShip.fix.collectAsStateWithLifecycle()
    val conversation by assistant.conversation.collectAsStateWithLifecycle()
    val rows = remember(state.legs, state.dep, state.dest, state.stops) { StripData.rows(state) }
    val points = remember(rows) { StripData.ribbonPoints(rows) }
    val positionAsked = remember(state.course, state.legs, fix) {
        StripData.positionAlong(state.course?.courseLine.orEmpty(), state.legs, fix?.lat, fix?.lon)
    }
    val position = positionAsked.getOrNull()
    // Where the engine could not place the airplane on the route, the
    // field's row says so rather than the ribbon showing it nowhere.
    val positionProblem = positionAsked.exceptionOrNull()?.let { "Where the airplane is on the route failed: ${it.message}" }
    // When the flight leaves: the plan's time where it has one (Plan.setDepart,
    // a trip leg used), else now; the times down the strip are this plus
    // the planner's minutes.
    val leaveMs = remember(state.legs, state.depart) { Plan.departMs(state.depart) ?: System.currentTimeMillis() }
    var unfolded by rememberSaveable { mutableStateOf(false) }
    var source by remember { mutableStateOf<AssistantSource?>(null) }
    var briefOpen by rememberSaveable { mutableStateOf(false) }
    var leg by remember { mutableStateOf<StripRow.Checkpoint?>(null) }
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
    // Back at the pill with the answer's card open closes the card before
    // leaving the app; the sheet's own back lowers it first (MapSheet).
    BackHandler(enabled = answerShown) { dismissAnswer() }

    // The foot is the handle and the field's row; in the air the ribbon
    // and the next checkpoint too, since they are what is glanced at.
    val navigationBar = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val peek = (if (flying && rows.isNotEmpty()) StripAirPeek else WingtipSize.TapTarget * 2 + WingtipSpace.Lg + WingtipSpace.Xs) + navigationBar
    MapSheet(state = sheet, peek = peek, body = { Box(Modifier.fillMaxSize()) { map() } }) {
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
                        onAction = { briefOpen = true }, onBrief = { briefOpen = true },
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
                    onCheckpoint = { leg = it },
                    onClearance = { OverRequests.open(Over.Clearance) },
                )
            }
        }
    }

    // Ready to fly at the Brief's head; a route is typed in the field, so
    // its Plan the Route closes the Brief to the field.
    if (briefOpen) {
        BriefSheet(brief, state, signedIn = pilot != null, onClose = { briefOpen = false }) {
            ReadyToFlyRow(plan, onSetRoute = { briefOpen = false })
        }
    }
    leg?.let { row -> LegSheet(number = row.number, leg = row.leg, onClose = { leg = null }) }
    source?.let { shown -> SourceSheet(shown, onClose = { source = null }) }
}

/** The sheet's foot in the air: the field, the ribbon with the airplane
 *  and the next checkpoint large (StripAir). */
private val StripAirPeek = WingtipSize.TapTarget * 5 + WingtipSpace.Xl + WingtipSpace.Xs
