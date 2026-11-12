import SwiftUI
import UIKit

/// The rows an airport's card is made of, as the web app's are
/// (FrequencyRow, RunwayRow, StopServices): a glyph on a coloured badge,
/// the name, a line under it, and the figure a pilot looks for at the
/// right in the text's own colour.

/// The badges' colours (design/tokens.json color.badge), the web app's too.
enum Badge {
    static let tower = Color(uiColor: WingtipColor.Badge.tower)
    static let ground = Color(uiColor: WingtipColor.Badge.ground)
    static let weather = Color(uiColor: WingtipColor.Badge.weather)
    static let approach = Color(uiColor: WingtipColor.Badge.approach)
    static let traffic = Color(uiColor: WingtipColor.Badge.traffic)
    static let other = Color(uiColor: WingtipColor.Badge.other)
    static let runway = Color(uiColor: WingtipColor.Badge.runway)
    static let chart = Color(uiColor: WingtipColor.Badge.chart)
    static let rule = Color(uiColor: WingtipColor.Badge.rule)
    static let hazard = Color(uiColor: WingtipColor.Badge.hazard)
    static let lights = Color(uiColor: WingtipColor.Badge.lights)
    static let fuel = Color(uiColor: WingtipColor.Badge.fuel)
    static let car = Color(uiColor: WingtipColor.Badge.car)
    static let food = Color(uiColor: WingtipColor.Badge.food)
    static let lodging = Color(uiColor: WingtipColor.Badge.lodging)
}

/// A glyph on a rounded square of colour, as Settings' rows have them.
struct RowBadge: View {
    let systemImage: String
    let colour: Color
    /// The badge grows with the type beside it, as Settings' do, so the
    /// glyph is never clipped at the larger sizes.
    @ScaledMetric(relativeTo: .subheadline) private var side = 28.0

