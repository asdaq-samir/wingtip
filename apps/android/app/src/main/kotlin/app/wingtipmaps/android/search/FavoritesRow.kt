package app.wingtipmaps.android.search

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.WingtipIcons

/**
 * The one search's Favorites, one row sliding sideways as Material's
 * assist chips (the web's search page, 2026-11-14): the airplane flown
 * first, its N-number, or Add while there is none, which asks the one
 * search for it ("Search for your airplane"); the starred airports, then
 * the starred airplanes and the pilot's own; and Add at the end, Material's
 * menu of what to keep, Airport or Airplane, each asking the one search
 * ("Search for an airport to keep", "Search for an airplane to keep"). A
 * pick there is kept, not opened (KeepPick).
 */
@Composable
internal fun FavoritesRow(starred: List<Remembered>, tail: String?, onOpen: (Remembered) -> Unit, onKeep: (SearchControl.Keep) -> Unit) {
    LazyRow(contentPadding = PaddingValues(horizontal = WingtipSpace.Lg), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        item(key = "mine") {
            AssistChip(
                onClick = { if (tail != null) onOpen(Remembered(Remembered.Kind.AIRPLANE, tail)) else onKeep(SearchControl.Keep.Mine) },
                label = { Text(tail ?: stringResource(R.string.favorite_your_airplane_add)) },
                leadingIcon = { Icon(WingtipIcons.airplane, contentDescription = null, modifier = Modifier.size(AssistChipDefaults.IconSize)) },
            )
        }
        items(starred, key = { it.kind.name + it.ident }) { f ->
            // A closed field's label after its name, in the error ink (decision 0043).
            val error = MaterialTheme.colorScheme.error
            val label = buildAnnotatedString {
                append(listOf(f.ident, f.name).filter { it.isNotEmpty() }.joinToString(" "))
                f.closed?.let { withStyle(SpanStyle(color = error)) { append(" · $it") } }
            }
            AssistChip(onClick = { onOpen(f) }, label = { Text(label) })
        }
        item(key = "add") { AddChip(onKeep) }
    }
}

/** Add, at the Favorites' end: the stock menu of what to keep. */
@Composable
private fun AddChip(onKeep: (SearchControl.Keep) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        AssistChip(
            onClick = { open = true },
            label = { Text(stringResource(R.string.favorite_add)) },
            leadingIcon = { Icon(Icons.Filled.Add, contentDescription = null) },
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text(stringResource(R.string.favorite_add_airport)) }, onClick = { open = false; onKeep(SearchControl.Keep.Airport) })
            DropdownMenuItem(text = { Text(stringResource(R.string.favorite_add_airplane)) }, onClick = { open = false; onKeep(SearchControl.Keep.Airplane) })
        }
    }
}
