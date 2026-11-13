package app.wingtipmaps.android.coach

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenu
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ai.AiSources
import app.wingtipmaps.android.ai.AiTask
import app.wingtipmaps.android.ai.AiWordsRow
import app.wingtipmaps.android.api.generated.ProficiencyPlan
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.LocalWingtipPalette
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SectionTitle
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage

/**
 * The Logbook's Coach (the web's CoachPage): the pilot's own proficiency
 * plan, a page on the Logbook's stack (CardPage: ← and Material's medium
 * flexible top app bar, which collapses as the list scrolls). On the pilot's ask, glance first: the certificate and
 * Make My Plan in one card at the top, the screen's one filled button,
 * then the reminders, the plan in a few words, the sessions -- what,
 * where, how long, with an instructor, where it may count toward WINGS,
 * and the model's line under each -- then what is due and when (14 CFR
 * 61.56, 61.57), then the weak areas with their evidence folded under
 * each. All of it the engine's (proficiency_plan) but the words.
 */
@Composable
fun CoachScreen(exit: CardExit) {
    val context = LocalContext.current
    val model = hiltViewModel<CoachModel, CoachModel.Factory> { it.create(CertificatePreference.of(context)) }
    val state by model.state.collectAsStateWithLifecycle()
    CardPage(title = stringResource(R.string.coach), exit = exit) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding).padding(horizontal = WingtipSpace.Lg), contentPadding = PaddingValues(bottom = WingtipSpace.Xl)) {
            item(key = "make") { MakeCard(state, model) }
            state.plan?.let { plan(it) }
        }
    }
}

/** The certificate held and Make My Plan, the Coach's one primary action,
 *  in a card at the top with what it is made from and how it went. */
@Composable
private fun MakeCard(state: CoachModel.State, model: CoachModel) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(WingtipSpace.Lg), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            CertificateMenu(state.certificate, model::choose)
            Button(onClick = model::make, enabled = state.ready && !state.making, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(if (state.plan != null) R.string.coach_make_again else R.string.coach_make))
            }
            Muted(
                if (state.making) stringResource(R.string.coach_making)
                else stringResource(R.string.coach_make_line, state.home ?: stringResource(R.string.coach_home_none)),
            )
            if (state.making) LinearProgressIndicator(Modifier.fillMaxWidth())
            ProblemLine(state.problem)
        }
    }
}

private fun LazyListScope.plan(plan: ProficiencyPlan) {
    if (plan.reminders.isNotEmpty()) {
        item { SectionTitle(stringResource(R.string.coach_reminders)) }
        items(plan.reminders, key = { "r:" + it.key }) {
            Text(it.text, color = LocalWingtipPalette.current.cautionInk, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(vertical = WingtipSpace.Xs))
        }
    }
    item {
        SectionTitle(stringResource(R.string.coach_sessions))
        if (plan.sessions.isEmpty()) Muted(stringResource(R.string.coach_nothing))
    }
    items(plan.sessions, key = { "s:" + it.id }) { s ->
        ListItem(
            supportingContent = {
                Column {
                    Text(CoachLines.session(s))
                    CoachLines.wings(s)?.let { Text(it) }
                }
            },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            content = { Text(s.practise) },
        )
    }
    item { SectionTitle(stringResource(R.string.coach_due)) }
    items(plan.due, key = { "d:" + it.key }) { d ->
        ListItem(
            supportingContent = { Text(CoachLines.dueDetail(d)) },
            trailingContent = { Text(CoachLines.status(d), color = toneColor(CoachLines.tone(d))) },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            content = { Text(d.label) },
        )
    }
    if (plan.weakAreas.isNotEmpty()) {
        item { SectionTitle(stringResource(R.string.coach_debriefs)) }
        // What the debriefs found, in plain words, over the areas themselves.
        item(key = "ai-debrief") {
            AiWordsRow(
                AiTask.DEBRIEF, key = plan.weakAreas.joinToString { it.key },
                sources = { AiSources.debrief(plan.weakAreas.map { w -> CoachLines.weakTitle(w) to CoachLines.evidence(plan, w).map(CoachLines::evidenceLine) }) },
            )
        }
        items(plan.weakAreas, key = { "w:" + it.key }) { w ->
            var open by rememberSaveable(w.key) { mutableStateOf(false) }
            ListItem(
                onClick = { open = !open },
                trailingContent = { Icon(if (open) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                modifier = Modifier.fillMaxWidth(),
                content = { Text(CoachLines.weakTitle(w)) },
            )
            if (open) {
                CoachLines.evidence(plan, w).forEach { Muted(CoachLines.evidenceLine(it), Modifier.padding(start = WingtipSpace.Lg)) }
            }
        }
    }
}

/** The certificate the pilot holds: a menu of three (decision 0017), as
 *  the labels are too long for a segmented control at a phone's width. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CertificateMenu(certificate: Certificate, onPick: (Certificate) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = stringResource(label(certificate)),
            onValueChange = {},
            readOnly = true,
            label = { Text(stringResource(R.string.coach_certificate_short)) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier.fillMaxWidth().menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            Certificate.entries.forEach { c ->
                DropdownMenuItem(text = { Text(stringResource(label(c))) }, onClick = { onPick(c); expanded = false })
            }
        }
    }
}

private fun label(c: Certificate): Int = when (c) {
    Certificate.STUDENT -> R.string.certificate_student
    Certificate.PRIVATE -> R.string.certificate_private
    Certificate.INSTRUMENT -> R.string.certificate_instrument
}

@Composable
private fun Muted(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier.padding(vertical = WingtipSpace.Xs))
}

/** Red lapsed, amber soon or not begun, green current, grey unknown: the
 *  palette's error, caution and go, as Coming Up's. */
@Composable
private fun toneColor(tone: CoachLines.Tone): Color = when (tone) {
    CoachLines.Tone.STOP -> MaterialTheme.colorScheme.error
    CoachLines.Tone.CAUTION -> LocalWingtipPalette.current.cautionInk
    CoachLines.Tone.OK -> LocalWingtipPalette.current.goInk
    CoachLines.Tone.UNKNOWN -> MaterialTheme.colorScheme.onSurfaceVariant
}
