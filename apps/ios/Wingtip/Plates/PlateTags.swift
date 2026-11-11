import MapKit
import UIKit

/// A fix of the approach picked as the engine tags it (its
/// `approach_fix_tags` rule): what the app draws, never works out. The
/// altitudes, their sense and the glidepath's height come from the CIFP or
/// the engine's own sourced figure, each cited where the engine has it.
struct PlateFixTag: Equatable {
    /// How the FAA charts a crossing altitude (FAA Aeronautical Chart
    /// User's Guide, Terminal Procedures Publication symbols): at or above
    /// underlined, at or below overlined, a mandatory altitude both, and a
    /// window the higher overlined over the lower underlined.
    enum Sense: String, Equatable {
        case atOrAbove = "at_or_above"
        case atOrBelow = "at_or_below"
        case at
        case between
    }

    let ident: String
    let coordinate: CLLocationCoordinate2D
    var sense: Sense?
    var minFt: Double?
    var maxFt: Double?
    /// The glideslope's or glidepath's height over the fix (the FAF of a
    /// precision or vertically guided approach): "GS 2,610'".
    var glidepathFt: Double?
    /// "GS" for a glideslope (ILS), "GP" for an RNAV glidepath.
    var glidepathWord = "GS"
    /// At the runway: the threshold crossing height and the touchdown
    /// zone's elevation. No DA or MDA: the d-TPP's minimums are not in the
    /// CIFP, so they stay the plate's alone (the engine's rule says so).
    var thresholdCrossingFt: Double?
    var touchdownZoneFt: Double?

    static func == (a: Self, b: Self) -> Bool {
        a.ident == b.ident && a.coordinate.latitude == b.coordinate.latitude && a.coordinate.longitude == b.coordinate.longitude
            && a.sense == b.sense && a.minFt == b.minFt && a.maxFt == b.maxFt && a.glidepathFt == b.glidepathFt
            && a.glidepathWord == b.glidepathWord
            && a.thresholdCrossingFt == b.thresholdCrossingFt && a.touchdownZoneFt == b.touchdownZoneFt
    }
}

/// The tags on a plate's fixes and its final segment, as the engine gave
/// them for one approach.
struct PlateTags: Equatable {
    var fixes: [PlateFixTag] = []
    /// The final approach segment, the FAF to the runway, latitude and
    /// longitude: drawn in the final segment's cyan.
    var finalSegment: [CLLocationCoordinate2D] = []

    static func == (a: Self, b: Self) -> Bool {
        a.fixes == b.fixes && a.finalSegment.map(\.latitude) == b.finalSegment.map(\.latitude)
            && a.finalSegment.map(\.longitude) == b.finalSegment.map(\.longitude)
    }

    /// The approach picked as the planner draws it, read as the engine's
    /// contract has it (CoachApproaches.drawing), then tagged by the engine.
    static func fetch(_ pick: ProcedurePick) async -> PlateTags? {
        let request = Planner.get("/api/airport/\(pick.ident)/procedures/\(pick.id)", ["transition": pick.transition])
        guard let data = try? await Planner.data(for: request), let drawing = try? CoachApproaches.drawing(data) else { return nil }
        return of(drawing)
    }

    /// The engine's tags for the approach drawn (`approach_fix_tags`);
    /// none where the engine cannot answer (logged by Engine.rule).
    static func of(_ drawing: EngineContract.ProcedureDrawing) -> PlateTags {
        guard let answer = try? Engine.approachFixTags(drawing: drawing) else { return PlateTags() }
        return of(answer)
    }

    /// The engine's answer as the map draws it, field by field.
    static func of(_ answer: EngineContract.ApproachFixTagsAnswer) -> PlateTags {
        let fixes = answer.tags.map { tag in
            PlateFixTag(
                ident: tag.ident, coordinate: CLLocationCoordinate2D(latitude: tag.lat, longitude: tag.lon),
                sense: tag.altitude.flatMap { PlateFixTag.Sense(rawValue: $0.sense) },
                minFt: tag.altitude?.minFt, maxFt: tag.altitude?.maxFt,
                glidepathFt: tag.vertical?.ft, glidepathWord: tag.vertical?.kind == "glidepath" ? "GP" : "GS",
                thresholdCrossingFt: tag.runway?.tchFt, touchdownZoneFt: tag.runway?.tdzeFt)
        }
        let final = (answer.final?.points ?? []).compactMap { point -> CLLocationCoordinate2D? in
            guard point.count >= 2, case .number(let lat) = point[0], case .number(let lon) = point[1] else { return nil }
            return CLLocationCoordinate2D(latitude: lat, longitude: lon)
        }
        return PlateTags(fixes: fixes, finalSegment: final)
    }
}

/// One line of a fix's tag: its words, and the FAA's bars over or under
/// an altitude.
struct PlateTagLine: Equatable {
    enum Bars: Equatable { case none, under, over, both }
    enum Weight: Equatable { case name, figure, note }

    let text: String
    var bars: Bars = .none
    var weight: Weight = .figure
}

