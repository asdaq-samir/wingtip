package app.wingtipmaps.android.scratchpad

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ready.ReadyFacts
import app.wingtipmaps.android.ui.FullScreenPage
import app.wingtipmaps.android.ui.WingtipIcons

/**
 * The scratchpad (the market-gap report's item 5): the flight's pages
 * across the top as Material's scrollable tabs, New Page's menu of
 * templates (Blank, CRAFT Clearance, ATIS, Takeoff and Landing) at their
 * end, and the page shown: its template's fields, stock text fields a
 * keyboard or a stylus's handwriting fills, over the ink area a stylus or
 * a finger writes in (InkArea, Jetpack Ink), with Undo and Clear for the
 * ink and Delete for the page. Full screen, as the diagram and the plates
 * are, so a tablet gives it the room. The pages stay on the phone, with
 * the flight (ScratchModel).
 */
@Composable
fun ScratchpadPage(plan: Plan, onClose: () -> Unit, model: ScratchModel = hiltViewModel()) {
    val planned by plan.state.collectAsStateWithLifecycle()
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(planned.dep, planned.dest, planned.stops) { model.open(ReadyFacts.flightKey(planned)) }
    FullScreenPage(title = stringResource(R.string.scratchpad), onClose = onClose) {
        Column(Modifier.fillMaxSize()) {
            Tabs(state, model)
            val page = state.page
            if (page == null) {
                Box(Modifier.fillMaxSize().padding(WingtipSpace.Xl), contentAlignment = Alignment.Center) {
                    Text(stringResource(R.string.scratchpad_empty), style = MaterialTheme.typography.bodyLarge)
                }
            } else {
                PageBody(page, model)
            }
        }
    }
}

/** The pages as tabs, the newest last, and New Page's templates. */
@Composable
private fun Tabs(state: ScratchModel.State, model: ScratchModel) {
    val pages = state.book.pages
    var picking by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        if (pages.isNotEmpty()) {
            val at = pages.indexOfFirst { it.id == state.page?.id }.coerceAtLeast(0)
            PrimaryScrollableTabRow(selectedTabIndex = at, modifier = Modifier.weight(1f), edgePadding = WingtipSpace.Lg) {
                pages.forEachIndexed { i, p ->
                    Tab(selected = i == at, onClick = { model.show(p.id) }, text = { Text(stringResource(p.template.title)) })
                }
            }
        } else {
            Box(Modifier.weight(1f))
        }
        Box {
            TextButton(onClick = { picking = true }) { Text(stringResource(R.string.scratchpad_new)) }
            DropdownMenu(expanded = picking, onDismissRequest = { picking = false }) {
                Template.entries.forEach { t ->
                    DropdownMenuItem(text = { Text(stringResource(t.title)) }, onClick = {
                        picking = false
                        model.add(t)
                    })
                }
            }
        }
    }
}

/** The page's fields, its ink tools and its ink area. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PageBody(page: ScratchPage, model: ScratchModel) {
    Column(Modifier.fillMaxSize().padding(horizontal = WingtipSpace.Lg)) {
        if (page.template.fields.isNotEmpty()) {
            // Two or three a row on a tablet, one under the other on a phone.
            FlowRow(Modifier.fillMaxWidth().padding(top = WingtipSpace.Sm), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                page.template.fields.forEach { f ->
                    OutlinedTextField(
                        value = page.fields[f.key].orEmpty(),
                        onValueChange = { model.field(page.id, f.key, it) },
                        label = { Text(stringResource(f.label)) },
                        singleLine = f.key != "remarks" && f.key != "route",
                        modifier = Modifier.weight(1f).widthIn(min = WingtipSize.Panel / 2),
                    )
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            IconButton(onClick = { model.undo(page.id) }, enabled = page.ink.isNotEmpty()) { Icon(WingtipIcons.undo, contentDescription = stringResource(R.string.scratchpad_undo)) }
            IconButton(onClick = { model.clearInk(page.id) }, enabled = page.ink.isNotEmpty()) { Icon(WingtipIcons.clear, contentDescription = stringResource(R.string.scratchpad_clear)) }
            IconButton(onClick = { model.delete(page.id) }) { Icon(WingtipIcons.delete, contentDescription = stringResource(R.string.scratchpad_delete)) }
        }
        InkArea(
            lines = page.ink,
            said = stringResource(R.string.scratchpad_ink),
            onWrite = { model.write(page.id, it) },
            modifier = Modifier.weight(1f).fillMaxWidth().padding(bottom = WingtipSpace.Lg),
        )
    }
}
