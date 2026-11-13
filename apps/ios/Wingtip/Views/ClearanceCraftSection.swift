import SwiftUI

/// The clearance heard, laid out as CRAFT (cleared to, route, altitude,
/// frequency, transponder; AIM 4-4-3 lists what a clearance holds, in
/// that order), each place as the planner or the kept packs found it:
/// sure, or one to check (in caution, with "Check"; not found, in the
/// problem's ink). Every value is in the figure's tabular digits; one to
/// check is changed in the transcript's words under it.
struct ClearanceCraftSection: View {
    let clearance: Clearance
    let found: ClearancePlaces?
    /// When the clearance shown was heard, where it came off the radio.
    let heardAt: Date?

    var body: some View {
        // No Play: the listener keeps the words, not the sound.
        Section {
            if clearance.classB {
                craft("Cleared to", Text("Class Bravo airspace"), spoken: "Class Bravo airspace")
            } else if let limit = clearance.limit {
                craft("Cleared to", found?.limit.map(placeText) ?? Text(limit.capitalized), spoken: found?.limit?.name ?? limit)
            }
            if !clearance.route.isEmpty || clearance.asFiled {
                craft("Route", routeText, spoken: nil)
            }
            if let altitudeWords {
                craft("Altitude", Text(altitudeWords), spoken: altitudeSpoken)
            }
            if let frequency = clearance.frequency {
                craft("Frequency", Text("\(clearance.facility?.capitalized ?? "") \(frequency)".trimmingCharacters(in: .whitespaces)),
                      spoken: "\(clearance.facility ?? "") \(SpokenFigures.digits(frequency))").frequencyActions(frequency)
            }
            if let squawk = clearance.squawk {
                craft("Transponder", Text(squawk), spoken: SpokenFigures.digits(squawk))
            }
        } header: {
            Text(heardAt.map { "Heard \(Format.time($0))" } ?? "Heard")
        }
    }

    private static func altitude(_ ft: Int) -> String {
        // AIM 4-2-9: feet below 18,000, a flight level from there up.
        Altitudes.said(Double(ft))
    }

    private func placeText(_ place: ClearancePlaces.Place) -> Text {
        guard let ident = place.ident else { return Text("“\(place.said)” · Check").foregroundStyle(WingtipInk.problem) }
        return place.sure == true ? Text(ident) : Text("\(ident) · Check").foregroundStyle(WingtipInk.caution)
    }

    /// Whether any place found is a guess or not found: one to check.
    static func unsure(_ found: ClearancePlaces?) -> Bool {
        guard let found else { return false }
        let places = [found.limit].compactMap { $0 } + (found.route ?? []).flatMap { $0 }
        return places.contains { $0.ident == nil || $0.sure != true }
    }

    private var routeText: Text {
        var parts: [Text] = []
        var run = 0
        for item in clearance.route {
            switch item.kind {
            case "vectors": parts.append(Text("Radar vectors"))
            case "heading": parts.append(Text("Heading \(Format.heading(Double(item.degrees ?? 0)))"))
            case "airway": parts.append(Text(item.ident ?? ""))
            case "places":
                let places = found.flatMap { $0.route.flatMap { run < $0.count ? $0[run] : nil } }
                    ?? [ClearancePlaces.Place(said: item.said ?? "", ident: item.said?.uppercased(), sure: true)]
                parts += places.map(placeText)
                run += 1
            default:
                let picked = item.kind == "departure" ? found?.departure : found?.arrival
                parts.append(Text(picked.map { $0.id + ($0.transition.map { ".\($0)" } ?? "") }
                        ?? "\((item.name ?? "").capitalized) \(item.number ?? "") \(item.kind)"))
            }
        }
        if clearance.asFiled { parts.append(Text("as filed")) }
        return parts.enumerated().reduce(Text("")) { all, part in part.offset == 0 ? part.element : Text("\(all) → \(part.element)") }
    }

    /// The altitudes in one line: "Maintain 5,000 ft, expect 9,000 ft 10
    /// min after departure".
    private var altitudeWords: String? {
        var parts: [String] = []
        if let ft = clearance.maintainFt {
            parts.append("Maintain " + (clearance.vfr ? "VFR " : "") + (clearance.maintainLimit.map { "\($0) " } ?? "") + Self.altitude(ft))
        }
        if let ft = clearance.expectFt {
            parts.append("expect " + Self.altitude(ft) + (clearance.expectMin.map { " \($0) min after departure" } ?? ""))
        }
        guard !parts.isEmpty else { return nil }
        let line = parts.joined(separator: ", ")
        return line.prefix(1).uppercased() + line.dropFirst()
    }

    /// The same for VoiceOver, each altitude in words (SpokenFigures).
    private var altitudeSpoken: String {
        var parts: [String] = []
        if let ft = clearance.maintainFt { parts.append("maintain " + (clearance.vfr ? "VFR " : "") + (clearance.maintainLimit.map { "\($0) " } ?? "") + Format.spokenAltitude(Double(ft))) }
        if let ft = clearance.expectFt { parts.append("expect " + Format.spokenAltitude(Double(ft)) + (clearance.expectMin.map { " \(SpokenFigures.minutes(Double($0))) after departure" } ?? "")) }
        return parts.joined(separator: ", ")
    }

    /// One CRAFT line, its figures said in words to VoiceOver where the
    /// screen writes them as figures.
    private func craft(_ name: String, _ value: Text, spoken: String?) -> some View {
        LabeledContent(name) { value.multilineTextAlignment(.trailing).font(.body.weight(.semibold).monospacedDigit()) }
            .accessibilityElement(children: spoken == nil ? .combine : .ignore)
            .accessibilityLabel(spoken.map { "\(name), \($0)" } ?? "")
    }
}
