package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.clearText
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.FilledIconToggleButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.SuggestionChipDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.FuelStopSuggestion
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.plan.PlanProcedures
import app.wingtipmaps.android.plan.PlanTanks
import app.wingtipmaps.android.plan.RouteFieldFacts
import app.wingtipmaps.android.plan.RouteProcedures
import app.wingtipmaps.android.route.RoutePointMenu
import app.wingtipmaps.android.route.RoutePoints
import app.wingtipmaps.android.route.TypedRoute
import app.wingtipmaps.android.route.addFuelStops
import app.wingtipmaps.android.route.clearRoute
import app.wingtipmaps.android.route.hasPoints
import app.wingtipmaps.android.route.typeRoute
import kotlinx.coroutines.launch

/**
 * The route as ForeFlight's is, the web's route box (RouteBox, RouteToken;
 * the owner's canvas A, 2026-11-23): one box, every point of the route a
 * plain filled pill in the order flown, its ident alone, wrapping over as
 * many lines as it takes with no arrows, the box as tall as its pills and
 * no taller. A tap on a pill is its menu, the timeline's own (RoutePointMenu:
 * its card, Direct To, Hold, Add a Stop After, Move, Remove). A field NASR
 * lists closed is a red pill said Closed (decision 0043); a flight leaving a
 * point short of fuel with no stop offered is a "!" on its pill (14 CFR
 * 91.151(a), 91.167(a); warn, never limit); a flight's suggested fuel stops
 * are one pill after its departure, "+3 fuel stops", a tap putting them in.
 * After the last pill the field: what is typed there is read by the engine
 * (TypedRoute) and goes on at the route's end, a whole route on an empty box,
 * a SID or STAR typed among the points picked as the route's procedure and a
 * level group's cruise the plan's; while the route is not yet whole, a ✕
 * after it clears what there is.
 * At its lower right the round toggle back to the grouped list, where the
 * list has it (TypeRouteToggle), so it stays under the finger.
 */
@Composable
fun RouteBox(
    plan: Plan,
    state: Plan.State,
    onAddStopAfter: (String) -> Unit,
    onToggle: () -> Unit,
    model: RouteFieldFacts = hiltViewModel(),
    procedures: RouteProcedures = hiltViewModel(),
) {
    val facts by model.facts.collectAsStateWithLifecycle()
    val picks by PlanProcedures.state.collectAsStateWithLifecycle()
    val points = (listOf(state.dep) + state.stops + state.dest).filter { it.isNotEmpty() }
    LaunchedEffect(points) { model.load(points) }
    val field = rememberTextFieldState()
    // What went wrong with the last typing, said under the box where it was
    // typed: the words the engine could not read, or the typed procedures
    // neither end publishes.
    var said by remember { mutableStateOf<Pair<String, TypedRoute.Outcome>?>(null) }
    val focus = remember { FocusRequester() }
    // Turned to before the route is whole, the field is what the pilot came
    // for: its keyboard up at once, as the web focuses it in the tap.
    LaunchedEffect(Unit) { if (!state.routed) focus.requestFocus() }
    val read = {
        val text = field.text.toString()
        if (text.isNotBlank()) {
            field.clearText()
            // On the plan's own scope, so typing read as the toggle turns the
            // box back to the list is not dropped with the box.
            plan.viewModelScope.launch {
                val outcome = plan.typeRoute(text, procedures::listed)
                said = if (outcome == TypedRoute.Outcome.Done) null else text.trim() to outcome
                // Words unread, and procedures not yet checked, stay in the box to be read again.
                outcome.again(text)?.let { field.setTextAndPlaceCursorAtEnd(it) }
            }
        }
    }
    Surface(
        Modifier.fillMaxWidth(),
        shape = ListItemDefaults.segmentedShapes(index = 0, count = 1).shape,
        color = ListItemDefaults.segmentedColors().containerColor,
    ) {
        Column(Modifier.padding(start = WingtipSpace.Lg, end = WingtipSpace.Lg, top = WingtipSpace.Sm)) {
            FlowRow(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
                verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
                itemVerticalAlignment = Alignment.CenterVertically,
            ) {
                points.forEachIndexed { i, ident ->
                    val closed = facts[ident.uppercase()]?.closed == true
                    // A field's procedures once, at its first pill: those it is
                    // landed by before it, those it is left by after it, as
                    // they are flown (the web's RouteToken). A tap is the list's
                    // face, where the procedure's own rows and menu are.
                    val first = points.indexOfFirst { it.equals(ident, ignoreCase = true) } == i
                    if (first) PlanProcedures.at(picks, ident, PlanProcedures.ARRIVING).forEach { ProcedurePill(it, onToggle) }
                    RoutePointMenu(ident, plan, onAddStopAfter, anchor = { open -> RoutePill(ident, closed, shortFrom(state, ident), open) })
                    if (first) PlanProcedures.at(picks, ident, PlanProcedures.LEAVING).forEach { ProcedurePill(it, onToggle) }
                    fuelFold(state, ident, points.getOrNull(i + 1))?.let { flight -> FuelFold(flight) { plan.addFuelStops(flight) } }
                }
                RouteField(field, empty = points.isEmpty(), focus = focus, onDone = read, modifier = Modifier.weight(1f).widthIn(min = WingtipSpace.Xxl * 3))
                // Half a route cleared by the stock ✕ at the box's end (the
                // web's onClear, the owner, 2026-11-18); a whole route is
                // cleared by the plan's own ✕. Undone from its Snackbar.
                if (state.hasPoints && !state.routed) {
                    IconButton(onClick = { plan.clearRoute() }) { Icon(WingtipIcons.close, contentDescription = stringResource(R.string.route_box_clear)) }
                }
            }
            said?.let { (text, outcome) -> ProblemLine(saidWords(text, outcome)) }
            // The toggle's own row under the last line, never over a pill.
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TypeRouteToggle(typing = true) {
                    read()
                    onToggle()
                }
            }
        }
    }
}

