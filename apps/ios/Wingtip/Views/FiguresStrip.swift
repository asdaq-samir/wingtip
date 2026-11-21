import SwiftUI

/// The flight's figures in one line -- To, Dist, ETE, Trk, and GPS Alt
/// whenever the airplane's position is known -- what the web app's strip
/// shows at the sheet's foot (FlightLine), and what the pilot glances at
/// in the air. Track took the fuel's place (the owner, 2026-11-21:
/// "replace Fuel with Track"): the fuel is FPL's gauges at each field
/// (TimelineGauge), the nav log's and the Brief's. In flight and in a
/// dry run no To, which the flying head names.
struct FiguresStrip: View {
    @Environment(InFlight.self) private var inFlight
    @Environment(\.appCommand) private var appCommand
    @Environment(Plan.self) private var plan

    /// In the air on the route -- moving, within 3 nm of the line (the
    /// engine's `in_flight`, InFlight) -- the figures count down from where
    /// the airplane is, as the web app's do in a dry run: what is left to
    /// the destination at the groundspeed now.
    private var flying: (leftNm: Double, minutes: Double?)? {
        guard let progress = inFlight.progress, progress.onRoute else { return nil }
        return (progress.destination?.distanceNm ?? progress.leftNm, progress.destination?.eteMin)
    }

    var body: some View {
        // The figures open the nav log they add up, leg by leg (tap what
        // you see, docs/navigation.md), as the web's distance does: a
        // stock Button, plain so the strip keeps its own look.
        if plan.routed {
            Button { appCommand(.open(.navlog)) } label: { figures.contentShape(Rectangle()) }
                .buttonStyle(.plain)
                .accessibilityHint("Opens the nav log")
        } else {
            figures
        }
    }

    @ViewBuilder private var figures: some View {
        FigureRow {
            if flying == nil { stripFigure("TO", plan.routed ? plan.dest : "—") }
            if let flying {
                stripFigure("DIST", Format.distance(flying.leftNm), spoken: SpokenFigures.nauticalMiles(flying.leftNm))
                stripFigure("ETE", flying.minutes.map(Format.duration) ?? "—", spoken: flying.minutes.map(SpokenFigures.minutes))
            } else {
                let distance = plan.totals?.distanceNm ?? plan.course?.distanceNm
                stripFigure("DIST", distance.map { Format.distance($0) } ?? "—", spoken: distance.map(SpokenFigures.nauticalMiles))
                // The time is an airplane's, and none is assumed (docs/decisions/0011).
                let ete = plan.airplaneChosen ? plan.totals?.eteMin : nil
                stripFigure("ETE", ete.map(Format.duration) ?? "—", spoken: ete.map(SpokenFigures.minutes))
            }
            let track = StripTrack.of(inFlight.fix, underway: inFlight.underway, magneticDeg: inFlight.progress?.trackMagDeg)
            stripFigure("TRK", track.map(Format.heading) ?? "—", spoken: track.map { "magnetic, \(SpokenFigures.degrees($0))" } ?? "none from this position")
            if let fix = inFlight.fix {
                let feet = fix.altitudeFt.map(StripTrack.tens)
                stripFigure("GPS ALT", feet.map { "\(Format.grouped($0)) ft" } ?? "—", spoken: feet.map { Format.spokenAltitude($0) })
            }
        }
        .padding(.horizontal)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}

/// The strip's track and GPS height, as the web's trackFigure and
/// gpsFigure give them.
@MainActor
enum StripTrack {
    /// The airplane's track over the ground in degrees magnetic, as a
    /// pilot flies and ATC assigns headings by the compass: the engine's
    /// own on the route (`in_flight`'s track_mag_deg), else the fix's true
    /// course less the engine's WMM variation there (`magnetic_variation`;
    /// "east is least", FAA-H-8083-25C, ch. 16). None with no fix, no
    /// course in it (a GPS gives none while stationary), or below flying
    /// speed (the engine's `underway`): a course at a walk is noise.
    static func of(_ fix: OwnShip.Fix?, underway: Bool, magneticDeg: Double?) -> Double? {
        guard let fix, underway, let trueDeg = fix.trackDeg, trueDeg.isFinite else { return nil }
        if let magneticDeg { return magneticDeg }
        let variation = try? Engine.magneticVariation(lat: fix.coordinate.latitude, lon: fix.coordinate.longitude)
        return Emergency.magnetic(trueDeg, variationDeg: variation)
    }

