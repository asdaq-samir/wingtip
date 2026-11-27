import CryptoKit
import Foundation
import PencilKit
import UIKit

/// The pilot's own marks on a chart, with Apple Pencil or a finger: a
/// frequency ringed, the missed approach traced, a note by the minimums,
/// as a pilot marks a paper plate on the kneeboard. PencilKit's own canvas
/// and tool picker (stock, HIG Apple Pencil and Scribble: "Let people
/// choose when to switch between Apple Pencil and finger input"), kept on
/// this device alone, one drawing a chart, by the chart's address
/// (PictureRequest.markupKey), so the next cycle's plate starts clean. The
/// owner, 2026-11-21: "Yes do it all for iPad", the plates' markup among it.
/// The pilot's notes on the chart, never the chart: nothing here changes
/// a figure the FAA prints.
enum PlateMarkup {
    /// The width the marks are drawn at, whatever the page's on screen
    /// (MarkupLayer scales them to it), so they keep to their points on the
    /// page through a turn of the iPad, a resized window and a pinch.
    static let width: CGFloat = 1000

    static var folder: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appending(path: "Markup", directoryHint: .isDirectory)
    }

    /// A chart's file: its key hashed, an address being no file name.
    static func file(_ key: String) -> URL {
        let digest = SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
        return folder.appending(path: "\(digest).drawing")
    }

    /// The chart's marks, or none.
    static func load(_ key: String) -> PKDrawing {
        guard let data = try? Data(contentsOf: file(key)), let drawing = try? PKDrawing(data: data) else { return PKDrawing() }
        return drawing
    }

    /// The chart's marks kept; none left, its file gone.
    static func save(_ drawing: PKDrawing, _ key: String) {
        let url = file(key)
        if drawing.strokes.isEmpty {
            try? FileManager.default.removeItem(at: url)
            return
        }
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try? drawing.dataRepresentation().write(to: url, options: [.atomic, .completeFileProtection])
    }

    /// Every chart's marks gone (Session.signOut: signing out forgets what
    /// the pilot made on this device).
    static func forgetAll() {
        try? FileManager.default.removeItem(at: folder)
    }
}

/// The marks over a chart's pages, inside the pages' zoomed content
/// (PagesScrollView) so they pinch and pan with the page. Drawn on only
/// while Markup is on, the tool picker up; off, they show and every touch
/// goes to the page. PencilKit's default drawing policy, so a finger
/// still pans and zooms unless the pilot turns on Draw with Finger in the
/// tool picker.
final class MarkupLayer: UIView, PKCanvasViewDelegate {
    private let canvas = PKCanvasView()
    private let tools = PKToolPicker()

    /// The chart marked (PictureRequest.markupKey); nil, none kept.
    var key: String? {
        didSet {
            guard key != oldValue else { return }
            kept = key.map(PlateMarkup.load) ?? PKDrawing()
            show()
        }
    }

    /// Markup on: the canvas takes the pencil and the tool picker is up.
    var on = false {
        didSet {
            guard on != oldValue else { return }
            isUserInteractionEnabled = on
            show()
            tools.setVisible(on, forFirstResponder: canvas)
            if on { canvas.becomeFirstResponder() } else { canvas.resignFirstResponder() }
        }
    }

    /// The page's brightness at night (one less its Dimmer's shade): the
    /// marks dimmed by colour with it, as the map's lines are (OverlayDim),
    /// so a red or blue stroke is never the brightest thing on the page in
    /// a dark cockpit, undoing the eyes' dark adaptation. While Markup is on the marks are in
    /// their own colours, being drawn.
    var brightness: CGFloat = 1 {
        didSet { if brightness != oldValue { show() } }
    }

    /// The marks as kept; the canvas shows them, or their dimmed copy.
    private var kept = PKDrawing()
    /// The canvas is being given a copy, not the pilot's change.
    private var showing = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        canvas.drawingPolicy = .default
        canvas.isScrollEnabled = false
        canvas.contentInsetAdjustmentBehavior = .never
        canvas.delegate = self
        canvas.accessibilityLabel = "Your markup"
        tools.addObserver(canvas)
        addSubview(canvas)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    /// Over the pages, `width` by `height` points: the canvas drawn at
    /// PlateMarkup.width and scaled to the pages' width.
    func place(width: CGFloat, height: CGFloat) {
        guard width > 0 else { return }
        frame = CGRect(x: 0, y: 0, width: width, height: height)
        let scale = width / PlateMarkup.width
        canvas.transform = .identity
        canvas.bounds = CGRect(x: 0, y: 0, width: PlateMarkup.width, height: height / scale)
        canvas.center = CGPoint(x: width / 2, y: height / 2)
        canvas.transform = CGAffineTransform(scaleX: scale, y: scale)
    }

    /// Every mark on this chart taken off (the viewer's Clear Markup).
    func clear() {
        kept = PKDrawing()
        show()
        if let key { PlateMarkup.save(kept, key) }
    }

    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        guard !showing else { return }
        kept = canvasView.drawing
        if let key { PlateMarkup.save(kept, key) }
    }

    private func show() {
        showing = true
        defer { showing = false }
        canvas.drawing = !on && brightness < 1 ? Self.dimmed(kept, brightness) : kept
    }

    /// Each stroke's colour as PencilKit shows it after dark, times the
    /// brightness (OverlayDim.colour), handed back in the light colour
    /// PencilKit turns into that dimmed one at night.
    private static func dimmed(_ drawing: PKDrawing, _ brightness: CGFloat) -> PKDrawing {
        var out = drawing
        out.strokes = drawing.strokes.map { stroke in
            var dim = stroke
            let shown = PKInkingTool.convertColor(stroke.ink.color, from: .light, to: .dark)
            let dark = OverlayDim.colour(shown, brightness: brightness) ?? shown
            dim.ink = PKInk(stroke.ink.inkType, color: PKInkingTool.convertColor(dark, from: .dark, to: .light))
            return dim
        }
        return out
    }
}
