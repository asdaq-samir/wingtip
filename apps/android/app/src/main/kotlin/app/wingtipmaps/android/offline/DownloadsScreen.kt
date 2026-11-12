package app.wingtipmaps.android.offline

import android.text.format.Formatter
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.OfflineRegion
import app.wingtipmaps.android.design.ChoiceGroup
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.ActionSettingRow
import app.wingtipmaps.android.ui.LocalWingtipPalette
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SectionTitle
import app.wingtipmaps.android.ui.SettingsGroup
import app.wingtipmaps.android.ui.SwitchSettingRow
import app.wingtipmaps.android.ui.ValueSettingRow
import app.wingtipmaps.android.ui.sheet.WingtipSheet

/**
 * Setup → Downloads: the chart of a sectional sheet's coverage, a state or
 * the map's view kept on the phone for flying with no signal, as
 * ForeFlight's and Garmin Pilot's downloads are: the kinds and density
 * picked, each region's size before it is fetched, the downloads in the
 * background with their progress, the storage they take, delete, and
 * the update when the FAA's next cycle is out. The state is DownloadsModel's.
 */
@Composable
fun DownloadsScreen(model: DownloadsModel = hiltViewModel()) {
    val context = LocalContext.current
    val catalog by model.catalog.collectAsStateWithLifecycle()
    val kept by model.kept.collectAsStateWithLifecycle()
    val written by model.written.collectAsStateWithLifecycle()
    val picked by model.picked.collectAsStateWithLifecycle()
    val scale by model.scale.collectAsStateWithLifecycle()
    val busy by model.busy.collectAsStateWithLifecycle()
    val problem by model.problem.collectAsStateWithLifecycle()
    var search by rememberSaveable { mutableStateOf("") }
    var asking by rememberSaveable { mutableStateOf<String?>(null) }
    var map by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(Unit) { model.load() }
    val archives = model.archives(picked, scale)
    fun bytes(b: Long?) = b?.let { Formatter.formatShortFileSize(context, it) }
    val sizing = stringResource(R.string.offline_sizing)

    LazyColumn(Modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Lg)) {
        item { SectionTitle(stringResource(R.string.offline_on_phone)) }
        items(kept, key = { it.id }) { k ->
            KeptRow(k, written[k.id] ?: 0L, model.updatable(k, kept), model.newestCycle,
                onUpdate = { model.newestCycle?.let { model.keep(k, it) } }, onRetry = { model.keep(k, k.cycle) }, onDelete = { model.delete(k) })
        }
        item {
            // The storage as Android's settings group it: one segmented group.
            SettingsGroup(Modifier.padding(vertical = WingtipSpace.Sm)) {
                ValueSettingRow(stringResource(R.string.offline_storage_used), bytes(model.storageUsed()) ?: "", index = 0, count = 2)
                ValueSettingRow(stringResource(R.string.offline_free), bytes(model.storageFree()) ?: "", index = 1, count = 2)
            }
        }
        item {
            SectionTitle(stringResource(R.string.offline_charts))
            val kinds = DownloadsModel.KINDS_IN_ORDER
            SettingsGroup(Modifier.padding(bottom = WingtipSpace.Sm)) {
                kinds.forEachIndexed { i, kind ->
                    SwitchSettingRow(kindLabel(kind), kind in picked, index = i, count = kinds.size) { model.setPicked(kind, it) }
                }
            }
            // A discrete setting of two: a segmented control (decision 0017).
            ChoiceGroup(
                listOf(2 to stringResource(R.string.offline_sharp), 1 to stringResource(R.string.offline_smaller)),
                selected = scale,
                onPick = model::setScale,
            )
            ActionSettingRow(stringResource(R.string.offline_pick_map), index = 0, count = 1, modifier = Modifier.padding(vertical = WingtipSpace.Sm)) { map = true }
            OutlinedTextField(search, { search = it }, Modifier.fillMaxWidth(), singleLine = true,
                label = { Text(stringResource(R.string.offline_search)) })
            ProblemLine(problem)
        }
        for ((group, title) in listOf("sheet" to R.string.offline_sheets, "state" to R.string.offline_states)) {
            item { SectionTitle(stringResource(title)) }
            items(catalog?.regions.orEmpty().filter { it.group == group && (search.isBlank() || it.name.contains(search, ignoreCase = true)) },
                key = { "$group/${it.id}" }) { region ->
                val size = if (region.id in busy) stringResource(R.string.offline_asking) else bytes(DownloadsModel.size(region, archives)) ?: sizing
                ListItem(
                    onClick = { asking = region.id },
                    enabled = archives.isNotEmpty() && region.id !in busy,
                    trailingContent = { Text(size, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    modifier = Modifier.fillMaxWidth(),
                    content = { Text(region.name) },
                )
            }
        }
    }
    val region = catalog?.regions?.firstOrNull { it.id == asking }
    if (region != null) ConfirmDownload(region, bytes(DownloadsModel.size(region, archives)) ?: sizing, { asking = null }) { model.download(region.id) }
    if (map) {
        WingtipSheet(title = stringResource(R.string.offline_pick_map), onClose = { map = false }, full = true) {
            DownloadsMap(model, catalog?.regions.orEmpty().filter { it.group == "sheet" }, archives)
        }
    }
}

@Composable
internal fun ConfirmDownload(region: OfflineRegion, size: String, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.offline_download_named, region.name)) },
        text = { Text(stringResource(R.string.offline_background)) },
        confirmButton = { TextButton(onClick = { onConfirm(); onDismiss() }) { Text(stringResource(R.string.offline_download_size, size)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.close)) } },
    )
}

