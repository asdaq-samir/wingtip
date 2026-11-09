package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import app.wingtipmaps.android.design.generated.WingtipSpace

/**
 * A section's title, the one way every screen writes one: Title Case
 * words (decision 0021) in the heading role, 20 sp (the tokens' `heading`,
 * Material's titleLarge), and a heading to TalkBack, so a pilot can jump
 * from section to section.
 */
@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = MaterialTheme.typography.titleLarge,
        color = MaterialTheme.colorScheme.onSurface,
        modifier = modifier.padding(top = WingtipSpace.Md).semantics { heading() },
    )
}