    var body: some View {
        Image(systemName: systemImage)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .frame(width: side, height: side)
            .background(colour, in: RoundedRectangle(cornerRadius: WingtipRadius.badge, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// A row of the card: badge, title, the line under it, the value at the right.
struct CardRow<Value: View>: View {
    var badge: RowBadge?
    let title: String
    var detail: String?
    @ViewBuilder var value: () -> Value

    var body: some View {
        HStack(spacing: WingtipSpace.md) {
            if let badge { badge }
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                Text(title)
                if let detail, !detail.isEmpty { Text(detail).font(.subheadline).foregroundStyle(.secondary) }
            }
            Spacer(minLength: 8)
            value().multilineTextAlignment(.trailing)
        }
        .accessibilityElement(children: .combine)
    }
}

extension CardRow where Value == EmptyView {
    init(badge: RowBadge? = nil, title: String, detail: String? = nil) {
        self.init(badge: badge, title: title, detail: detail) { EmptyView() }
    }
}

/// A field's frequency: its name in words, a glyph by its kind, and the
/// frequency as pilots write it at the right.
struct FrequencyRowView: View {
    let frequency: Frequency
    /// A NOTAM in force on it ("Out of service"), its badge before the figure.
    var mark: NotamMark?

    static func glyph(_ kind: AirportWords.FrequencyKind) -> (String, Color) {
        switch kind {
        case .tower: ("building.columns", Badge.tower)
        case .ground: ("headphones", Badge.ground)
        case .weather: ("cloud.sun", Badge.weather)
        case .approach: ("dot.radiowaves.left.and.right", Badge.approach)
        case .traffic: ("antenna.radiowaves.left.and.right", Badge.traffic)
        case .other: ("radio", Badge.other)
        }
    }

    var body: some View {
        let line = AirportWords.frequencyLine(type: frequency.type, description: frequency.description)
        let glyph = Self.glyph(line.kind)
        CardRow(badge: RowBadge(systemImage: glyph.0, colour: glyph.1), title: line.name, detail: line.detail) {
            HStack(spacing: WingtipSpace.sm) {
                if let mark { NotamMarkBadge(mark: mark) }
                Text(frequency.frequencyMhz.map(AirportWords.mhz) ?? "—").fontWeight(.semibold).monospacedDigit()
                    // Figure by figure, as a frequency is read on the radio.
                    .accessibilityLabel(frequency.frequencyMhz.map(SpokenFigures.frequency) ?? "no frequency")
            }
        }
        // Held: Copy (FrequencyActions).
        .frequencyActions(frequency.frequencyMhz.map(AirportWords.mhz))
    }
}

/// A runway: drawn on its badge along its true heading, its ends, its
/// surface and lights, any end flown with right traffic, the reported
/// wind on the end it favours as the planner worked it out, and its
/// length and width at the right. By its name, the Runways tab's badges:
/// Best Wind and Longest (the owner, 2026-11-11: "best wind runways should
/// get the best wind badge", "just put a longest badge on the runway"),
/// and a NOTAM's in force on it.
struct RunwayRowView: View {
    let runway: Runway
    var longest = false
    var bestWind = false
    var mark: NotamMark?
    @ScaledMetric(relativeTo: .subheadline) private var side = 28.0

    /// The name and its badges on one line where they fit, the badges
    /// under the name where they don't (the larger text sizes).
    @ViewBuilder private var title: some View {
        let name = Text("Runway \(runway.ends ?? "—")")
        if bestWind || longest || mark != nil {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: WingtipSpace.sm) { name; badges }
                VStack(alignment: .leading, spacing: WingtipSpace.xxs) { name; HStack(spacing: WingtipSpace.sm) { badges } }
            }
        } else {
            name
        }
    }

    @ViewBuilder private var badges: some View {
        if bestWind { TextBadge("Best Wind", look: .secondary) }
        if longest { TextBadge("Longest", look: .secondary) }
        if let mark { NotamMarkBadge(mark: mark) }
    }

    var body: some View {
        let heading = (runway.runwayEnds ?? []).compactMap(\.headingTrueDeg).first
        HStack(spacing: WingtipSpace.md) {
            ZStack {
                RoundedRectangle(cornerRadius: WingtipRadius.badge, style: .continuous).fill(Badge.runway)
                RoundedRectangle(cornerRadius: 1).fill(.white).frame(width: side / 5.6, height: side * 0.64)
                    .rotationEffect(.degrees(heading ?? 0))
            }
            .frame(width: side, height: side)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                title
                let detail = AirportWords.runwayDetail(runway)
                if !detail.isEmpty { Text(detail).font(.subheadline).foregroundStyle(.secondary) }
                if let wind = runway.wind {
                    Text(AirportWords.runwayWind(wind)).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: WingtipSpace.xxs) {
                Text(Format.altitude(runway.lengthFt.map(Double.init))).fontWeight(.semibold).monospacedDigit()
                    .accessibilityLabel(runway.lengthFt.map { "\(SpokenFigures.feet(Double($0))) long" } ?? "length not listed")
                if let width = runway.widthFt {
                    Text("\(width) ft wide").font(.footnote).foregroundStyle(.secondary)
                        .accessibilityLabel("\(SpokenFigures.feet(Double(width))) wide")
                }
            }
        }
        .accessibilityElement(children: .combine)
        // Held, the runway's details as iOS previews a row: each end's
        // true heading and pattern side as the planner sends them
        // (wingtip.pattern; 14 CFR 91.126(b)(1) for the side), and Copy.
        .contextMenu {
            Button { UIPasteboard.general.string = RunwayDetails.words(runway) } label: { Label("Copy", systemImage: WingtipIcon.copy) }
        } preview: {
            RunwayDetails(runway: runway)
        }
    }
}

/// A runway's details, the preview of its row held: its ends, each one's
/// true heading and which side its pattern is flown, its length, width
/// and surface, and the wind across it now, as the planner gives them.
struct RunwayDetails: View {
    let runway: Runway

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
            Text("Runway \(runway.ends ?? "—")").font(.headline)
            ForEach(runway.runwayEnds ?? [], id: \.ident) { end in
                LabeledContent("Runway \(end.ident)") {
                    Text([end.headingTrueDeg.map { "\(Format.heading($0))T" }, end.traffic.map { "\($0) traffic" }]
                        .compactMap { $0 }.joined(separator: " · "))
                }
            }
            Text(Self.words(runway)).font(.subheadline).foregroundStyle(.secondary)
            if let wind = runway.wind { Text(AirportWords.runwayWind(wind)).font(.subheadline) }
        }
        .padding(WingtipSpace.lg)
        .frame(width: 320, alignment: .leading)
    }

    /// The runway in one line: its ends, length by width, and surface.
    static func words(_ runway: Runway) -> String {
        let size = [runway.lengthFt.map { Format.altitude(Double($0)) }, runway.widthFt.map { "\($0) ft wide" }].compactMap { $0 }.joined(separator: " × ")
        let detail = AirportWords.runwayDetail(runway)
        return ["Runway \(runway.ends ?? "—")", size, detail].filter { !$0.isEmpty }.joined(separator: ", ")
    }
}

