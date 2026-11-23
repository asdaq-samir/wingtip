package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.clearText
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.FilledIconToggleButton
import androidx.compose.material3.Icon
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
import androidx.compose.runtime.saveable.rememberSaveable
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
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.FuelStopSuggestion
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.plan.PlanTanks
import app.wingtipmaps.android.plan.RouteFieldFacts
import app.wingtipmaps.android.route.RoutePointMenu
import app.wingtipmaps.android.route.RoutePoints
import app.wingtipmaps.android.route.addFuelStops
import app.wingtipmaps.android.route.typeRoute

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
 * (TypedRoute) and goes on at the route's end, a whole route on an empty box.
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
) {
    val facts by model.facts.collectAsStateWithLifecycle()
    val points = (listOf(state.dep) + state.stops + state.dest).filter { it.isNotEmpty() }
    LaunchedEffect(points) { model.load(points) }
    val field = rememberTextFieldState()
    var unread by rememberSaveable { mutableStateOf<String?>(null) }
    val focus = remember { FocusRequester() }
    // Turned to before the route is whole, the field is what the pilot came
    // for: its keyboard up at once, as the web focuses it in the tap.
    LaunchedEffect(Unit) { if (!state.routed) focus.requestFocus() }
    val read = {
        val text = field.text.toString()
        if (text.isNotBlank()) {
            if (plan.typeRoute(text)) {
                unread = null
                field.clearText()
            } else {
                unread = text.trim()
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
                itemVerticalAlignment = Alignment.CenterVertically,
            ) {
                points.forEachIndexed { i, ident ->
                    val closed = facts[ident.uppercase()]?.closed == true
                    RoutePointMenu(ident, plan, onAddStopAfter, anchor = { open -> RoutePill(ident, closed, shortFrom(state, ident), open) })
                    fuelFold(state, ident, points.getOrNull(i + 1))?.let { flight -> FuelFold(flight) { plan.addFuelStops(flight) } }
                }
                RouteField(field, empty = points.isEmpty(), focus = focus, onDone = read, modifier = Modifier.weight(1f).widthIn(min = WingtipSpace.Xxl * 3))
            }
            unread?.let { ProblemLine(stringResource(R.string.route_box_unread, it)) }
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
            modifier = Modifier.semantics { contentDescription = said },
        )
    }
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
