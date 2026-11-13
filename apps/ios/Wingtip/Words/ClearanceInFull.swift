import Foundation

/// A clearance typed in a pilot's shorthand, or as the recognizer wrote
/// it, said in full as the controller would say it, figures as digits, by
/// Apple's on-device model (OnDeviceDocumentReader.said(clearance:), a
/// guided ClearanceTextDraft), so the engine's clearance reader
/// (read_clearance) can read more of it. The engine stays the reader: the
/// words are offered under the field and go in only on the pilot's tap,
/// and they are offered only where
///
/// - every number in them is one the words as typed hold, as digits or
///   said ("one two five point three five" is 125.35 by the engine's own
///   reading of spoken figures, `tokens`): no figure of the model's own;
/// - the engine reads every item it read from the words as typed the same
///   from them: nothing changed;
/// - and the engine reads something more from them: they add something.
///
/// Nothing leaves the phone, and nothing is shown where the model cannot
/// run (AIEvaluations' ClearanceSaidEvaluation scores it).
enum ClearanceInFull {
    /// The words offered and the items the engine reads in them that it
    /// did not read in the words as typed, as the sheet names them.
    struct Offer: Equatable, Sendable {
        let said: String
        let adds: [String]
    }

    /// The model that says the clearance in full: Apple's on the phone,
    /// or a fake in a test. Nil where it cannot run.
    typealias Model = @Sendable (String) async throws -> String?

    static let apple: Model = { try await OnDeviceDocumentReader.said(clearance: $0) }

    /// Whether the words can be offered on this iPhone at all; the row is
    /// hidden where they cannot.
    static var available: Bool { AppleModels.unavailableWhy == nil }

    /// The offer for the words as typed, or nil where the model cannot
    /// run, fails, or its words do not pass.
    static func ask(_ heard: String, model: Model = apple) async -> Offer? {
        let heard = heard.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !heard.isEmpty, let said = try? await model(heard) else { return nil }
        return offer(heard: heard, said: said)
    }

    /// The guards above, on the words as typed and the model's.
    static func offer(heard: String, said: String) -> Offer? {
        let said = said.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !said.isEmpty, said.lowercased() != heard.lowercased() else { return nil }
        // The figures the pilot's words hold, the engine's reading; where it
        // cannot read them the offer is dropped rather than checked against
        // fewer figures than were said.
        guard let tokens = try? Engine.tokens(text: heard) else {
            Log.words.info("clearance in full dropped: the words could not be read")
            return nil
        }
        let given = [heard] + tokens.compactMap(\.num)
        let invented = NumberGuard.invented(said, given: given)
        guard invented.isEmpty else {
            Log.words.info("clearance in full dropped: \(invented.count) figures of its own")
            return nil
        }
        guard let before = try? Clearance.read(heard), let after = try? Clearance.read(said) else { return nil }
        let was = items(before), now = items(after)
        // Nothing the engine read from the words as typed may change.
        for (name, value) in was where now[name] != value {
            Log.words.info("clearance in full dropped: its \(name, privacy: .public) differs")
            return nil
        }
        let adds = order.filter { was[$0] == nil && now[$0] != nil }
        return adds.isEmpty ? nil : Offer(said: said, adds: adds)
    }

    /// The items compared, in the order the sheet lays them out (AIM
    /// 4-4-3's CRAFT).
    static let order = ["clearance limit", "route", "altitude", "expected altitude", "frequency", "squawk"]

    /// The engine's reading as the items compared, each as one value.
    static func items(_ c: Clearance) -> [String: String] {
        var out: [String: String] = [:]
        if c.classB { out["clearance limit"] = "Class B" } else if let limit = c.limit { out["clearance limit"] = limit.lowercased() }
        if !c.route.isEmpty || c.asFiled {
            out["route"] = c.route.map { [$0.kind, $0.ident, $0.name, $0.number, $0.said].compactMap { $0?.lowercased() }.joined(separator: " ") }
                .joined(separator: ", ") + (c.asFiled ? " as filed" : "")
        }
        if let ft = c.maintainFt { out["altitude"] = "\(c.vfr ? "VFR " : "")\(c.maintainLimit ?? "") \(ft)" }
        if let ft = c.expectFt { out["expected altitude"] = "\(ft) \(c.expectMin.map(String.init) ?? "")" }
        if let f = c.frequency { out["frequency"] = f }
        if let s = c.squawk { out["squawk"] = s }
        return out
    }
}