/// The tag view model: a fix's lines as the map shows them, ForeFlight's
/// box of the fix's name over its altitudes (the owner's screenshot,
/// 2026-11-11). How a figure is written is the app's; what it is, the
/// engine's.
enum PlateTagLines {
    static func feet(_ ft: Double) -> String { "\(Format.grouped(ft))'" }

    static func lines(_ tag: PlateFixTag) -> [PlateTagLine] {
        var out = [PlateTagLine(text: tag.ident, weight: .name)]
        switch tag.sense {
        case .atOrAbove:
            if let ft = tag.minFt ?? tag.maxFt { out.append(.init(text: feet(ft), bars: .under)) }
        case .atOrBelow:
            if let ft = tag.maxFt ?? tag.minFt { out.append(.init(text: feet(ft), bars: .over)) }
        case .at:
            if let ft = tag.minFt ?? tag.maxFt { out.append(.init(text: feet(ft), bars: .both)) }
        case .between:
            if let high = tag.maxFt { out.append(.init(text: feet(high), bars: .over)) }
            if let low = tag.minFt { out.append(.init(text: feet(low), bars: .under)) }
        case nil:
            break
        }
        if let gp = tag.glidepathFt { out.append(.init(text: "\(tag.glidepathWord) \(feet(gp))", weight: .note)) }
        if let tch = tag.thresholdCrossingFt { out.append(.init(text: "TCH \(feet(tch))", weight: .note)) }
        if let tdze = tag.touchdownZoneFt { out.append(.init(text: "TDZE \(feet(tdze))", weight: .note)) }
        return out
    }

    /// The whole tag for VoiceOver, its bars said as words.
    static func spoken(_ tag: PlateFixTag) -> String {
        lines(tag).map { line in
            switch line.bars {
            case .none: line.text
            case .under: "\(line.text) or above"
            case .over: "\(line.text) or below"
            case .both: "at \(line.text)"
            }
        }.joined(separator: ", ")
    }
}

/// A fix's tag on the map.
final class PlateTagAnnotation: NSObject, MKAnnotation {
    let tag: PlateFixTag
    let plate: String
    var coordinate: CLLocationCoordinate2D { tag.coordinate }

    init(_ tag: PlateFixTag, plate: String) {
        self.tag = tag
        self.plate = plate
    }

    var title: String? { tag.ident }
}

/// The final approach segment, drawn over the page in its cyan.
final class FinalSegmentPolyline: MKPolyline {}

/// A fix's tag as ForeFlight draws one: a dark box beside the fix, its
/// name over its altitudes, each with the FAA's bars.
final class PlateTagView: MKAnnotationView {
    static let reuse = "plate-tag"
    private let stack = UIStackView()

    override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        stack.axis = .vertical
        stack.alignment = .leading
        stack.spacing = 1
        stack.isLayoutMarginsRelativeArrangement = true
        stack.directionalLayoutMargins = NSDirectionalEdgeInsets(top: WingtipSpace.xs, leading: WingtipSpace.sm, bottom: WingtipSpace.xs, trailing: WingtipSpace.sm)
        stack.backgroundColor = WingtipColor.Chart.airspaceTab.withAlphaComponent(0.9)
        stack.layer.cornerRadius = WingtipSpace.xs
        addSubview(stack)
        displayPriority = .required
        collisionMode = .rectangle
        isAccessibilityElement = true
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    override var annotation: (any MKAnnotation)? {
        didSet { show() }
    }

    private func show() {
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        guard let mark = annotation as? PlateTagAnnotation else { return }
        for line in PlateTagLines.lines(mark.tag) { stack.addArrangedSubview(Self.row(line)) }
        let size = stack.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
        // Beside the fix, to its right, as ForeFlight sets its tags.
        stack.frame = CGRect(origin: .zero, size: size)
        frame = stack.frame
        centerOffset = CGPoint(x: size.width / 2 + WingtipSpace.sm, y: 0)
        accessibilityLabel = PlateTagLines.spoken(mark.tag)
    }

    private static func row(_ line: PlateTagLine) -> UIView {
        let label = UILabel()
        label.text = line.text
        label.textColor = WingtipColor.Chart.casing
        let style: UIFont.TextStyle = line.weight == .name ? .subheadline : .footnote
        label.font = UIFont.preferredFont(forTextStyle: style).withWeight(line.weight == .note ? .regular : .bold)
        guard line.bars != .none else { return label }
        let box = UIStackView(arrangedSubviews: [])
        box.axis = .vertical
        box.spacing = 1
        box.alignment = .fill
        func bar() -> UIView {
            let bar = UIView()
            bar.backgroundColor = WingtipColor.Chart.casing
            bar.heightAnchor.constraint(equalToConstant: 1.5).isActive = true
            return bar
        }
        if line.bars == .over || line.bars == .both { box.addArrangedSubview(bar()) }
        box.addArrangedSubview(label)
        if line.bars == .under || line.bars == .both { box.addArrangedSubview(bar()) }
        return box
    }
}

private extension UIFont {
    func withWeight(_ weight: UIFont.Weight) -> UIFont {
        let traits = [UIFontDescriptor.TraitKey.weight: weight]
        return UIFont(descriptor: fontDescriptor.addingAttributes([.traits: traits]), size: 0)
    }
}
