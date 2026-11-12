import SwiftUI

/// The flight's instruments over the map while the airplane is at flying
/// speed (#218): the groundspeed, track, GPS altitude and vertical speed;
/// with a route, the next waypoint's distance, time and arrival against
/// the desired track, and how far off the course line; Nearest one tap
/// away; and what the figures are -- a planning aid, not for navigation.
/// Every figure is the engine's (InFlight); only the writing is here.
/// Under the alerts and the radio at the top of the map, where nothing
/// else was: no panel or control moves for it.
struct InstrumentsBar: View {
    @Environment(Emergency.self) private var emergency
    @Environment(\.appCommand) private var appCommand
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(InFlight.self) private var flight

    var body: some View {
        if let fix = flight.fix, flight.underway {
            VStack(alignment: .leading, spacing: WingtipSpace.sm) {
                HStack(spacing: WingtipSpace.xs) {
                    cell("GS", fix.groundspeedKt.map { Format.number($0, decimals: 0) } ?? "—", unit: "kt",
                         spoken: fix.groundspeedKt.map { "Groundspeed \(SpokenFigures.knots($0))" })
                    cell("TRK", Self.track(fix.trackDeg, magnetic: flight.progress?.trackMagDeg),
                         spoken: fix.trackDeg.map { "Track \(SpokenFigures.degrees(flight.progress?.trackMagDeg ?? $0))" })
                    cell("ALT", fix.altitudeFt.map(Format.grouped) ?? "—", unit: "ft",
                         spoken: fix.altitudeFt.map { "GPS altitude \(Format.spokenAltitude($0))" })
                    cell("VS", Self.verticalSpeed(flight.verticalFpm), unit: "fpm",
                         spoken: flight.verticalFpm.map { "Vertical speed \(SpokenFigures.feetPerMinute(Self.roundedFpm($0)))" })
                }
                if let progress = flight.progress, progress.onRoute, let next = progress.next {
                    Divider()
                    HStack(spacing: WingtipSpace.xs) {
                        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                            Text("NEXT").font(.caption2).foregroundStyle(.secondary)
                            Text(next.name).font(.headline).lineLimit(1).minimumScaleFactor(0.7)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Next, \(next.name)")
                        cell("DIS", Format.number(next.distanceNm, decimals: next.distanceNm < 10 ? 1 : 0), unit: "nm",
                             spoken: SpokenFigures.nauticalMiles(next.distanceNm))
                        cell("ETE", next.eteMin.map(Self.minutesSeconds) ?? "—", spoken: next.eteMin.map(SpokenFigures.minutes))
                        cell("DTK", Format.heading(progress.desiredTrackMagDeg ?? progress.desiredTrackDeg),
                             spoken: "Desired track \(SpokenFigures.degrees(progress.desiredTrackMagDeg ?? progress.desiredTrackDeg))")
                    }
                    if let line = Self.offCourse(progress) {
                        Text(line).font(.footnote).foregroundStyle(.secondary)
                    }
                    if let dest = progress.destination, let eta = dest.etaS {
                        Text(Self.arrival(dest, eta: eta)).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                    }
                }
                if let problem = flight.problem {
                    Text(problem).font(.footnote).foregroundStyle(WingtipInk.caution).lineLimit(3)
                }
                HStack(alignment: .center, spacing: WingtipSpace.sm) {
                    // The one Nearest list, a card over the plan: the map
                    // under the plan's sheet presents nothing (Navigator).
                    Button { appCommand(.open(.nearest)) } label: {
                        Label("Nearest", systemImage: "airplane.arrival")
                            .font(.subheadline.weight(.semibold))
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .accessibilityHint("The nearest fields, with Divert")
                    // Flying mode's way to the emergency assistant, the
                    // web's FlyingHead Emergency (not a map button,
                    // docs/decisions/0010).
                    Button(role: .destructive) { emergency.open = .flying } label: {
                        Label("Emergency", systemImage: "exclamationmark.triangle.fill")
                            .font(.subheadline.weight(.semibold))
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .accessibilityHint("The best fields within a glide, the emergency checklist and the MAYDAY")
                    Spacer(minLength: 0)
                    // The planning aid's words, where the figures are (the
                    // web's planningAid, README's "A planning aid").
                    Text("Planning aid · not for navigation")
                        .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.trailing)
                }
            }
            .padding(WingtipSpace.md)
            .floatingGlass(in: floatingCard)
            .padding(.horizontal, WingtipSpace.md)
            // Eight figures across a phone: past the second accessibility
            // size they would not fit, so the bar stops there.
            .dynamicTypeSize(...DynamicTypeSize.accessibility2)
            .accessibilityIdentifier("instruments-bar")
        } else if flight.fix != nil, let problem = flight.problem {
            // The engine could not say whether the airplane is flying: said
            // where the bar would be, not hidden as if on the ground.
            Label(problem, systemImage: "exclamationmark.triangle")
                .font(.footnote).foregroundStyle(WingtipInk.caution)
                .padding(WingtipSpace.md)
                .floatingGlass(in: floatingCard)
                .padding(.horizontal, WingtipSpace.md)
        }
    }

    private func cell(_ name: String, _ value: String, unit: String? = nil, spoken: String?) -> some View {
        VStack(spacing: WingtipSpace.xxs) {
            Text(name).font(.caption2).foregroundStyle(.secondary)
            HStack(alignment: .firstTextBaseline, spacing: WingtipSpace.xxs) {
                Text(value).font(.headline.monospacedDigit())
                    // Groundspeed, altitude, distance and time roll to
                    // each new fix rather than blink.
                    .figureTransition(value)
                if let unit { Text(unit).font(.caption2).foregroundStyle(.secondary) }
            }
            .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken ?? "\(name), not known")
    }

    // MARK: The writing of the figures

    /// The track: magnetic as the nav log and the compass read it where
    /// the engine knows the variation (a route flown), else true, marked T.
    static func track(_ trueDeg: Double?, magnetic: Double?) -> String {
        if let magnetic { return Format.heading(magnetic) }
        guard let trueDeg else { return "—" }
        return "\(Format.heading(trueDeg))T"
    }

    /// Feet a minute to the nearest ten, as a VSI is read: a GPS's figure
    /// is no finer.
    static func roundedFpm(_ fpm: Double) -> Double { (fpm / 10).rounded() * 10 }

    /// The vertical speed signed, "+300", "-450", "0".
    static func verticalSpeed(_ fpm: Double?) -> String {
        guard let fpm else { return "—" }
        let r = roundedFpm(fpm)
        return r > 0 ? "+\(Format.grouped(r))" : Format.grouped(r)
    }

    /// Minutes as a clock counts them down, "7:05"; past an hour "1h 12m".
    static func minutesSeconds(_ minutes: Double) -> String {
        if minutes >= 60 { return Format.duration(minutes) }
        let s = Int((minutes * 60).rounded())
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    /// The UTC clock time a flight plan and ATC use, "1432Z".
    static func zulu(_ unixS: Double) -> String { Format.zulu(Date(timeIntervalSince1970: unixS)) }

    /// How far off the course line and which side; nil within a tenth.
    static func offCourse(_ p: InFlight.Progress) -> String? {
        guard let side = p.offSide, p.offNm >= 0.1 else { return nil }
        return "\(Format.distance(p.offNm)) \(side) of course"
    }

    /// The destination's arrival and the fuel the plan leaves there.
    static func arrival(_ dest: InFlight.Waypoint, eta: Double) -> String {
        var line = "\(dest.name) at \(zulu(eta)), \(Format.distance(dest.distanceNm, decimals: 0))"
        if let fuel = dest.fuelLeftGal { line += ", about \(Format.fuel(max(0, fuel))) left by the plan" }
        return line
    }
}

#Preview("InstrumentsBar") {
    InstrumentsBar()
        .environment(Plan())
        .environment(OwnShip())
        .environment(DryRun())
}
