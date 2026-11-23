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
                // The pointer's highlight over the figures on an iPad,
                // where they float over the map (HIG Pointing devices).
                .hoverEffect(.highlight)
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
    @Environment(\.glanceFigures) private var glance

    var body: some View {
        let layout = size.isAccessibilitySize ? AnyLayout(HStackLayout(spacing: WingtipSpace.sm)) : AnyLayout(VStackLayout(spacing: WingtipSpace.xxs))
        // At arm's length (the iPad's strip over the map, on a kneeboard or
        // a yoke mount) a size up each, both still Dynamic Type's styles:
        // HIG Designing for iPadOS, "Use viewing distance and input mode to
        // help you determine the size and density of the onscreen content".
        let nameFont: Font = glance ? .footnote : .caption2
        let valueFont: Font = glance ? .title2 : .headline
        // Always on a solid ground, the sheet's colour (the iPhone's sheet,
        // the iPad's card at the map's foot, SplitLayout): the names in the
        // tokens' muted ink and semibold, the figures in the primary. The
        // system's secondary label there, regular, was drawn no darker
        // than #97979c on the sheet's #f2f2f7, and the iPad's audit failed
        // TO and ETE on every page; the muted ink alone, regular, still
        // drew its thin strokes no darker than #7c7c7c, and was failed
        // the same (AccessibilityAuditTests, 2026-11-22).
        layout {
            Text(name).font(nameFont.weight(.semibold)).foregroundStyle(WingtipInk.muted)
            if size.isAccessibilitySize { Spacer(minLength: 0) }
            HStack(spacing: WingtipSpace.xs) {
                // A mark with the red, for a pilot who does not see the
                // colour (the owner's rule: warn, never limit).
                if warn { Image(systemName: "exclamationmark.triangle.fill").font(nameFont) }
                Text(value).font(valueFont.monospacedDigit().weight(.semibold))
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

extension EnvironmentValues {
    /// Set on the iPad's strip over the map (SplitLayout), read at arm's
    /// length: its figures a size up (StripFigure). The iPhone's strip and
    /// FPL's totals keep theirs.
    @Entry var glanceFigures = false
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