/** The typing's trouble in words: the web's and the iPhone's. */
@Composable
private fun saidWords(text: String, outcome: TypedRoute.Outcome): String = when (outcome) {
    is TypedRoute.Outcome.Missed -> pluralStringResource(R.plurals.route_box_missed, outcome.names.size, outcome.names.joinToString(" and "), outcome.dep, outcome.dest) + outcome.unchecked.takeIf { it.isNotEmpty() }?.let { " " + stringResource(R.string.route_box_unchecked, it.joinToString(" and "), outcome.dep, outcome.dest) }.orEmpty()
    is TypedRoute.Outcome.Unchecked -> stringResource(R.string.route_box_unchecked, outcome.names.joinToString(" and "), outcome.dep, outcome.dest)
    else -> stringResource(R.string.route_box_unread, text)
}

/** The round tinted toggle between the grouped list and the route box (the
 *  web's TypeRouteButton, route-type-open): Material's filled icon toggle,
 *  on the tint's wash on the list's face and filled in it on the box's;
 *  its 48-dp area Material's own. */
@Composable
fun TypeRouteToggle(typing: Boolean, onToggle: () -> Unit) {
    val ink = MaterialTheme.colorScheme
    val colors = IconButtonDefaults.filledIconToggleButtonColors(containerColor = ink.secondaryContainer, contentColor = ink.primary)
    FilledIconToggleButton(checked = typing, onCheckedChange = { onToggle() }, colors = colors) {
        Icon(WingtipIcons.typeRoute, contentDescription = stringResource(R.string.route_box_toggle))
    }
}

/** One point's pill: Material's suggestion chip, filled with the N-number's
 *  and the altitude's fill (the web's bg-foreground/8) and no line round it,
 *  its ident alone; red where closed, a "!" badge for a caution. */
@Composable
private fun RoutePill(ident: String, closed: Boolean, caution: Boolean, onClick: () -> Unit) {
    val ink = MaterialTheme.colorScheme
    val said = stringResource(if (caution) R.string.route_box_pill_caution else R.string.route_box_pill_said, ident)
    BadgedBox(badge = { if (caution) Badge { Text("!") } }) {
        SuggestionChip(
            onClick = onClick,
            label = { Text(if (closed) stringResource(R.string.route_box_closed, ident) else ident, fontWeight = FontWeight.SemiBold, maxLines = 1) },
            shape = CircleShape,
            border = null,
            colors = SuggestionChipDefaults.suggestionChipColors(
                containerColor = if (closed) ink.errorContainer else ink.onSurface.copy(alpha = PILL_FILL),
                labelColor = if (closed) ink.onErrorContainer else ink.onSurface,
            ),
            modifier = Modifier.height(PILL_HEIGHT).semantics { contentDescription = said },
        )
    }
}

