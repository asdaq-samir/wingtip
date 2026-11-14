package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocalAirport
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.NearestAirport
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.airportUseWords
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.search.FieldMarks

/**
 * The fields nearest the airplane as one list, the same rows wherever
 * they show (the card rule, the owner 2026-11-10: the same thing gets the
 * same component): the one search's Nearest with nothing typed and the
 * Nearest page. A row is Material's list item, the whole row the tap that
 * opens the field's card (`onOpen`), with the miles and the way to it,
 * its longest runway, whether it is within a still-air glide at pattern
 * height (the engine's glide_reaches, AC 90-66C's 1,000 ft over the
 * field) at the picked airplane's own glide ratio, and its flight
 * category as its chip in the chart's colours. A private, military or
 * joint-use field is marked first, the engine's airport_use_words naming
 * its use as the web's Nearest does (FieldMarks).
 */
fun LazyListScope.nearestRows(fields: List<NearestAirport>, fix: OwnShip.Fix?, onOpen: (NearestAirport) -> Unit) {
    items(fields, key = { "near-" + it.ident }) { field -> NearestRow(field, fix, onClick = { onOpen(field) }) }
}

@Composable
private fun NearestRow(field: NearestAirport, fix: OwnShip.Fix?, onClick: () -> Unit, model: FlightModel = hiltViewModel()) {
    val openWord = stringResource(R.string.said_open)
    // A glide the engine could not judge says so, never "out of reach";
    // with no glide ratio (no airplane picked) none is said to be within one.
    val reach = fix?.let { model.glideReaches(it, field) }
    val use = remember(field.isPrivate, field.military) { Engine.airportUseWords(field.isPrivate, field.military).getOrNull()?.use }
    val parts = listOfNotNull(
        FieldMarks.use(use)?.let { stringResource(it) },
        "${Format.distance(field.distanceNm)} ${Format.heading(field.bearingDeg)}T",
        field.longestRunwayFt?.let { "${Format.altitude(it.toDouble())} runway" },
        reach?.fold({ if (it) "within a glide" else null }, { "glide not worked out" }),
    )
    ListItem(
        onClick = onClick,
        leadingContent = { Icon(Icons.Filled.LocalAirport, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
        supportingContent = { Text(parts.joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) },
        trailingContent = field.flightCategory?.let { c -> { CategoryChip(c) } },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth().semantics { onClick(label = openWord, action = null) },
        content = {
            Text(
                buildAnnotatedString {
                    withStyle(MaterialTheme.typography.titleMedium.toSpanStyle()) { append(field.ident) }
                    if (field.name.isNotEmpty()) withStyle(MaterialTheme.typography.bodyMedium.toSpanStyle()) { append("  " + field.name) }
                },
                maxLines = if (largeType()) 3 else 1,
                overflow = TextOverflow.Ellipsis,
            )
        },
    )
}
