import Foundation

/// An airplane's category, class and gear as the gateway keeps them on a
/// logbook entry ("airplane", "single-engine land", a tailwheel or not),
/// which passenger currency is judged in (14 CFR 61.57(a)(1)(i)-(ii)). The
/// phone knows them only where the pilot's logbook has said them for the
/// same N-number, the same airplane; else none, which the engine counts
/// toward no passenger currency and says it can't tell (the gateway's
/// dayPassengersUnknown), never guessed from a type. Android's AirplaneKind.
nonisolated struct AirplaneKind: Equatable, Sendable {
    var category: String?
    var aircraftClass: String?
    var tailwheel: Bool?

    /// The airplane `tail`'s, each column from the pilot's newest entry of
    /// that N-number that says it; nil where none says any.
    static func of(_ entries: [LogbookEntry]?, tail: String?) -> AirplaneKind? {
        guard let n = tail?.trimmingCharacters(in: .whitespaces), !n.isEmpty else { return nil }
        let its = (entries ?? []).filter { $0.aircraft?.trimmingCharacters(in: .whitespaces).caseInsensitiveCompare(n) == .orderedSame }
            .sorted { $0.flownOn > $1.flownOn }
        let kind = AirplaneKind(category: its.lazy.compactMap(\.category).first, aircraftClass: its.lazy.compactMap(\.aircraftClass).first,
                                tailwheel: its.lazy.compactMap(\.tailwheel).first)
        return kind.category != nil || kind.aircraftClass != nil || kind.tailwheel != nil ? kind : nil
    }
}

extension LogbookEntryRequest {
    /// The airplane's category, class and gear set from `kind`, each none
    /// where it is not known.
    nonisolated func flying(_ kind: AirplaneKind?) -> LogbookEntryRequest {
        var request = self
        request.category = kind?.category
        request.aircraftClass = kind?.aircraftClass
        request.tailwheel = kind?.tailwheel
        return request
    }
}
