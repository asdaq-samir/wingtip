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
/// ship and the hot spots' rings views over the page (DiagramMarksView),
/// so they move with the page as it is zoomed and panned, own ship kept
/// the same size on the screen at every zoom.
struct DiagramPDFView: UIViewRepresentable {
    let document: PDFDocument
    let mark: DiagramOwnShipMark?
    /// The airplane's disc across, in screen points (its text size's).
    let disc: CGFloat
    /// The view, for VoiceOver's zoom (DiagramOwnShipView).
    let handle: DiagramPDFHandle
    /// The diagram's hot spots, ringed where their labels are drawn, in
    /// PDFKit's page space (DiagramPage.pagePoint).
    var hotSpots: [CGPoint] = []
    /// The night's look over the page (PageLook): white on black and the
    /// Dimmer's shade, own ship and the hot spots above them.
    var look = PageLook()

    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.displayMode = .singlePage
        view.displaysPageBreaks = false
        view.autoScales = true
        view.backgroundColor = look.paper
        (document.page(at: 0) as? DiagramNightPage)?.look = look
        context.coordinator.look = look
        // Before the document, so PDFKit asks for the page's overlay as it lays it out.
        view.pageOverlayViewProvider = context.coordinator
        view.document = document
        handle.view = view
        context.coordinator.watch(view)
        context.coordinator.marks.spots = hotSpots
        return view
    }

    func updateUIView(_ view: PDFView, context: Context) {
        if view.document !== document { view.document = document }
        handle.view = view
        context.coordinator.paint(look, on: view)
        context.coordinator.limit(view)
        context.coordinator.marks.disc = disc
        context.coordinator.marks.spots = hotSpots
        context.coordinator.marks.mark = mark
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    @MainActor
    final class Coordinator: NSObject, PDFPageOverlayViewProvider {
        var look = PageLook()
        /// Own ship and the rings, the page's one overlay.
        let marks = DiagramMarksView()

        /// A new night look: the page's drawn again, the zoom and the
        /// place on the page kept. PDFKit keeps its drawn tiles, so the
        /// document is put back to have them drawn afresh.
        func paint(_ next: PageLook, on view: PDFView) {
            guard next != look, let document = view.document else { return }
            look = next
            (document.page(at: 0) as? DiagramNightPage)?.look = next
            view.backgroundColor = next.paper
            let scale = view.scaleFactor, at = view.currentDestination
            view.document = nil
            view.document = document
            limit(view)
            view.scaleFactor = scale
            if let at { view.go(to: at) }
        }

        func pdfView(_ view: PDFView, overlayViewFor page: PDFPage) -> UIView? {
            guard page === view.document?.page(at: 0) else { return nil }
            marks.pdfView = view
            marks.page = page
            marks.setNeedsLayout()
            return marks
        }

        /// The zoom the page may take: from the page fitted to the room up
        /// to eight times that, as the picture viewer allows (PagesScrollView);
        /// the marks placed again as the zoom changes.
        func watch(_ view: PDFView) {
            // A selector's observer, which the system lets go with this.
            NotificationCenter.default.addObserver(self, selector: #selector(scaleChanged(_:)), name: .PDFViewScaleChanged, object: view)
        }

        /// Through a pinch this comes at every step: only the marks' views
        /// move, the page drawn again by PDFKit alone as it chooses.
        @objc private func scaleChanged(_ note: Notification) {
            guard let view = note.object as? PDFView else { return }
            limit(view)
            marks.place()
        }

        func limit(_ view: PDFView) {
            let fit = view.scaleFactorForSizeToFit
            guard fit > 0 else { return }
            if view.minScaleFactor != fit { view.minScaleFactor = fit }
            if view.maxScaleFactor != fit * 8 { view.maxScaleFactor = fit * 8 }
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