@Composable
private fun KeptRow(
    kept: OfflineKept, written: Long, updatable: Boolean, newest: String?,
    onUpdate: () -> Unit, onRetry: () -> Unit, onDelete: () -> Unit,
) {
    val context = LocalContext.current
    val names = kept.wanted.keys.sorted().joinToString(", ") { it.replace("_", " ").uppercase() }
    Column(Modifier.fillMaxWidth().padding(vertical = WingtipSpace.Sm)) {
        Row2(kept.name, Formatter.formatShortFileSize(context, kept.bytes))
        val expired = kept.expired()
        Text(
            if (expired) stringResource(R.string.offline_expired, kept.cycle, kept.expires ?: "", names)
            else stringResource(R.string.offline_edition, kept.cycle, kept.expires ?: "", names),
            style = MaterialTheme.typography.bodySmall,
            color = if (expired) LocalWingtipPalette.current.cautionInk else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (!kept.complete && kept.failed == null) {
            val done = kept.done.sumOf { kept.wanted[it] ?: 0L } + written
            LinearProgressIndicator(progress = { (done.toFloat() / maxOf(1L, kept.bytes)).coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
        }
        kept.failed?.let {
            ProblemLine(stringResource(R.string.offline_stopped, it))
            TextButton(onClick = onRetry) { Text(stringResource(R.string.offline_try_again)) }
        }
        if (updatable && newest != null) TextButton(onClick = onUpdate) { Text(stringResource(R.string.offline_update_to, newest)) }
        TextButton(onClick = onDelete) { Text(stringResource(R.string.offline_delete)) }
    }
}

@Composable
private fun Row2(label: String, value: String) {
    ListItem(
        trailingContent = { Text(value, color = MaterialTheme.colorScheme.onSurfaceVariant) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        content = { Text(label) },
    )
}

@Composable
private fun kindLabel(kind: String): String = stringResource(
    when (kind) {
        "sec" -> R.string.offline_kind_sec
        "tac" -> R.string.offline_kind_tac
        "ifr_low" -> R.string.offline_kind_ifr_low
        "ifr_high" -> R.string.offline_kind_ifr_high
        else -> R.string.offline_kind_ifr_area
    },
)
