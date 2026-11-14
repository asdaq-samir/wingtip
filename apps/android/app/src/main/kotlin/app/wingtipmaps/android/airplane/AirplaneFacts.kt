package app.wingtipmaps.android.airplane

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.AircraftModel
import app.wingtipmaps.android.api.generated.AircraftRegistration
import app.wingtipmaps.android.ui.card.CardFact
import app.wingtipmaps.android.ui.card.CardFacts

/**
 * What an airplane's fact strip says, kept as what it means so a unit test
 * reads it without a screen (the web's AirplaneFacts): from the FAA
 * aircraft registry's record (wingtip.registry), its reference model's
 * figures over the record's own where the card has them, each only where
 * there is one. `owner` is null where the record has none to say: "Not in
 * the record" then, the name withheld under 49 U.S.C. 44114(b).
 */
data class AirplaneFactsSaid(
    val type: String?,
    val year: String?,
    val seats: Int?,
    val engines: Int?,
    val registration: String?,
    val lapsed: Boolean,
    val hasRecord: Boolean,
    val owner: String?,
) {
    val empty: Boolean get() = !hasRecord && type == null && year == null

    companion object {
        /** `type` and `year` stand in where the registry has no record (a
         *  tracked flight's traffic type). */
        fun of(record: AircraftRegistration?, model: AircraftModel? = null, type: String? = null, year: String? = null): AirplaneFactsSaid =
            AirplaneFactsSaid(
                type = listOfNotNull(record?.manufacturer, record?.model).joinToString(" ").ifEmpty { null } ?: type?.ifEmpty { null },
                year = record?.year?.toString() ?: year?.ifEmpty { null },
                seats = model?.seats ?: record?.seats,
                engines = model?.engines ?: record?.engines,
                registration = record?.status?.ifEmpty { null },
                lapsed = record?.standing == LAPSED,
                hasRecord = record != null,
                owner = record?.owner,
            )

        private const val LAPSED = "lapsed"
    }
}

/**
 * An airplane's facts in the sideways strip under its card's actions, as
 * the airport card has its own (the owner, 2026-11-14: "make sure the
 * airplane card looks similar to airport card"): Type, Year, Seats,
 * Engines, Registration (in the error ink where it has lapsed) and Owner,
 * public as the FAA publishes it (the owner, 2026-11-14: "For owner info
 * though, it's public info"), capped to a width, the whole of it in Info.
 * The N-number's card and a tracked flight's. Nothing where there is
 * nothing to say: its room is the pictures'.
 */
@Composable
fun AirplaneFacts(said: AirplaneFactsSaid) {
    if (said.empty) return
    val facts = listOfNotNull(
        said.type?.let { CardFact(stringResource(R.string.airplane_fact_type), it) },
        said.year?.let { CardFact(stringResource(R.string.airplane_fact_year), it) },
        said.seats?.let { CardFact(stringResource(R.string.airplane_fact_seats), it.toString()) },
        said.engines?.let { CardFact(stringResource(R.string.airplane_fact_engines), it.toString()) },
        said.registration?.let { CardFact(stringResource(R.string.airplane_fact_registration), it, ink = if (said.lapsed) MaterialTheme.colorScheme.error else null) },
        if (said.hasRecord) CardFact(stringResource(R.string.airplane_fact_owner), said.owner ?: stringResource(R.string.info_not_in_record), maxWidth = OwnerWidth) else null,
    )
    CardFacts(facts, tag = "airplane-facts")
}

/** An owner's name capped to about the width of a long one's start. */
private val OwnerWidth = 224.dp
