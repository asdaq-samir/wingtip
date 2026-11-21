package app.wingtipmaps.android.filing

import android.content.Intent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.core.net.toUri
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.Session
import app.wingtipmaps.android.alternate.PlanAlternate
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.plan.PlanFiling
import app.wingtipmaps.android.plan.PlanTanks
import app.wingtipmaps.android.ui.CardIntents
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage

/**
 * File Flight Plan, the plan's File button (the web's Brief's Flight
 * Plan, the iPhone's FlightServiceView): the FAA's form filled in from
 * the plan, a flight to a group (PlanFiling), with the persons on board
 * typed, to copy into a filing service or read to Flight Service. Filing
 * itself is theirs: 1800wxbrief.com and Flight Service are the FAA's, at
 * no charge. Where the gateway has Flight Service connected
 * (FlightServiceController), and the pilot is signed in, each form is
 * filed from here too, in the pilot's name, its reference said on its
 * row. Material's list items, an item a row, its number and name over
 * what it says.
 */
@Composable
fun FilingPage(plan: Plan, session: Session, exit: CardExit, model: FilingModel = hiltViewModel()) {
    val context = LocalContext.current
    val state by plan.state.collectAsStateWithLifecycle()
    val filing by model.state.collectAsStateWithLifecycle()
    val pilot by session.pilot.collectAsStateWithLifecycle()
    val tail by remember(context) { FlightChoices.of(context) }.tail.collectAsStateWithLifecycle()
    val tanks by PlanTanks.state.collectAsStateWithLifecycle()
    val filed by PlanAlternate.filed.collectAsStateWithLifecycle()
    LaunchedEffect(pilot) { if (pilot != null) model.load() }
    val type = state.own?.type?.ifEmpty { null } ?: state.aircraft.takeIf { it.isNotEmpty() && it != "own" }
    val landings = state.stops.filter { s -> !PlanFiling.isAirway(s) && state.course?.stops?.firstOrNull { it.ident.equals(s, true) }?.kind != "fix" }
    val flights = PlanFiling.flights(state.dep, state.dest, state.stops, landings, state.legs)
    val today = AppClock.javaNow().toString()
    val persons = rememberTextFieldState()
    val pob = PlanFiling.persons(persons.text.toString())
    val connected = filing.status?.connected == true && pilot != null
    CardPage(title = stringResource(R.string.file_flight_plan), exit = exit, subtitle = "${state.dep} → ${state.dest}") { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding)) {
            item(key = "persons") {
                OutlinedTextField(
                    state = persons,
                    label = { Text(stringResource(R.string.filing_persons)) },
                    lineLimits = TextFieldLineLimits.SingleLine,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    isError = persons.text.isNotBlank() && pob == null,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Lg),
                )
            }
            flights.forEachIndexed { i, flight ->
                val totals = if (flights.size > 1) state.totals?.hops?.getOrNull(i)?.totals else state.totals
                val fuel = if (i == 0) tanks.own[state.dep.uppercase()]?.toDouble() else null
                val form = PlanFiling.form(
                    flight, first = i == 0, last = i == flights.size - 1, rules = state.rules, aircraftId = tail, aircraftType = type,
                    depart = state.depart, totals = totals, fuelGal = fuel, alternate = PlanAlternate.of(state.rules, state.dest, filed), today = today,
                )
                form.fold(
                    { f ->
                        formRows(i, f, flights.size > 1, pob)
                        item(key = "copy-$i") {
                            Action(stringResource(R.string.filing_copy)) { CardIntents.copy(context, f.departure, f.text(pob)) }
                        }
                        if (connected) {
                            item(key = "file-$i") {
                                val request = f.request(pob)
                                val reference = filing.filed[i]
                                val words = when {
                                    reference != null -> stringResource(R.string.filing_filed, reference)
                                    filing.sending == i -> stringResource(R.string.filing_sending)
                                    else -> stringResource(R.string.filing_file_with, filing.status?.provider.orEmpty())
                                }
                                val note = if (request == null && reference == null) stringResource(R.string.filing_needs) else null
                                Action(words, note, enabled = request != null && reference == null && filing.sending == null) { request?.let { model.file(i, it) } }
                            }
                        }
                    },
                    { why -> item(key = "problem-$i") { ProblemLine(why.message, Modifier.padding(horizontal = WingtipSpace.Lg)) } },
                )
            }
            item(key = "file-problem") { ProblemLine(filing.problem ?: filing.statusProblem, Modifier.padding(horizontal = WingtipSpace.Lg)) }
            fileIt(state.rules.equals("ifr", ignoreCase = true)) { uri -> context.startActivity(Intent(Intent.ACTION_VIEW, uri.toUri())) }
        }
    }
}

