package app.wingtipmaps.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.Badge
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.TfrContact
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.engine.MapRules
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage

/**
 * The NOTAMs opened from the airport card -- a row of its NOTAMs, or the
 * badge on a thing one addresses (the owner, 2026-11-11: "tapping the
 * affected thing should show the notam") -- on a page of their own in
 * the card's stack, ← and Back stepping back to the card (the card rule's
 * 2): one in full, or several as the list's rows, each opening in full
 * over them. One in full is the web's NotamCard (rules.md 19): titled
 * what happened (the engine's notam_card, "Runway 18/36 closed"), else
 * its kind, the field and its number under it ("KARR Aurora Municipal ·
 * FDC 6/3373"). `name` is the field's, `zone` the planner's time zone for
 * it, and `roles` what the field is to the planned flight (planRoles),
 * from which each NOTAM's chip (roleChip).
 */
@Composable
fun NotamPage(notams: List<FieldNotams.Said>, ident: String, exit: CardExit, name: String? = null, zone: String? = null, roles: List<PlanRole> = emptyList()) {
    var one by remember(notams) { mutableStateOf(notams.singleOrNull()) }
    val shown = one
    if (shown != null) {
        val many = notams.size > 1
        if (many) BackHandler { one = null }
        val back = if (many) CardExit(back = { one = null }, close = exit.close) else exit
        CardPage(
            title = shown.card?.title ?: shown.heading ?: stringResource(R.string.notam_heading),
            subtitle = "${name?.let { "$ident $it" } ?: ident} · ${numberLine(shown, ident)}",
            exit = back,
        ) { padding ->
            Box(Modifier.padding(padding)) {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl)) {
                    NotamFull(shown, zone, roles)
                }
            }
        }
        return
    }
    CardPage(title = stringResource(R.string.notams), subtitle = ident, exit = exit) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(bottom = WingtipSpace.Xl)) {
            items(notams, key = { it.notam.id }) { s -> NotamRow(s, zone, { one = s }, Modifier.padding(horizontal = WingtipSpace.Lg)) }
        }
    }
}

/** A part the NOTAM's field plays in the planned flight: the chip's
 *  words, and whether the flight leaves from it (a departure procedure's)
 *  or lands there (an arrival's). */
data class PlanRole(val words: Int, val leaves: Boolean, val lands: Boolean)

/** The chip on one NOTAM: its words, and whether it takes away a procedure
 *  its role flies (red) or is only the field's (neutral). */
data class RoleChip(val words: Int, val taken: Boolean)

/** Which of the planned flight's fields this NOTAM's field is, by any of
 *  its idents (field_names), in the order the chip names them: the
 *  departure, a stop, the destination, the alternate filed. */
fun planRoles(idents: List<String>, dep: String, stops: List<String>, dest: String, alternate: String?): List<PlanRole> {
    fun isIt(field: String?) = !field.isNullOrBlank() && idents.any { it.equals(field, ignoreCase = true) }
    return listOfNotNull(
        PlanRole(R.string.notam_affects_departure, leaves = true, lands = false).takeIf { isIt(dep) },
        PlanRole(R.string.notam_affects_stop, leaves = true, lands = true).takeIf { stops.any(::isIt) },
        PlanRole(R.string.notam_affects_arrival, leaves = false, lands = true).takeIf { isIt(dest) },
        PlanRole(R.string.notam_affects_alternate, leaves = false, lands = true).takeIf { isIt(alternate) },
    )
}

/** The chip a NOTAM wears (the web's usePlanRole), null where its field is
 *  none of the flight's or it only takes away what the field is not used
 *  for. A procedure taken away affects only the role that flies it: a SID
 *  or an ODP the departure and each stop left from, a STAR the
 *  destination, each stop and the alternate (AIM 5-2-9, 5-4-1; the
 *  engine's notam_card says which each is), and is red; a NOTAM taking
 *  none (a runway closed, a light out) is the field's, the neutral chip. */
fun roleChip(roles: List<PlanRole>, procedures: List<EngineContract.NotamCardAnswerProceduresItem>): RoleChip? {
    if (procedures.isEmpty()) return roles.firstOrNull()?.let { RoleChip(it.words, taken = false) }
    val flown = roles.firstOrNull { r -> procedures.any { if (it.departure) r.leaves else r.lands } }
    return flown?.let { RoleChip(it.words, taken = true) }
}

/** Its number as a briefer reads it: an FDC NOTAM's with its
 *  accountability ("FDC 6/3373", JO 7930.2 4-2-1), the field's own
 *  without the field's name ("NOTAM 11/060"). */
@Composable
private fun numberLine(s: FieldNotams.Said, ident: String): String {
    val number = s.read?.number
    return if (s.card?.account == "FDC" && number != null) stringResource(R.string.notam_fdc_number, number)
    else stringResource(R.string.notam_number, FieldNotams.number(s.notam, ident))
}

/**
 * One NOTAM in full, as rules.md 19 lays it out: its category a small
 * label (only where the title says what happened; otherwise it is the
 * title already); chips -- Active or not, Permanent, and that it affects
 * the planned flight while it is in force; one plain sentence of its
 * effect; the procedures it takes away; its times in words in the field's
 * own time (NotamLines, NotamTimes); where it is; and its text as sent folded
 * beneath, never rewritten. Each the engine's (notam_card); where it
 * cannot structure one, the NOTAM's words written out (notam_read) stand
 * in. A TFR keeps its kind and rule as its first line and its place,
 * instructions and whom to call (TfrDetails).
 */
