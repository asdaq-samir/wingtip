package app.wingtipmaps.android.account

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.Session
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.ActionSettingRow
import app.wingtipmaps.android.ui.ProblemLine

/**
 * Export My Data: a row of the Account section that fetches everything
 * the gateway keeps of the pilot and hands it to the system's picker to
 * save, under the name the gateway gave it. What went wrong is said
 * under the row (ProblemLine), where it happened.
 */
@Composable
fun ExportRow(model: ExportModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { model.save(it) }
    LaunchedEffect(state.toSave) {
        state.toSave?.let { name ->
            model.offered()
            picker.launch(name)
        }
    }
    // A segmented row of its own, as the settings' other groups; its
    // spinner at the end while the file is fetched.
    ActionSettingRow(
        stringResource(R.string.export_my_data), index = 0, count = 1,
        supporting = stringResource(if (state.saved) R.string.export_saved else R.string.export_my_data_line),
        trailing = if (state.fetching) {
            { Loading(Modifier.size(WingtipSpace.Xl)) }
        } else {
            null
        },
        onClick = { if (!state.fetching) model.fetch() },
    )
    ProblemLine(state.problem)
}

/**
 * Delete Account, under Sign Out: in the error colour, as a destructive
 * action is in Material, and asked once more in Material's alert dialog
 * before anything goes. The gateway's refusal is the session's problem,
 * shown under the account as every other of its problems.
 */
@Composable
fun DeleteAccountButton(session: Session) {
    val context = LocalContext.current
    val deleting by session.deleting.collectAsStateWithLifecycle()
    var asking by rememberSaveable { mutableStateOf(false) }
    val error = MaterialTheme.colorScheme.error
    OutlinedButton(
        onClick = { asking = true },
        enabled = !deleting,
        colors = ButtonDefaults.outlinedButtonColors(contentColor = error),
        // Material's outlined border width, in the error colour.
        border = BorderStroke(1.dp, error),
    ) { Text(stringResource(R.string.delete_account)) }
    if (asking) {
        AlertDialog(
            onDismissRequest = { asking = false },
            title = { Text(stringResource(R.string.delete_account_title)) },
            text = { Text(stringResource(R.string.delete_account_text)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        asking = false
                        session.deleteAccount(context)
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = error),
                ) { Text(stringResource(R.string.delete_account)) }
            },
            dismissButton = { TextButton(onClick = { asking = false }) { Text(stringResource(R.string.cancel)) } },
        )
    }
}
