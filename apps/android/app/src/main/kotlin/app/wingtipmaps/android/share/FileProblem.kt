package app.wingtipmaps.android.share

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import kotlinx.coroutines.flow.MutableStateFlow

/** Why a file handed to the app was not taken, or what was left out of
 *  it, in Material's stock dialog over the map, where the file was
 *  dropped or opened: the iPad's WindowHost alert. OK clears it. */
@Composable
fun FileProblem(problem: MutableStateFlow<String?>) {
    val said by problem.collectAsStateWithLifecycle()
    val words = said ?: return
    AlertDialog(
        onDismissRequest = { problem.value = null },
        text = { Text(words) },
        confirmButton = { TextButton(onClick = { problem.value = null }) { Text(stringResource(R.string.ok)) } },
    )
}
