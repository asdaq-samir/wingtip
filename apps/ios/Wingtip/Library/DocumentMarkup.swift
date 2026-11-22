import Observation
import PDFKit
import PencilKit
import UIKit

/// The pilot's own marks on a document's pages with Apple Pencil or a
/// finger, as on a paper copy on the kneeboard: PencilKit's canvas over
/// each page, through PDFKit's own hook for it (PDFPageOverlayViewProvider,
/// "What's new in PDFKit", WWDC22), and one tool picker for them all, so
/// the pen picked is the pen on every page. Kept as the plates' markup is
/// (PlateMarkup: one drawing a key, on this device alone, never on the
/// server), a drawing a page, by the document, its edition and the page,
/// so a new edition's pages start clean. The pilot's notes, never the
/// document: nothing here changes what the FAA prints.
@MainActor
@Observable
// PDFKit's protocol is not the main actor's, though PDFView, a view,
// asks it on the main thread alone: checked there as it runs.
final class DocumentMarkup: NSObject, @preconcurrency PDFPageOverlayViewProvider, PKCanvasViewDelegate {
    @ObservationIgnored weak var view: PDFView?
    /// The document's markup by its name and edition ("aim@2026-11-10");
    /// a page's key adds its index.
    @ObservationIgnored let prefix: String
    @ObservationIgnored private let tools = PKToolPicker()
    @ObservationIgnored private var canvases: [ObjectIdentifier: PageCanvas] = [:]

    /// Markup on: the canvases take the pencil and the tool picker is up;
    /// off, the marks show and every touch goes to the pages.
    var on = false {
        didSet {
            guard on != oldValue else { return }
            for canvas in canvases.values { canvas.isUserInteractionEnabled = on }
            showTools()
        }
    }

    init(doc: String, edition: String?) {
        prefix = "document:\(doc)@\(edition ?? "own")"
        super.init()
    }

    func key(_ index: Int) -> String { "\(prefix)#\(index)" }

    func pdfView(_ view: PDFView, overlayViewFor page: PDFPage) -> UIView? {
        guard let index = page.document?.index(for: page) else { return nil }
        let canvas = canvases[ObjectIdentifier(page)] ?? PageCanvas(key: key(index), tools: tools, delegate: self)
        canvas.isUserInteractionEnabled = on
        canvases[ObjectIdentifier(page)] = canvas
        return canvas
    }

    func pdfView(_ pdfView: PDFView, willEndDisplayingOverlayView overlayView: UIView, for page: PDFPage) {
        (overlayView as? PageCanvas)?.save()
        canvases[ObjectIdentifier(page)] = nil
    }

    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        (canvasView.superview as? PageCanvas)?.save()
    }

    /// The tool picker over the page in view, whose canvas takes it.
    private func showTools() {
        guard let page = view?.currentPage, let canvas = canvases[ObjectIdentifier(page)] else {
            for c in canvases.values { tools.setVisible(false, forFirstResponder: c.canvas) }
            return
        }
        tools.setVisible(on, forFirstResponder: canvas.canvas)
        if on { canvas.canvas.becomeFirstResponder() } else { canvas.canvas.resignFirstResponder() }
    }

    /// Every mark on the page in view taken off (Clear Page's Markup).
    func clearPage() {
        guard let page = view?.currentPage, let canvas = canvases[ObjectIdentifier(page)] else { return }
        canvas.canvas.drawing = PKDrawing()
        canvas.save()
    }
}

/// A page's canvas, drawn at PlateMarkup.width and scaled to the page's
/// view, as the plates' MarkupLayer is, so the marks keep to their points
/// through a pinch, a turn of the iPad and a resized window.
final class PageCanvas: UIView {
    let canvas = PKCanvasView()
    let key: String

    init(key: String, tools: PKToolPicker, delegate: any PKCanvasViewDelegate) {
        self.key = key
        super.init(frame: .zero)
        backgroundColor = .clear
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        canvas.drawingPolicy = .default
        canvas.isScrollEnabled = false
        canvas.contentInsetAdjustmentBehavior = .never
        canvas.drawing = PlateMarkup.load(key)
        canvas.delegate = delegate
        canvas.accessibilityLabel = String(localized: "Your markup")
        tools.addObserver(canvas)
        addSubview(canvas)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.width > 0 else { return }
        let scale = bounds.width / PlateMarkup.width
        canvas.transform = .identity
        canvas.bounds = CGRect(x: 0, y: 0, width: PlateMarkup.width, height: bounds.height / scale)
        canvas.center = CGPoint(x: bounds.midX, y: bounds.midY)
        canvas.transform = CGAffineTransform(scaleX: scale, y: scale)
    }

    func save() { PlateMarkup.save(canvas.drawing, key) }
}
