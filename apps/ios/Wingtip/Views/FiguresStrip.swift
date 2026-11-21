import SwiftUI

/// The flight's figures in one line -- To, Dist, ETE, Fuel -- what the
/// web app's pill shows at the sheet's foot (FlightLine), and what the
/// pilot glances at in the air. The fuel is the engine's `strip_fuel`,
/// the web's and Android's: the fuel required, less what a flight under
/// way has burnt, red where the tanks do not hold it and its reserve (14
/// CFR 91.151, 91.167).
struct FiguresStrip: View {
    @Environment(InFlight.self) private var inFlight
    @Environment(\.appCommand) private var appCommand
    @Environment(Plan.self) private var plan

    /// In the air on the route -- moving, within 3 nm of the line (the
    /// engine's `in_flight`, InFlight) -- the figures count down from where
    /// the airplane is, as the web app's do in a dry run: what is left to
    /// the destination at the groundspeed now, and the fuel still required.
    /// The fuel is the engine's for the flight being flown: the hop the
    /// airplane is on and what it has burnt since that hop began (in_flight's
    /// hop and hop_burnt_gal, the tanks filled at each fuel stop), as the
    /// web's stripFuel sends them. A refusal is carried, so it is said as on
    /// the ground (IOS-23).
    private var flying: (leftNm: Double, minutes: Double?, fuel: Result<StripFuel, any Error>)? {
        guard let progress = inFlight.progress, progress.onRoute else { return nil }
        let fuel = Result { try StripFuel.of(plan.totals, hop: progress.hop, burntGal: progress.hopBurntGal) }
        return (progress.destination?.distanceNm ?? progress.leftNm, progress.destination?.eteMin, fuel)
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
        // A fuel the engine could not work out is shown as unknown and in
        // the warning's colour, never as fuel enough.
        let asked = flying?.fuel ?? Result { try StripFuel.of(plan.totals) }
        let fuel = (try? asked.get()) ?? StripFuel(requiredGal: nil, short: [])
        // Which flight is short, by its ends, for VoiceOver (CODE-13).
        let shortSaid = fuel.shortWords(plan.course).joined(separator: "; ")
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
                stripFigure("FUEL", fuel.requiredGal.map { Format.fuel($0) } ?? (refused ? "?" : "—"),
                            spoken: Self.fuelSaid(fuel, refused: refused, short: shortSaid), warn: warn)
            } else {
                let distance = plan.totals?.distanceNm ?? plan.course?.distanceNm
                stripFigure("DIST", distance.map { Format.distance($0) } ?? "—", spoken: distance.map(SpokenFigures.nauticalMiles))
                stripFigure("ETE", plan.totals?.eteMin.map(Format.duration) ?? "—", spoken: plan.totals?.eteMin.map(SpokenFigures.minutes))
                stripFigure("FUEL", fuel.requiredGal.map { Format.fuel($0) } ?? (refused ? "?" : "—"),
                            spoken: Self.fuelSaid(fuel, refused: refused, short: shortSaid), warn: warn)
            }
        }
        .padding(.horizontal)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    /// The fuel as VoiceOver says it, with the flights it falls short on.
    private static func fuelSaid(_ fuel: StripFuel, refused: Bool, short: String) -> String? {
        let said = fuel.requiredGal.map(SpokenFigures.gallons) ?? (refused ? "Fuel not worked out" : nil)
        return short.isEmpty ? said : [said, short].compactMap { $0 }.joined(separator: ", ")
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