/** One flight's items, AIM Appendix 4's numbers and names over what each says. */
private fun LazyListScope.formRows(i: Int, f: PlanFiling.Form, named: Boolean, persons: Int?) {
    if (named) item(key = "flight-$i") { Heading("${f.departure} → ${f.destination}") }
    val none = "—"
    val rows = listOf(
        R.string.filing_rules to f.rules,
        R.string.filing_ident to (f.aircraftId ?: none),
        R.string.filing_type to (f.aircraftType ?: none),
        R.string.filing_departure to f.departure,
        R.string.filing_time to (f.departTime?.let(PlanFiling::utcFigures) ?: none),
        R.string.filing_speed to (f.speed ?: none),
        R.string.filing_level to (f.level ?: none),
        R.string.filing_route to f.route,
        R.string.filing_destination to f.destination,
        R.string.filing_eet to (f.eet ?: none),
    ) + listOfNotNull(
        f.alternate?.let { R.string.filing_alternate to it },
        f.other?.let { R.string.filing_other to it },
    ) + listOf(
        R.string.filing_endurance to (f.endurance ?: none),
        R.string.filing_persons_item to (persons?.toString() ?: none),
    )
    rows.forEachIndexed { r, (label, value) ->
        item(key = "item-$i-$r") {
            ListItem(supportingContent = { Text(value, style = MaterialTheme.typography.bodyLarge) }) {
                Text(stringResource(label), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/**
 * Where to file it, the FAA's own at no charge (AIM 5-1-1): 1800wxbrief.com
 * and Flight Service's numbers. An IFR flight plan is filed at least 30
 * minutes before departure (AIM 5-1-6); a VFR one is opened with Flight
 * Service on leaving and closed on landing, a search starting half an hour
 * past an ETA not closed (AIM 5-1-5, 5-1-14): said on the row.
 */
private fun LazyListScope.fileIt(ifr: Boolean, open: (String) -> Unit) {
    item(key = "file-it") { Heading(null, R.string.filing_file_it) }
    item(key = "wx") {
        Action("1800wxbrief.com", stringResource(if (ifr) R.string.filing_wx_ifr else R.string.filing_wx_vfr)) { open("https://www.1800wxbrief.com") }
    }
    item(key = "fss") { Action(stringResource(R.string.filing_fss), "1-800-WX-BRIEF") { open("tel:18009927433") } }
    item(key = "fss-ak") { Action(stringResource(R.string.filing_fss_alaska), "1-833-AK-BRIEF") { open("tel:18332527433") } }
}

@Composable
private fun Heading(text: String?, res: Int = R.string.filing_file_it) {
    Text(
        text ?: stringResource(res),
        style = MaterialTheme.typography.titleSmall,
        modifier = Modifier.fillMaxWidth().padding(start = WingtipSpace.Lg, end = WingtipSpace.Lg, top = WingtipSpace.Md).semantics { heading() },
    )
}

/** A tap that does something, Material's clickable list item in the tint. */
@Composable
private fun Action(words: String, note: String? = null, enabled: Boolean = true, onClick: () -> Unit) {
    ListItem(
        onClick = onClick,
        enabled = enabled,
        supportingContent = note?.let { { Text(it) } },
        modifier = Modifier.fillMaxWidth(),
    ) { Text(words, color = if (enabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) }
}
