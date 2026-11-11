import SwiftUI

/// The Altitude Advisor, how the pilot chooses the cruise (the owner's spec
/// of 2026-11-10, ForeFlight's own): one row per altitude, highest first,
/// with the route's time, fuel and head or tail wind at it, Fastest and
/// Most Economical marked, and the row flown ticked. A row outside the
/// legal altitudes stays a tap like the rest, its warning under it (warn,
/// never limit). Every figure and mark is the engine's (`altitude_advisor`);
/// with no airplane there is no time or fuel, only the dash.
struct AltitudeAdvisorRows: View {
    let rows: [ProfileRules.AdvisorRow]
    let choose: (Double) -> Void

    var body: some View {
        ForEach(rows, id: \.altitudeFt) { row in
            Button { choose(row.altitudeFt) } label: { label(row) }
                .accessibilityLabel(spoken(row))
                .accessibilityAddTraits(row.flown ? .isSelected : [])
        }
    }

    private func label(_ row: ProfileRules.AdvisorRow) -> some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
            HStack(spacing: WingtipSpace.sm) {
                Text(Format.cruiseAltitude(row.altitudeFt)).font(WingtipType.row.monospaced()).foregroundStyle(.primary)
                if let mark = mark(row) {
                    Text(mark).font(.caption.weight(.semibold)).foregroundStyle(.tint)
                }
                Spacer(minLength: 0)
                if row.flown { Image(systemName: "checkmark").foregroundStyle(.tint) }
            }
            HStack(spacing: WingtipSpace.md) {
                Text(row.eteMin.map(Format.duration) ?? Format.none)
                Text(Format.fuel(row.fuelGal))
                Text(wind(row.tailwindKt))
            }
            .font(.subheadline.monospacedDigit())
            .foregroundStyle(.secondary)
            if let warning = row.warning {
                Label(warning, systemImage: "exclamationmark.triangle")
                    .font(.footnote).foregroundStyle(WingtipInk.caution)
            }
        }
    }

    private func mark(_ row: ProfileRules.AdvisorRow) -> String? {
        switch (row.fastest, row.economical) {
        case (true, true): "Fastest · Most Economical"
        case (true, false): "Fastest"
        case (false, true): "Most Economical"
        default: nil
        }
    }

    /// "+12 kt tail", "−8 kt head", the wind along the legs, helping positive.
    private func wind(_ kt: Double?) -> String {
        guard let kt else { return Format.none }
        let whole = Int(kt.rounded())
        return whole >= 0 ? "+\(whole) kt tail" : "\u{2212}\(-whole) kt head"
    }

    private func spoken(_ row: ProfileRules.AdvisorRow) -> String {
        var parts = [Format.spokenAltitude(row.altitudeFt)]
        if let mark = mark(row) { parts.append(mark) }
        if let ete = row.eteMin { parts.append(SpokenFigures.minutes(ete)) }
        if let fuel = row.fuelGal { parts.append(SpokenFigures.gallons(fuel)) }
        if let kt = row.tailwindKt {
            parts.append(kt >= 0 ? "\(SpokenFigures.knots(kt)) tailwind" : "\(SpokenFigures.knots(-kt)) headwind")
        }
        if let warning = row.warning { parts.append(warning) }
        return parts.joined(separator: ", ")
    }
}