/// The field's runways drawn north up from where the FAA surveys their
/// ends, for a field with no FAA diagram (the web app's RunwaySketch): a
/// picture of where they lie, not a chart to taxi by.
struct RunwaySketch: View {
    let runways: [Runway]

    /// The runways with both ends surveyed, as pairs of points.
    static func strips(_ runways: [Runway]) -> [(ends: [String], a: CGPoint, b: CGPoint)] {
        let surveyed = runways.compactMap { runway -> (ends: [String], a: (Double, Double), b: (Double, Double))? in
            let ends = (runway.runwayEnds ?? []).filter { $0.lat != nil && $0.lon != nil }
            guard ends.count >= 2, let a = ends.first, let b = ends.last else { return nil }
            return ([a.ident, b.ident], (a.lat!, a.lon!), (b.lat!, b.lon!))
        }
        guard let first = surveyed.first else { return [] }
        let squeeze = cos(first.a.0 * .pi / 180)
        return surveyed.map { strip in
            (strip.ends, CGPoint(x: strip.a.1 * squeeze, y: -strip.a.0), CGPoint(x: strip.b.1 * squeeze, y: -strip.b.0))
        }
    }

    var body: some View {
        Canvas { context, size in
            let strips = Self.strips(runways)
            let xs = strips.flatMap { [$0.a.x, $0.b.x] }, ys = strips.flatMap { [$0.a.y, $0.b.y] }
            guard let minX = xs.min(), let maxX = xs.max(), let minY = ys.min(), let maxY = ys.max() else { return }
            let span = max(maxX - minX, maxY - minY, 1e-6)
            let scale = min(size.width, size.height) * 0.75 / span
            let middle = CGPoint(x: (minX + maxX) / 2, y: (minY + maxY) / 2)
            func place(_ p: CGPoint) -> CGPoint {
                CGPoint(x: size.width / 2 + (p.x - middle.x) * scale, y: size.height / 2 + (p.y - middle.y) * scale)
            }
            for strip in strips {
                var line = Path()
                line.move(to: place(strip.a))
                line.addLine(to: place(strip.b))
                context.stroke(line, with: .color(.primary), style: StrokeStyle(lineWidth: max(4, min(size.width, size.height) / 28), lineCap: .butt))
                // Each end's number just past it, along the runway.
                let pa = place(strip.a), pb = place(strip.b)
                let length = max(hypot(pa.x - pb.x, pa.y - pb.y), 1)
                let dx = (pa.x - pb.x) / length * 12, dy = (pa.y - pb.y) / length * 12
                context.draw(Text(AirportWords.runwayNumber(strip.ends[0])).font(.caption2.weight(.bold)), at: CGPoint(x: pa.x + dx, y: pa.y + dy))
                context.draw(Text(AirportWords.runwayNumber(strip.ends[1])).font(.caption2.weight(.bold)), at: CGPoint(x: pb.x - dx, y: pb.y - dy))
            }
        }
        .accessibilityLabel("Runways \(Self.strips(runways).map { $0.ends.joined(separator: "/") }.joined(separator: ", ")), north up")
    }
}

