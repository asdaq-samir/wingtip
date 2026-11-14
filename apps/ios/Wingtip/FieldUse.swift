import SwiftUI

/// Who may land at a field and whether it is open, as every list and the
/// card say it. Who may use it is the engine's airport_use_words over the
/// planner's flags (NASR APT_BASE FACILITY_USE_CODE and
/// OWNERSHIP_TYPE_CODE): private, military-only, joint use or public.
/// Whether it is open is the planner's `closed`, NASR's ARPT_STATUS
/// through the engine's field_status ("Closed indefinitely", "Closed
/// permanently"), and a closed field is never offered as a landing field
/// (decision 0043). Only how a row writes the engine's use is the app's.
enum FieldUse {
    /// The engine's use for a field's flags, "private", "military" or
    /// "joint"; nil for a public field, or where the engine cannot say,
    /// which a row then leaves unmarked rather than guessed.
    static func code(isPrivate: Bool?, military: String?) -> String? {
        guard let use = try? Engine.airportUseWords(private: isPrivate, military: military).use, use != "public" else { return nil }
        return use
    }

    /// The card's line of who may land at a field, the engine's
    /// airport_use_words ("Private: permission required"; nil for a
    /// public or joint-use field), kept a Result so a failed rule is said
    /// on the card rather than read as a public field.
    static func cardUse(_ place: AirportPlace) -> Result<String?, any Error> {
        Result { try Engine.airportUseWords(private: place.isPrivate, military: place.military).words }
    }

    /// The card's line of how far a field's figures are to be trusted, the
    /// engine's airport_data_words over NASR's INSPECT_METHOD_CODE and
    /// date ("Owner-reported, last updated Aug 2023"; nil for an inspected
    /// field), a Result for the same reason.
    static func cardData(_ place: AirportPlace) -> Result<String?, any Error> {
        Result { try Engine.airportDataWords(dataSource: place.dataSource, infoDate: place.infoDate) }
    }

    /// A row's mark for the engine's use: "Private", "Military" or "Joint
    /// use", as the web's card writes it beside the name; nil for public.
    static func mark(_ use: String?) -> String? {
        switch use {
        case "private": "Private"
        case "military": "Military"
        case "joint": "Joint use"
        default: nil
        }
    }

    /// What a row says of a field before its name: closed first, then who
    /// may use it; nil for an open public field.
    static func flag(closed: String?, use: String?) -> Flag? {
        if let closed, !closed.isEmpty { return Flag(words: closed, kind: .closed) }
        return mark(use).map { Flag(words: $0, kind: use == "joint" ? .joint : .permission) }
    }

    /// A row's flag: its words and the ink they are set in.
    struct Flag: Equatable {
        enum Kind: Equatable { case closed, permission, joint }
        let words: String
        let kind: Kind

        /// Closed in the problem's ink, a field to ask leave of in the
        /// caution's; joint use, open to any civil pilot, as plain detail.
        var ink: Color {
            switch kind {
            case .closed: WingtipInk.problem
            case .permission: WingtipInk.caution
            case .joint: .secondary
            }
        }
    }
}
