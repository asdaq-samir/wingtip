import PDFKit
import SwiftUI

/// Own ship on the diagram's page, where DiagramOwnShipView places it: the
/// point in PDFKit's page space and the turn of its glyph.
struct DiagramOwnShipMark: Equatable {
    /// From the media box's foot, in the page's points (DiagramPage.pagePoint).
    let at: CGPoint
    /// Degrees clockwise on the page: the page's north plus the track.
    let turnDeg: Double
    /// A track to show: the arrow; without one, the circle (AC 120-76D
    /// 11.17.2.2: no track drawn where there is none).
    let tracking: Bool
}

/// The FAA's diagram in PDFKit's own view: the page as the vector PDF it
/// is, sharp at any zoom, with PDFView's pinch, pan and double tap; own
/// ship a PDFAnnotation on the page, so it moves with the page as it is
/// zoomed and panned, kept the same size on the screen at every zoom.
struct DiagramPDFView: UIViewRepresentable {
    let document: PDFDocument
    let mark: DiagramOwnShipMark?
    /// The airplane's disc across, in screen points (its text size's).
    let disc: CGFloat
    /// The view, for VoiceOver's zoom (DiagramOwnShipView).
    let handle: DiagramPDFHandle

    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.displayMode = .singlePage
        view.displaysPageBreaks = false
        view.autoScales = true
        view.backgroundColor = .white
        view.document = document
        handle.view = view
        context.coordinator.watch(view)
        return view
    }

    func updateUIView(_ view: PDFView, context: Context) {
        if view.document !== document { view.document = document }
        handle.view = view
        context.coordinator.disc = disc
        context.coordinator.show(mark, on: view)
    }

    func makeCoordinator() -> Coordinator { Coordinator(disc: disc) }

    @MainActor
    final class Coordinator: NSObject {
        var disc: CGFloat
        private var shown: OwnShipAnnotation?
        private var mark: DiagramOwnShipMark?

        init(disc: CGFloat) { self.disc = disc }

        /// The zoom the page may take: from the page fitted to the room up
        /// to eight times that, as the picture viewer allows (PagesScrollView);
        /// the airplane resized as the zoom changes.
        func watch(_ view: PDFView) {
            // A selector's observer, which the system lets go with this.
            NotificationCenter.default.addObserver(self, selector: #selector(scaleChanged(_:)), name: .PDFViewScaleChanged, object: view)
        }

        @objc private func scaleChanged(_ note: Notification) {
            guard let view = note.object as? PDFView else { return }
            show(mark, on: view, force: true)
        }

        private func limit(_ view: PDFView) {
            let fit = view.scaleFactorForSizeToFit
            guard fit > 0 else { return }
            if view.minScaleFactor != fit { view.minScaleFactor = fit }
            if view.maxScaleFactor != fit * 8 { view.maxScaleFactor = fit * 8 }
        }

        /// The airplane put on the page afresh where it moved, turned or
        /// the zoom changed; taken off where there is none to draw.
        func show(_ next: DiagramOwnShipMark?, on view: PDFView, force: Bool = false) {
            limit(view)
            guard force || next != mark || (next != nil && shown == nil) else { return }
            mark = next
            guard let page = view.document?.page(at: 0) else { return }
            if let shown { page.removeAnnotation(shown) }
            shown = nil
            guard let next, view.scaleFactor > 0 else { return }
            let side = disc / view.scaleFactor
            let annotation = OwnShipAnnotation(
                bounds: CGRect(x: next.at.x - side / 2, y: next.at.y - side / 2, width: side, height: side),
                turnDeg: next.tracking ? next.turnDeg : 0, tracking: next.tracking)
            page.addAnnotation(annotation)
            shown = annotation
        }
    }
}

/// The PDFView behind the diagram, for the actions SwiftUI's own
/// accessibility modifiers take (VoiceOver's zoom, Fit the Page).
@MainActor
final class DiagramPDFHandle {
    weak var view: PDFView?

    /// Zoomed in or out a step, within the view's own limits.
    func zoom(in into: Bool) {
        guard let view else { return }
        view.scaleFactor = min(view.maxScaleFactor, max(view.minScaleFactor, view.scaleFactor * (into ? 1.5 : 1 / 1.5)))
    }

    /// The whole page in the room again.
    func fit() {
        guard let view else { return }
        view.scaleFactor = view.scaleFactorForSizeToFit
    }
}

/// Own ship drawn on the page by PDFKit with the page: on a white disc,
/// the system's symbol in the map's blue, a circle where there is no track
/// or the north arrow turned to it (AC 120-76D 11.17.2.2), as the map's
/// own ship is drawn. Nothing in it is tapped.
final class OwnShipAnnotation: PDFAnnotation {
    private let turnDeg: Double
    /// Made on the main actor as it is put on the page; PDFKit may draw
    /// the page off it.
    private let glyph: UIImage?

    init(bounds: CGRect, turnDeg: Double, tracking: Bool) {
        self.turnDeg = turnDeg
        let side = min(bounds.width, bounds.height)
        glyph = UIImage(systemName: tracking ? "location.north.fill" : "circle.fill",
                        withConfiguration: UIImage.SymbolConfiguration(pointSize: side * 0.6))?
            .withTintColor(WingtipColor.Chart.mapBlue, renderingMode: .alwaysOriginal)
        super.init(bounds: bounds, forType: .stamp, withProperties: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    override func draw(with box: PDFDisplayBox, in context: CGContext) {
        let side = min(bounds.width, bounds.height)
        context.saveGState()
        context.translateBy(x: bounds.midX, y: bounds.midY)
        // The page's points run up from its foot: turned over, so the
        // symbol stands upright and a turn is clockwise, as on the screen.
        context.scaleBy(x: 1, y: -1)
        context.rotate(by: turnDeg * .pi / 180)
        context.setFillColor(UIColor.white.cgColor)
        context.fillEllipse(in: CGRect(x: -side / 2, y: -side / 2, width: side, height: side))
        if let glyph {
            let size = glyph.size
            UIGraphicsPushContext(context)
            glyph.draw(in: CGRect(x: -size.width / 2, y: -size.height / 2, width: size.width, height: size.height))
            UIGraphicsPopContext()
        }
        context.restoreGState()
    }
}
