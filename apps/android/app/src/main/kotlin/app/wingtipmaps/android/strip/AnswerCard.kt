package app.wingtipmaps.android.strip

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.AssistantSource
import app.wingtipmaps.android.api.AssistantTurn
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.WingtipIcons

/**
 * The assistant's last answer, a card over the strip: "Ask" at its head
 * with Stop while it is answering and the close that forgets the
 * conversation; the answer's words as they stream, with the chips of the
 * reports they rest on, and why where the stream broke. Back closes it,
 * as its close does, before anything under it.
 */
@Composable
internal fun AnswerCard(
    turn: AssistantTurn,
    answering: Boolean,
    status: String?,
    onStop: () -> Unit,
    onClose: () -> Unit,
    onSource: (AssistantSource) -> Unit,
    modifier: Modifier = Modifier,
) {
    BackHandler(onBack = onClose)
    StripCard(modifier = modifier.fillMaxWidth()) {
        Column(Modifier.padding(start = WingtipSpace.Lg, end = WingtipSpace.Xs, top = WingtipSpace.Xs, bottom = WingtipSpace.Md), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.ask), style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                if (answering) {
                    TextButton(onClick = onStop) {
                        Icon(Icons.Filled.Stop, contentDescription = null, modifier = Modifier.size(WingtipSpace.Lg))
                        Text(stringResource(R.string.stop))
                    }
                }
                IconButton(onClick = onClose) { Icon(WingtipIcons.close, contentDescription = stringResource(R.string.close)) }
            }
            if (status != null) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                    Loading(Modifier.size(WingtipSpace.Lg))
                    Text(status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (turn.content.isNotEmpty()) {
                Text(turn.content, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(end = WingtipSpace.Md))
            }
            if (turn.sources.isNotEmpty()) {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                    turn.sources.forEach { s -> AssistChip(onClick = { onSource(s) }, label = { Text(s.label) }) }
                }
            }
            ProblemLine(turn.problem)
        }
    }
}