    /// The GPS's height to the nearest 10 ft, no finer than a GPS gives
    /// it: Core Location's altitude over mean sea level by its geoid model
    /// (OwnShip), never the altimeter's, which is set to the local
    /// pressure (14 CFR 91.121).
    static func tens(_ feet: Double) -> Double { (feet / 10).rounded() * 10 }
}

/// A strip's figures side by side, or one under another at the
/// accessibility text sizes, where four across a phone would be squeezed
/// or cut: every figure kept whole at any size the pilot reads at.
struct FigureRow<Content: View>: View {
    @ViewBuilder let content: Content
    @Environment(\.dynamicTypeSize) private var size

    var body: some View {
        let layout = size.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: WingtipSpace.xs)) : AnyLayout(HStackLayout())
        layout { content }
    }
}

/// One figure of a strip, its name over it: the sheet's strip and FPL's
/// totals. `spoken` is the figure as VoiceOver says it (SpokenFigures),
/// where the written one would be read as letters.
func stripFigure(_ name: String, _ value: String, spoken: String? = nil, warn: Bool = false) -> some View {
    StripFigure(name: name, value: value, warn: warn)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(stripFigureName(name)), \(spoken ?? value)\(warn ? ", under the reserve" : "")")
}

/// The figure under its name; at the accessibility sizes, its name at the
/// left and the figure at the right of its own line (FigureRow), the
/// figure free to wrap rather than be cut.
private struct StripFigure: View {
    let name: String
    let value: String
    let warn: Bool
    @Environment(\.dynamicTypeSize) private var size

    var body: some View {
        let layout = size.isAccessibilitySize ? AnyLayout(HStackLayout(spacing: WingtipSpace.sm)) : AnyLayout(VStackLayout(spacing: WingtipSpace.xxs))
        // Always on a solid ground (the iPhone's sheet, the iPad's card at
        // the map's foot, SplitLayout), so the system's own inks hold 4.5:1.
        layout {
            Text(name).font(.caption2).foregroundStyle(.secondary)
            if size.isAccessibilitySize { Spacer(minLength: 0) }
            HStack(spacing: WingtipSpace.xs) {
                // A mark with the red, for a pilot who does not see the
                // colour (the owner's rule: warn, never limit).
                if warn { Image(systemName: "exclamationmark.triangle.fill").font(.caption2) }
                Text(value).font(.headline.monospacedDigit().weight(.semibold))
                    // ETE, fuel and distance roll as they count down.
                    .figureTransition(value)
            }
            .foregroundStyle(warn ? WingtipInk.problem : Color.primary)
            .lineLimit(size.isAccessibilitySize ? nil : 1)
            .minimumScaleFactor(size.isAccessibilitySize ? 1 : 0.8)
        }
        .frame(maxWidth: .infinity)
    }
}

/// The strip's short headings in full for VoiceOver.
private func stripFigureName(_ name: String) -> String {
    switch name {
    case "TO": "To"
    case "DIST": "Distance"
    case "ETE": "Time en route"
    case "TRK": "Track"
    case "GPS ALT": "GPS altitude"
    default: name
    }
}

#Preview("FiguresStrip") {
    // The totals come with the planner's nav log, so the figures past the
    // destination show as dashes here.
    let plan = Plan()
    plan.dep = "KDLH"
    plan.dest = "KHIB"
    return FiguresStrip()
        .environment(plan)
        .environment(OwnShip())
        .environment(DryRun())
}
