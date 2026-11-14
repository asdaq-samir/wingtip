package app.wingtipmaps.android.ui.card

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import app.wingtipmaps.android.design.generated.WingtipSpace

/**
 * One fact of a card's strip: its name small and grey over its value, as
 * Apple Maps' place card has Hours, Accepts and Distance (the web's
 * CardFact). `value` is the words TalkBack reads with the name ("Wind,
 * 270° 9 kt"); `content` draws it where it is more than words (a flight
 * category's badge), else the value is drawn in the row's semibold, in
 * `ink` where it says a problem (a lapsed registration). `maxWidth` caps a
 * long value (an owner's name), the whole of it on the card's Info.
 */
data class CardFact(
    val name: String,
    val value: String,
    val ink: Color? = null,
    val maxWidth: Dp? = null,
    val content: (@Composable () -> Unit)? = null,
)

/**
 * A card's facts in a row under its actions, a sideways scroller as Apple
 * Maps' place card's (the owner, 2026-11-14: C1 on the canvas, "Airport
 * card after Apple Maps"; the web's components/CardFacts): the airport
 * card's and the airplane cards' (the owner the same day: "make sure the
 * airplane card looks similar to airport card"). Each fact only where the
 * card's data has it; nothing where there is none. A sideways drag is the
 * row's, an up or down one the sheet's, through the stock nested scroll.
 */
@Composable
fun CardFacts(facts: List<CardFact>, modifier: Modifier = Modifier, tag: String = "card-facts") {
    if (facts.isEmpty()) return
    Row(
        modifier.testTag(tag).horizontalScroll(rememberScrollState()).padding(FactsPadding),
        horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Xl),
    ) {
        facts.forEach { f ->
            Column(Modifier.clearAndSetSemantics { contentDescription = "${f.name}, ${f.value}" }) {
                Text(f.name, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                val content = f.content
                if (content != null) {
                    content()
                } else {
                    Text(
                        f.value,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = f.ink ?: MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = f.maxWidth?.let { Modifier.widthIn(max = it) } ?: Modifier,
                    )
                }
            }
        }
    }
}

private val FactsPadding = PaddingValues(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Sm)
