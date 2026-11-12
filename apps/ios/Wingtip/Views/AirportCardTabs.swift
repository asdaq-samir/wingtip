import SwiftUI

/// Info: the radio, with the airspace the field is in beside its title;
/// the field's NOTAMs; the lights the mic turns on; then what is on the
/// ground. A frequency, a light or the fuel a NOTAM in force addresses has
/// its badge by its name, and a tap on its row opens that NOTAM (the owner,
/// 2026-11-11: "For anything the notam addresses, just put a badge next to
/// it", "tapping the affected thing should show the notam").
struct AirportInfoTab: View {
    let place: AirportPlace
    @Environment(FieldNotams.self) private var notams

    var body: some View {
        FlowProgramsSection()
        Section(place.airspaceClass.map { "Frequencies (Class \($0))" } ?? "Frequencies") {
            if place.frequencies.isEmpty { Text("None listed").foregroundStyle(.secondary) }
            ForEach(Array(place.frequencies.enumerated()), id: \.offset) { i, f in
                let mark = notams.marks.frequency[i]
                NotamMarked(notams: notams, mark: mark) {
                    FrequencyRowView(frequency: f, mark: mark).siriSees(SiriSaw.frequency(place.ident, f))
                }
            }
            // What some fields read out on so many clicks of the mic on
            // the CTAF: the weather, a radio check (wingtip.remarks).
            ForEach(place.radioNotes ?? [], id: \.self) { note in
                CardRow(badge: RowBadge(systemImage: "antenna.radiowaves.left.and.right", colour: Badge.traffic), title: note)
            }
        }
        // The field's own NOTAMs and the TFRs near it, after its radio.
        FieldNotamsSection()
        AirportLightsSection(place: place, marks: notams.marks.light)
        StopServicesSections(ident: place.ident, fuelMark: notams.marks.fuel)
    }
}

/// The field's lights, one system a row, as the engine read its Chart
/// Supplement remarks (the planner's lighting_read): its name with its
/// legend code ("Approach lights (MALSR)"), the runways it serves, and how
/// it is turned on ("Key the mic on CTAF when the tower is closed"); then
/// what the engine could not read, in its words; the standard keying where
/// it applies; and the remarks as written, folded. A light a NOTAM in
/// force addresses has its badge, and its row opens that NOTAM.
struct AirportLightsSection: View {
    let place: AirportPlace
    let marks: [Int: NotamMark]
    @Environment(FieldNotams.self) private var notams

    var body: some View {
        let lights = place.lights ?? []
        let notes = place.lightNotes ?? []
        if !(place.lighting ?? []).isEmpty || place.standardKeying == true {
            Section("Lights") {
                ForEach(Array(lights.enumerated()), id: \.offset) { i, light in
                    NotamMarked(notams: notams, mark: marks[i]) { row(light, mark: marks[i]) }
                }
                ForEach(notes, id: \.asWritten) { note in
                    CardRow(badge: RowBadge(systemImage: "lightbulb", colour: Badge.lights), title: note.words)
                }
                // Pilot-controlled lighting's standard keying (AIM 2-1-9):
                // seven clicks within five seconds for high intensity,
                // five for medium, three for low.
                if place.standardKeying == true {
                    LabeledContent("Keying", value: "7 high · 5 medium · 3 low")
                }
                if let lighting = place.lighting, !lighting.isEmpty {
                    DisclosureGroup("As Written") {
                        Text(lighting.joined(separator: "\n")).font(.footnote.monospaced()).foregroundStyle(.secondary).textSelection(.enabled)
                    }
                }
            }
        }
    }

    private func row(_ light: APILightingSystem, mark: NotamMark?) -> some View {
        let serves = [light.runways.isEmpty ? nil : "\(light.runways.count > 1 ? "Runways" : "Runway") \(light.runways.joined(separator: ", "))",
                      light.nonstandard ? "Non-standard" : nil].compactMap { $0 }.joined(separator: " · ")
        return HStack(spacing: WingtipSpace.md) {
            RowBadge(systemImage: "lightbulb", colour: Badge.lights)
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                Text(light.code.map { "\(light.name) (\($0))" } ?? light.name)
                if let mark { NotamMarkBadge(mark: mark) }
                if !serves.isEmpty { Text(serves).font(WingtipType.detail).foregroundStyle(.secondary) }
                if let how = light.how { Text(how).font(WingtipType.detail) }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Runways: the pattern altitude, then each runway with the wind on it,
/// Best Wind and Longest by the ones they are, and a NOTAM's badge on one
/// it addresses.
struct AirportRunwaysTab: View {
    let place: AirportPlace
    @Environment(FieldNotams.self) private var notams

    var body: some View {
        let marks = notams.marks.runway
        // Closed by a NOTAM in force as by the FAA's data: no runway shut to
        // landing and takeoff is the longest or the best (KORD's 04L/22R,
        // "CLSD EXC TAX", was badged Best Wind on the web, 2026-11-11).
        let runways = place.runways.enumerated().map { i, r in
            var r = r
            if marks[i]?.unusable == true { r.closed = true }
            return r
        }
        let best = Self.bestWind(runways)
        let longest = Self.longest(runways)
        Section {
            // The FAA's published pattern altitude, else 1,000 ft over the
            // field (AC 90-66C, 8.4), as the planner gives it.
            if let pattern = place.pattern, let altitude = pattern.altitudeFt {
                CardRow(badge: RowBadge(systemImage: "arrow.triangle.2.circlepath", colour: Badge.runway), title: "Pattern altitude",
                        detail: pattern.published == true ? "As the FAA publishes it" : "1,000 ft above the field: none published") {
                    Text(Format.altitude(altitude)).fontWeight(.semibold).accessibilityLabel(Format.spokenAltitude(altitude))
                }
            }
            if place.runways.isEmpty { Text("No runways listed").foregroundStyle(.secondary) }
            ForEach(Array(place.runways.enumerated()), id: \.offset) { i, runway in
                NotamMarked(notams: notams, mark: marks[i]) {
                    RunwayRowView(runway: runway, longest: i == longest, bestWind: i == best, mark: marks[i])
                }
            }
        }
        RvrSection()
    }

    /// The runway most nearly into the reported wind (AC 90-66C 11.5), the
    /// engine's gonogo_runway_in_use over each runway's wind on the end it
    /// favours: only where the wind chose it, not a calm field's most used.
    static func bestWind(_ runways: [Runway]) -> Int? {
        let asked = runways.map { r in
            EngineContract.Runway(closed: r.closed, surface: r.surface, lengthFt: r.lengthFt.map(Double.init),
                                  runwayEnds: r.runwayEnds?.map { .init(ident: $0.ident, headingTrueDeg: $0.headingTrueDeg) },
                                  wind: r.wind.map { .init(end: $0.end, headwindKt: $0.headwindKt, crosswindKt: $0.crosswindKt,
                                                           gustCrosswindKt: $0.gustCrosswindKt, inUse: $0.inUse) })
        }
        guard !asked.isEmpty, let flown = try? Engine.gonogoRunwayInUse(runways: asked), flown.byWind else { return nil }
        return flown.runway
    }

    /// The longest runway open, what a pilot sizes a field by; none where
    /// the field has only one open.
    static func longest(_ runways: [Runway]) -> Int? {
        let open = runways.enumerated().filter { !$0.element.closed && $0.element.lengthFt != nil }
        guard open.count > 1 else { return nil }
        return open.max { ($0.element.lengthFt ?? 0) < ($1.element.lengthFt ?? 0) }?.offset
    }
}
