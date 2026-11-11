import SwiftUI

/// A waypoint's altitude, from a tap on it in the profile, as ForeFlight's
/// profile sets one (the owner's spec of 2026-11-10): the altitude for the
/// leg from the waypoint, picked from the engine's altitudes, and whether
/// the climb or descent begins at the waypoint (Start At) or is done by it
/// (Cross At). The system's popover, kept a popover on the iPhone too
/// (`presentationCompactAdaptation`), so the profile stays in sight.
struct LegAltitudePopover: View {
    let ident: String
    /// The engine's altitudes, highest first.
    let rows: [Double]
    /// The leg's altitude now, feet MSL.
    let currentFt: Double?
    /// Whether the waypoint has an altitude of its own to reset.
    let own: Bool
    let startMode: LegAltitudeMode
    /// The climb or descent to an altitude, placed by the engine
    /// (`altitude_change`); nil where the waypoint is not on the route.
    let change: (Double, LegAltitudeMode) -> Result<ProfileRules.Change?, any Error>
    let set: (Int?, LegAltitudeMode) -> Void

    @State private var picked: Double?
    @State private var mode: LegAltitudeMode?

    var body: some View {
        let altitude = picked ?? currentFt ?? rows.last ?? 0
        VStack(alignment: .leading, spacing: WingtipSpace.md) {
            Text(ident).font(.headline.monospaced())
            Picker("Altitude", selection: Binding(get: { altitude }, set: { picked = $0 })) {
                ForEach(rows, id: \.self) { ft in
                    Text(Format.cruiseAltitude(ft)).monospacedDigit()
                        .accessibilityLabel(Format.spokenAltitude(ft))
                        .tag(ft)
                }
            }
            .pickerStyle(.menu)
            Picker("Where", selection: Binding(get: { mode ?? startMode }, set: { mode = $0 })) {
                ForEach(LegAltitudeMode.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            Text((mode ?? startMode) == .startAt ? "The climb or descent begins at \(ident)." : "The climb or descent is done by \(ident).")
                .font(.footnote).foregroundStyle(.secondary)
            let placed = change(altitude, mode ?? startMode)
            if let line = (try? placed.get())?.flatMap(Self.words) { Text(line).font(.footnote).monospacedDigit() }
            ProblemLine(placed, "The climb or descent")
            HStack(spacing: WingtipSpace.sm) {
                if own {
                    Button("Reset", role: .destructive) { set(nil, .crossAt) }
                        .glassButton()
                }
                Spacer(minLength: 0)
                Button("Set") { set(Int(altitude), mode ?? startMode) }
                    .glassProminentButton()
            }
        }
        .padding(WingtipSpace.lg)
        .frame(minWidth: 280)
        .presentationCompactAdaptation(.popover)
    }

    /// "Climb from 28 to 33 nm, 400 ft/nm, 4 min, 0.6 gal": the engine's
    /// figures written; no time or fuel without an airplane.
    static func words(_ change: ProfileRules.Change) -> String? {
        guard change.kind != "level" else { return nil }
        var parts = ["\(change.kind == "climb" ? "Climb" : "Descent") from \(Format.number(change.beginsNm, decimals: 0)) to \(Format.number(change.endsNm, decimals: 0)) nm"]
        if let gradient = change.ftPerNm { parts.append("\(Format.number(gradient, decimals: 0)) ft/nm") }
        if let minutes = change.minutes { parts.append(Format.duration(minutes)) }
        if let gallons = change.gallons { parts.append(Format.fuel(gallons)) }
        return parts.joined(separator: ", ")
    }
}