/// One of the card's actions, as Maps' place card has them: a glyph over
/// its name on a rounded pane, the first in the tint.
struct CardActionLabel: View {
    /// The action, whose one name and glyph every card uses (CardAction).
    let action: CardAction

    init(_ action: CardAction) { self.action = action }

    var body: some View {
        VStack(spacing: WingtipSpace.xs) {
            Image(systemName: action.systemImage).font(WingtipType.heading)
                // Fly Here and Direct To bounce as they are taken.
                .symbolBounce(on: action == .flyHere || action == .directTo ? Feel.shared.directTo : 0)
            Text(action.title).font(WingtipType.tabBar.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, minHeight: WingtipSize.tapTarget)
    }
}

private enum PreviewData {
    static let runways = [
        Runway(closed: false, ends: "09/27", lengthFt: 10162, lighted: true, runwayEnds: [RunwayEnd(headingTrueDeg: 92, ident: "09", lat: 46.8415, lon: -92.2140),
                                                                                          RunwayEnd(headingTrueDeg: 272, ident: "27", lat: 46.8425, lon: -92.1733, traffic: "right")],
               surface: "ASPH", widthFt: 150, wind: RunwayWind(crosswindKt: 4, end: "27", headwindKt: 9)),
        Runway(closed: false, ends: "03/21", lengthFt: 5719, lighted: true, runwayEnds: [RunwayEnd(headingTrueDeg: 33, ident: "03", lat: 46.8355, lon: -92.2005),
                                                                                         RunwayEnd(headingTrueDeg: 213, ident: "21", lat: 46.8490, lon: -92.1880)],
               surface: "ASPH", widthFt: 150),
    ]
}

#Preview("RowBadge") {
    HStack(spacing: WingtipSpace.md) {
        RowBadge(systemImage: "building.columns", colour: Badge.tower)
        RowBadge(systemImage: "cloud.sun", colour: Badge.weather)
        RowBadge(systemImage: "fuelpump", colour: Badge.fuel)
        RowBadge(systemImage: "exclamationmark.shield", colour: Badge.hazard)
    }
    .padding()
}

#Preview("CardRow") {
    List {
        CardRow(badge: RowBadge(systemImage: "fuelpump", colour: Badge.fuel), title: "100LL, Jet A", detail: "Self-serve, 24 h")
        CardRow(badge: RowBadge(systemImage: "cloud", colour: Badge.weather), title: "Ceiling") { Text("3,500 ft").fontWeight(.semibold) }
        CardRow(title: "Landing fee") { Text("None").foregroundStyle(.secondary) }
    }
}

#Preview("FrequencyRowView") {
    List {
        FrequencyRowView(frequency: Frequency(description: "DULUTH TOWER", frequencyMhz: 118.3, type: "TWR"))
        FrequencyRowView(frequency: Frequency(description: "GROUND", frequencyMhz: 121.9, type: "GND"))
        FrequencyRowView(frequency: Frequency(description: "CTAF", frequencyMhz: 122.8, type: "CTAF"))
        FrequencyRowView(frequency: Frequency(description: "ATIS", type: "ATIS"))
    }
}

#Preview("RunwayRowView") {
    List { ForEach(Array(PreviewData.runways.enumerated()), id: \.offset) { _, runway in RunwayRowView(runway: runway) } }
}

#Preview("RunwaySketch") {
    RunwaySketch(runways: PreviewData.runways)
        .frame(width: 300, height: 300)
}

#Preview("CardActionLabel") {
    HStack(spacing: WingtipSpace.sm) {
        Button {} label: { CardActionLabel(.flyHere) }.glassProminentButton()
        Button {} label: { CardActionLabel(.addStop) }.glassButton()
        Button {} label: { CardActionLabel(.call) }.glassButton()
        Button {} label: { CardActionLabel(.address) }.glassButton()
    }
    .padding()
}
