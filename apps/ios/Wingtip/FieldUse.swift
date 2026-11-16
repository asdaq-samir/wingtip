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
        if let closed, !closed.isEmpty { return Flag(words: closed, status: .closed) }
        let status: BadgeStatus? = switch use {
        case "private": .privateUse
        case "military": .military
        case "joint": .joint
        default: nil
        }
        guard let words = mark(use), let status else { return nil }
        return Flag(words: words, status: status)
    }

    /// A row's flag: its words and the badge they are set in (rules.md
    /// §9: a status is a badge), Closed, Private, Military or Joint use.
    struct Flag: Equatable {
        let words: String
        let status: BadgeStatus
    }
}

/// A row's line under its name: its flag as a badge (FieldUse), then the
/// row's detail, as the web's AirportResults writes it.
struct FieldFlagLine: View {
    let flag: FieldUse.Flag?
    let detail: String

    var body: some View {
        HStack(spacing: WingtipSpace.sm) {
            if let flag { StatusBadge(flag.status, words: flag.words) }
            if !detail.isEmpty { Text(detail).lineLimit(1) }
        }
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .accessibilityElement(children: .combine)
    }
}
