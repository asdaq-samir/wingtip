import SwiftUI

/// The flight's figures in one line -- To, Dist, ETE, Fuel -- what the
/// web app's pill shows at the sheet's foot (FlightLine), and what the
/// pilot glances at in the air. The fuel is the engine's `strip_fuel`,
/// the web's and Android's: the fuel required, less what a flight under
/// way has burnt, red where the tanks do not hold it and its reserve (14
/// CFR 91.151, 91.167).
struct FiguresStrip: View {
    @Environment(Plan.self) private var plan

    /// In the air on the route -- moving, within 3 nm of the line (the
    /// engine's `in_flight`, InFlight) -- the figures count down from where
    /// the airplane is, as the web app's do in a dry run: what is left to
    /// the destination at the groundspeed now, and the fuel still required.
    private var flying: (leftNm: Double, minutes: Double?, fuelGal: Double?)? {
        guard let progress = InFlight.shared.progress, progress.onRoute else { return nil }
        let required = (try? StripFuel.of(plan.totals, burntGal: progress.burntGal))?.requiredGal
        return (progress.destination?.distanceNm ?? progress.leftNm, progress.destination?.eteMin, required)
    }

    var body: some View {
        // The figures open the nav log they add up, leg by leg (tap what
        // you see, docs/navigation.md), as the web's distance does: a
        // stock Button, plain so the strip keeps its own look.
        if plan.routed {
            Button { PendingCommand.shared.command = .open(.navlog) } label: { figures.contentShape(Rectangle()) }
                .buttonStyle(.plain)
                .accessibilityHint("Opens the nav log")
        } else {
            figures
        }
    }

    @ViewBuilder private var figures: some View {
        // A fuel the engine could not work out is shown as unknown and in
        // the warning's colour, never as fuel enough.
        let asked = Result { try StripFuel.of(plan.totals) }
        let fuel = (try? asked.get()) ?? StripFuel(requiredGal: nil, short: [])
        let refused = (try? asked.get()) == nil
        let warn = plan.airplaneChosen && (!fuel.short.isEmpty || refused)
        FigureRow {
            stripFigure("TO", plan.routed ? plan.dest : "—")
            if !plan.airplaneChosen {
                // No airplane picked: the route's own figures, To and Dist;
                // the time and the fuel are an airplane's, and none is
                // assumed (docs/decisions/0011).
                let distance = flying?.leftNm ?? plan.totals?.distanceNm ?? plan.course?.distanceNm
                stripFigure("DIST", distance.map { Format.distance($0) } ?? "—", spoken: distance.map(SpokenFigures.nauticalMiles))
            } else if let flying {
                stripFigure("DIST", Format.distance(flying.leftNm), spoken: SpokenFigures.nauticalMiles(flying.leftNm))
                stripFigure("ETE", flying.minutes.map(Format.duration) ?? "—", spoken: flying.minutes.map(SpokenFigures.minutes))
                stripFigure("FUEL", flying.fuelGal.map { Format.fuel($0) } ?? "—", spoken: flying.fuelGal.map(SpokenFigures.gallons), warn: warn)
            } else {
                let distance = plan.totals?.distanceNm ?? plan.course?.distanceNm
                stripFigure("DIST", distance.map { Format.distance($0) } ?? "—", spoken: distance.map(SpokenFigures.nauticalMiles))
                stripFigure("ETE", plan.totals?.eteMin.map(Format.duration) ?? "—", spoken: plan.totals?.eteMin.map(SpokenFigures.minutes))
                stripFigure("FUEL", fuel.requiredGal.map { Format.fuel($0) } ?? (refused ? "?" : "—"),
                            spoken: fuel.requiredGal.map(SpokenFigures.gallons) ?? (refused ? "Fuel not worked out" : nil), warn: warn)
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
    @Environment(\.figuresOnGlass) private var onGlass
    /// What the strip shows for a figure it has not got (FiguresStrip).
    static let placeholders: Set<String> = ["—", "?"]

    var body: some View {
        let layout = size.isAccessibilitySize ? AnyLayout(HStackLayout(spacing: WingtipSpace.sm)) : AnyLayout(VStackLayout(spacing: WingtipSpace.xxs))
        // On glass the words take the tokens' ink, one weight heavier:
        // over the glass the audit failed the names in the system's grey,
        // in the tokens' grey and even in their black at the regular 11
        // points, whose strokes are a pixel or two wide over a moving
        // chart, and passed them semibold (the iPad Pro 13-inch,
        // 2026-11-09). The figures go bold, and the dash of one not yet
        // worked out heavy, a hairline the audit failed otherwise. The
        // names stay set apart by their size.
        let nameWeight: Font.Weight = onGlass ? .semibold : .regular
        let nameInk = onGlass ? AnyShapeStyle(WingtipInk.text) : AnyShapeStyle(.secondary)
        let valueInk = warn ? (onGlass ? WingtipInk.problem : WingtipInk.problem) : (onGlass ? WingtipInk.text : Color.primary)
        layout {
            Text(name).font(.caption2.weight(nameWeight)).foregroundStyle(nameInk)
            if size.isAccessibilitySize { Spacer(minLength: 0) }
            HStack(spacing: WingtipSpace.xs) {
                // A mark with the red, for a pilot who does not see the
                // colour (the owner's rule: warn, never limit).
                if warn { Image(systemName: "exclamationmark.triangle.fill").font(.caption2) }
                Text(value).font(.headline.monospacedDigit().weight(onGlass ? (Self.placeholders.contains(value) ? .heavy : .bold) : .semibold))
                    // ETE, fuel and distance roll as they count down.
                    .figureTransition(value)
            }
            .foregroundStyle(valueInk)
            .lineLimit(size.isAccessibilitySize ? nil : 1)
            .minimumScaleFactor(size.isAccessibilitySize ? 1 : 0.8)
        }
        .frame(maxWidth: .infinity)
    }
}

extension EnvironmentValues {
    /// Set where the figures sit on clear glass over the map (the iPad's
    /// strip at the map's foot, SplitLayout): they take the tokens' inks
    /// (WingtipInk.text, .problem), which keep 4.5:1 there. On the iPhone
    /// the strip is on the sheet's material and keeps the system's.
    @Entry var figuresOnGlass = false
}

/// The strip's short headings in full for VoiceOver.
private func stripFigureName(_ name: String) -> String {
    switch name {
    case "TO": "To"
    case "DIST": "Distance"
    case "ETE": "Time en route"
    case "FUEL": "Fuel"
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
