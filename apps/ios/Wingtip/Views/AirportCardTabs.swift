import SwiftUI

/// Info: the radio, with the airspace the field is in beside its title;
/// the lights the mic turns on; then what is on the ground.
struct AirportInfoTab: View {
    let place: AirportPlace

    var body: some View {
        FlowProgramsSection()
        Section(place.airspaceClass.map { "Frequencies (Class \($0))" } ?? "Frequencies") {
            if place.frequencies.isEmpty { Text("None listed").foregroundStyle(.secondary) }
            ForEach(Array(place.frequencies.enumerated()), id: \.offset) { _, f in FrequencyRowView(frequency: f).siriSees(SiriSaw.frequency(place.ident, f)) }
            // What some fields read out on so many clicks of the mic on
            // the CTAF: the weather, a radio check (wingtip.remarks).
            ForEach(place.radioNotes ?? [], id: \.self) { note in
                CardRow(badge: RowBadge(systemImage: "antenna.radiowaves.left.and.right", colour: Badge.traffic), title: note)
            }
        }
        if !(place.lighting ?? []).isEmpty || place.standardKeying == true {
            Section("Lights") {
                ForEach(place.lighting ?? [], id: \.self) { note in
                    CardRow(badge: RowBadge(systemImage: "lightbulb", colour: Badge.lights), title: note)
                }
                // Pilot-controlled lighting's standard keying (AIM 2-1-9):
                // seven clicks within five seconds for high intensity,
                // five for medium, three for low.
                if place.standardKeying == true {
                    LabeledContent("Keying", value: "7 high · 5 medium · 3 low")
                }
            }
        }
        StopServicesSections(ident: place.ident)
    }
}

/// Runways: the pattern altitude, then each runway with the wind on it.
struct AirportRunwaysTab: View {
    let place: AirportPlace

    var body: some View {
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
            ForEach(Array(place.runways.enumerated()), id: \.offset) { _, runway in RunwayRowView(runway: runway) }
        }
        RvrSection()
    }
}