/** A procedure picked at a point, beside its pill: its short title alone,
 *  no glyph, in a pill of the procedures' indigo on a wash of it, the
 *  points' pill in its own colour (the web's ProcedureChip; the owner,
 *  2026-11-23: "just make it a pill of a different color"). */
@Composable
private fun ProcedurePill(pick: PlanProcedures.Pick, onClick: () -> Unit) {
    val indigo = WingtipColors.Chart.Procedure
    val said = stringResource(R.string.route_box_procedure_said, pick.name)
    SuggestionChip(
        onClick = onClick,
        label = { Text(pick.name, fontWeight = FontWeight.SemiBold, maxLines = 1) },
        shape = CircleShape,
        border = null,
        colors = SuggestionChipDefaults.suggestionChipColors(containerColor = indigo.copy(alpha = PROCEDURE_WASH), labelColor = indigo),
        modifier = Modifier.height(PILL_HEIGHT).semantics { contentDescription = said },
    )
}

/** A flight's suggested fuel stops as one pill: its ident where one, else
 *  "+3 fuel stops", in the caution's tertiary with its fuel glyph. */
@Composable
private fun FuelFold(flight: FuelStopSuggestion, onAdd: () -> Unit) {
    val idents = flight.stops.map { it.ident }
    val said = stringResource(R.string.route_box_fuel_said, idents.joinToString(", "))
    SuggestionChip(
        onClick = onAdd,
        label = { Text(idents.singleOrNull() ?: pluralStringResource(R.plurals.route_box_fuel_fold, idents.size, idents.size), maxLines = 1) },
        icon = { Icon(WingtipIcons.fuel, contentDescription = null, Modifier.size(SuggestionChipDefaults.IconSize)) },
        shape = CircleShape,
        colors = SuggestionChipDefaults.suggestionChipColors(labelColor = MaterialTheme.colorScheme.tertiary, iconContentColor = MaterialTheme.colorScheme.tertiary),
        modifier = Modifier.semantics { contentDescription = said },
    )
}

/** The field after the last pill, borderless on the box, in the pills'
 *  semibold capitals so what is typed sits level with them; the empty
 *  box's grey words say what it takes. Done reads it. */
@Composable
private fun RouteField(
    field: androidx.compose.foundation.text.input.TextFieldState,
    empty: Boolean,
    focus: FocusRequester,
    onDone: () -> Unit,
    modifier: Modifier,
) {
    val said = stringResource(R.string.route_box_field)
    val style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
    BasicTextField(
        state = field,
        modifier = modifier.minimumInteractiveComponentSize().focusRequester(focus).semantics { contentDescription = said },
        textStyle = style,
        lineLimits = TextFieldLineLimits.SingleLine,
        cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, autoCorrectEnabled = false, imeAction = ImeAction.Done),
        onKeyboardAction = { onDone() },
        decorator = { inner ->
            Box(contentAlignment = Alignment.CenterStart) {
                if (empty && field.text.isEmpty()) {
                    Text(stringResource(R.string.route_box_hint), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                inner()
            }
        },
    )
}

/** The flight leaving `ident` for `next`, where the planner suggests fuel
 *  stops for it that are not in the route yet (PlanTanks.withFuelStops). */
private fun fuelFold(state: Plan.State, ident: String, next: String?): FuelStopSuggestion? {
    next ?: return null
    val flight = state.totals?.fuelStops.orEmpty().firstOrNull { it.reason != "break" && RoutePoints.same(it.departure, ident) && RoutePoints.same(it.destination, next) }
    return flight?.takeIf { PlanTanks.withFuelStops(state.dep, state.stops, listOf(it)) != null }
}

/** Whether a flight leaving `ident` is short of fuel with no stop offered
 *  (the totals' no_fuel_stop), for the "!" on its pill. */
private fun shortFrom(state: Plan.State, ident: String): Boolean = state.totals?.noFuelStop.orEmpty().any { RoutePoints.same(it.departure, ident) }

/** The pills' fill over the box, the web's foreground at 8 percent. */
private const val PILL_FILL = 0.08f

/** A procedure's pill's wash of its indigo, the web's at 12 percent. */
private const val PROCEDURE_WASH = 0.12f

/** The pills' height, the web's 28 (h-7): Material's own 48-dp touch area
 *  round each, the pill not grown to it. */
private val PILL_HEIGHT = WingtipSpace.Xl + WingtipSpace.Xs