@Composable
private fun NotamFull(s: FieldNotams.Said, zone: String?, roles: List<PlanRole>) {
    val tfr = FieldNotams.isTfr(s.notam)
    val active = FieldNotams.active(s.notam)
    val card = s.card
    val scheme = MaterialTheme.colorScheme
    val permanent = !tfr && (card?.permanent ?: (s.read?.permanent == true))
    val role = roleChip(roles, card?.procedures.orEmpty())
    Column(verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md)) {
        if (card?.title != null) card.category?.let { Text(it, style = MaterialTheme.typography.labelLarge, color = scheme.onSurfaceVariant) }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
            NotamState(s.notam)
            if (permanent) Badge(containerColor = scheme.secondaryContainer, contentColor = scheme.onSecondaryContainer) { Text(stringResource(R.string.notam_permanent)) }
            if (role != null && active) {
                Badge(
                    containerColor = if (role.taken) scheme.error else scheme.secondaryContainer,
                    contentColor = if (role.taken) scheme.onError else scheme.onSecondaryContainer,
                ) { Text(stringResource(role.words)) }
            }
        }
        val ink = if (active) Color.Unspecified else scheme.onSurfaceVariant
        if (tfr) Text(notamWhat(s.what), style = MaterialTheme.typography.titleMedium, color = ink)
        else Text(card?.effect ?: s.read?.words ?: s.notam.raw, style = MaterialTheme.typography.bodyLarge, color = ink)
        if (card != null && card.procedures.isNotEmpty()) NotAuthorized(card.procedures)
        NotamLines(s, zone)
        if (tfr) TfrDetails(s)
        Fold(stringResource(if (tfr) R.string.tfr_as_sent else R.string.notam_as_sent)) {
            AsSent(s.notam.raw)
        }
    }
}

/** The procedures it takes away, by their charted names in capitals and
 *  their numbers ("ADELL 8 · BLOKR 8 ... (RNAV)"; the owner, 2026-11-23),
 *  RNAV said once where every one is. */
@Composable
private fun NotAuthorized(procedures: List<EngineContract.NotamCardAnswerProceduresItem>) {
    val all = procedures.all { it.rnav }
    val names = procedures.joinToString(" · ") { if (it.rnav && !all) "${it.name} (RNAV)" else it.name } + if (all) " (RNAV)" else ""
    Column(verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xxs)) {
        Text(stringResource(R.string.notam_not_authorized), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(names, style = MaterialTheme.typography.bodyLarge)
    }
}

/** The first of `forms` that fits the width on one line, else the last
 *  cut at its end: a NOTAM's time line shortens rather than wraps, on its
 *  row and on its card (the owner, 2026-11-23: "one line each"), at any
 *  font scale. */
@Composable
fun OneLine(forms: List<AnnotatedString>, style: TextStyle) {
    val measurer = rememberTextMeasurer()
    BoxWithConstraints {
        val width = constraints.maxWidth
        val fits = forms.firstOrNull { measurer.measure(it, style, maxLines = 1, softWrap = false).size.width <= width } ?: forms.last()
        Text(fits, style = style, maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis)
    }
}

/**
 * A TFR's own page under its lines: its place's name (tfr_read, the list's
 * title with its dates off), its instructions as the FAA gives them a line
 * each, in sentence case with their codes kept (faa_words), never
 * rewritten, and whom it names to call: the FAA facility it is
 * coordinated through and its point of contact, each telephone a tap
 * that dials.
 */
@Composable
private fun TfrDetails(s: FieldNotams.Said) {
    val t = s.notam.tfr
    s.tfr?.place?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    val instructions = t?.instructions.orEmpty()
    if (instructions.isNotEmpty()) {
        Column(Modifier.padding(top = WingtipSpace.Sm)) {
            Text(stringResource(R.string.tfr_instructions), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            instructions.forEach { line ->
                val words = remember(line) { MapRules.faaWords(line) }
                Text(words, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
    t?.facility?.let { Contact(stringResource(R.string.tfr_facility), it) }
    t?.contact?.let { Contact(stringResource(R.string.tfr_contact), it) }
}

/** One whom-to-call line: its name, its frequency, and its telephone at
 *  the end, a tap that opens the phone's dialler with it. */
@Composable
private fun Contact(label: String, c: TfrContact) {
    val context = LocalContext.current
    val call = c.phone?.let { stringResource(R.string.tfr_call, it) }
    ListItem(
        overlineContent = { Text(label) },
        supportingContent = c.frequency?.let { f -> { Text(f) } },
        trailingContent = c.phone?.let { phone ->
            {
                TextButton(onClick = { CardIntents.call(context, phone) }, modifier = Modifier.semantics { contentDescription = call.orEmpty() }) {
                    Text(phone)
                }
            }
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth(),
    ) { Text(c.name) }
}

/** A fold: its title a text button with the chevron, what it holds shown
 *  under it by Compose's own AnimatedVisibility, closed to begin with. */
@Composable
fun Fold(title: String, content: @Composable () -> Unit) {
    var open by rememberSaveable(title) { mutableStateOf(false) }
    Column {
        TextButton(onClick = { open = !open }, contentPadding = ButtonDefaults.TextButtonWithIconContentPadding) {
            Text(title)
            Icon(if (open) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, contentDescription = null, modifier = Modifier.padding(start = WingtipSpace.Xs))
        }
        AnimatedVisibility(open) { content() }
    }
}

/** Text as sent, in the monospaced face on the muted ground. */
@Composable
fun AsSent(text: String, modifier: Modifier = Modifier) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = MaterialTheme.shapes.small, modifier = modifier.fillMaxWidth()) {
        Text(text, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(WingtipSpace.Sm))
    }
}
