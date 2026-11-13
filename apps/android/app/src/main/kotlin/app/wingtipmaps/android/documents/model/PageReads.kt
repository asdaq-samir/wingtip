package app.wingtipmaps.android.documents.model

import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// A photographed page as the phone reads it (ai/read/OnPhoneReader) and the
// engine checks it. The figures and the checks are the engine contract's
// own types (handbook_read_check, logbook_read_check), named here as the
// screens read them; only the read as a whole and a clearance's words,
// which no engine rule takes or answers, are the app's.

/** A handbook page's figures as read, handbook_read_check's input. */
typealias HandbookRead = EngineContract.HandbookReadCheckInput

/** handbook_read_check's answer: the items to confirm, every figure in
 *  the app's units, and the airplane form's figures. */
typealias HandbookCheck = EngineContract.HandbookReadCheckAnswer
typealias HandbookFigures = EngineContract.HandbookReadCheckAnswerHandbook
typealias HandbookFigure = EngineContract.HandbookReadCheckAnswerItemsItemFiguresItem
typealias HandbookProfile = EngineContract.HandbookReadCheckAnswerProfile
typealias DocumentFlag = EngineContract.DocumentFlag

/** A logbook page's rows as read, logbook_read_check's input. */
typealias LogbookPageRead = EngineContract.LogbookReadCheckInput
typealias LogbookCheck = EngineContract.LogbookReadCheckAnswer
typealias LogbookRowCheck = EngineContract.LogbookReadCheckAnswerRowsItem

/** A row as the gateway's LogbookEntryRequest takes it; `flownOn` is null
 *  where no date was read, and such a row cannot be saved. */
typealias LogbookEntryDraft = EngineContract.LogbookReadCheckAnswerRowsItemEntry

/**
 * The page read and checked: the read (the engine rule's input, for the
 * app to edit and ask again), the engine's answer, notes on the read, and
 * the model. `unreadable` with nothing else where the page could not be
 * read at all.
 */
@Serializable
data class DocumentRead(
    val kind: String,
    val model: String,
    val clearance: ClearanceNote? = null,
    val handbook: HandbookRead? = null,
    @SerialName("handbook_check") val handbookCheck: HandbookCheck? = null,
    val logbook: LogbookPageRead? = null,
    @SerialName("logbook_check") val logbookCheck: LogbookCheck? = null,
    val notes: List<String>? = null,
    val unreadable: String? = null,
)

/** A clearance or ATIS copied down in a pilot's shorthand: as written, line
 *  by line, and as the controller said it, figures as digits, nothing added. */
@Serializable
data class ClearanceNote(val said: String, val written: String)
