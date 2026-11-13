import Foundation

/// A logbook entry's remark drafted on the phone, as Android's Draft a
/// Remark does it (AiSources.logbook): Apple's on-device model words the
/// entry's own facts as typed -- the date, the route, the airplane, the
/// times and the landings, 14 CFR 61.51(b)'s columns -- and, for a flight
/// drawn from its track, what the engine found flown in it
/// (logbook_from_track through the planner's /api/logbook-draft: the
/// approaches and how each ended, the holds, each landing and takeoff
/// and whether at night). A sentence is kept only where it cites the
/// facts it rests on and quotes no number they do not hold (Words.checked,
/// NumberGuard): a remark cannot carry a time or a count the entry does
/// not have. The draft goes into the Remarks field for the pilot to keep,
/// change or clear; nothing is saved until they Save or Log.
enum RemarkDraft {
    /// The remark is the Remarks column: at most this many sentences.
    static let most = 2

    /// A figure, as the model reads it and a chip would open it.
    private static func fact(_ id: String, _ label: String, _ parts: [String?]) -> WordsSource? {
        let text = parts.compactMap { $0 }.joined(separator: ", ")
        return text.isEmpty ? nil : WordsSource(id: id, label: label, text: text)
    }

    private static func hours(_ name: String, _ h: Double) -> String? {
        h > 0 ? "\(name) \(Format.hours(h))" : nil
    }

    private static func count(_ name: String, _ n: Int) -> String? {
        n > 0 ? "\(name) \(n)" : nil
    }

    /// The entry's facts as typed: what the Remarks field sits under.
    static func figures(_ e: LogbookEntryRequest) -> [WordsSource] {
        let airplane = [e.aircraft, e.aircraftType.map { "(\($0))" }].compactMap { $0?.isEmpty == false ? $0 : nil }.joined(separator: " ")
        return [
            fact("entry", "Logbook entry", ["flown \(e.flownOn)", e.route.flatMap { $0.isEmpty ? nil : "route \($0)" },
                                            airplane.isEmpty ? nil : "airplane \(airplane)"]),
            fact("times", "Times", [hours("total", e.totalHours), hours("night", e.nightHours), hours("cross-country", e.crossCountryHours),
                                    hours("dual received", e.dualHours), hours("solo", e.soloHours), hours("simulated instrument", e.instrumentHours)]),
            fact("landings", "Landings", [count("day landings", e.dayLandings), count("night full-stop landings", e.nightLandings),
                                          count("at towered fields", e.toweredLandings), count("touch-and-goes", e.touchAndGoes)]),
            fact("instrument", "Instrument", [count("approaches", e.approaches), e.holding ? "holding" : nil, e.tracking ? "intercepting and tracking" : nil]),
            fact("distance", "Distance", [e.distanceNm > 0 ? "\(Format.distance(e.distanceNm)) flown" : nil,
                                          e.longestLegNm > 0 ? "longest leg \(Format.distance(e.longestLegNm))" : nil]),
        ].compactMap { $0 }
    }

    /// A flight drawn from its track: the entry as it stands with the
    /// pilot's changes, then what the engine found flown in the track.
    static func figures(_ draft: AutoLogbook.Draft, entry: LogbookEntryRequest) -> [WordsSource] {
        var out = figures(entry)
        let approaches = draft.approaches.map { "\($0.name) at \($0.airport), \($0.outcome.replacingOccurrences(of: "_", with: " "))" }
        if let f = fact("track:approaches", "Approaches flown", approaches) { out.append(f) }
        let holds = draft.holds.map { h in "\(h.racetracks) racetracks in a hold" + (h.fix.map { " at \($0)" } ?? "") }
        if let f = fact("track:holds", "Holds flown", holds) { out.append(f) }
        let landings = draft.landings.map { l in
            [l.kind.replacingOccurrences(of: "_", with: " "), l.field.map { "at \($0)" }, l.night ? "at night" : nil].compactMap { $0 }.joined(separator: " ")
        }
        if let f = fact("track:landings", "Landings flown", landings) { out.append(f) }
        return out
    }

    /// The remark, or why there is none in a pilot's words.
    static func draft(_ figures: [WordsSource], device: any WordsProvider = OnDeviceWords()) async -> Result<String, WordsUnavailable> {
        guard !figures.isEmpty else { return .failure(WordsUnavailable(why: "The entry has nothing to word yet.")) }
        do {
            let words = try await device.words(WordsAsk(kind: .remark, figures: figures))
            // Checked here too, whoever wrote them: cited facts only, and
            // no number the facts they cite do not hold.
            let checked = NumberGuard.kept(Words.checked(words.sentences, sources: figures, model: words.model, most: most))
            let kept = checked.sentences.map(\.text)
            guard !kept.isEmpty else {
                return .failure(WordsUnavailable(why: "No remark: the words written quoted figures the entry does not have."))
            }
            return .success(kept.joined(separator: " "))
        } catch {
            return .failure((error as? WordsUnavailable) ?? WordsUnavailable(why: "Apple's on-device model could not write a remark."))
        }
    }
}
