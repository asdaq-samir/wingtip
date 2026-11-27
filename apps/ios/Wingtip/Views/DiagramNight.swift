import PDFKit
import Synchronization
import UIKit

/// The airport diagram's page under a chart page's night look (PageLook,
/// NightPage): white on black and shaded by the chart's Dimmer, so the
/// diagram opened at night on the ramp is never a white page in a dark
/// cockpit (AIM 8-1-6, Vision in Flight). PDFKit makes the document's
/// pages of this class (DiagramPages, set as the document is read) and
/// draws them on its own threads, so the look is behind a lock. Own ship
/// and the hot spots' rings are no part of the page's drawing: they are
/// views over it (DiagramMarksView), above the inversion and the shade,
/// in their own colours and undimmed, as the map's own ship is.
final nonisolated class DiagramNightPage: PDFPage {
    private let night = Mutex(PageLook())

    var look: PageLook {
        get { night.withLock { $0 } }
        set { night.withLock { $0 = newValue } }
    }

    override func draw(with box: PDFDisplayBox, to context: CGContext) {
        drawPage(with: box, to: context, look: look) { super.draw(with: box, to: context) }
    }
}

/// The document's delegate that makes its pages DiagramNightPage, set
/// before the first page is asked for (DiagramPage.read). It holds nothing.
final nonisolated class DiagramPages: NSObject, PDFDocumentDelegate, Sendable {
    func classForPage() -> AnyClass { DiagramNightPage.self }
}

/// Own ship and the hot spots' rings over the diagram's page: PDFKit's
/// overlay view for the page (PDFPageOverlayViewProvider), which pans and
/// zooms with it, so a fix or a pinch moves views and never redraws the
/// page's tiles. Each mark is placed from the page's own space through
/// PDFView's conversions, whatever the page's boxes; own ship is kept its
/// size on the screen by undoing the page's zoom on it, so it is drawn
/// sharp at that size.
final class DiagramMarksView: UIView {
    weak var pdfView: PDFView?
    weak var page: PDFPage?
    /// The airplane's disc across, in screen points.
    var disc: CGFloat = 30 {
        didSet { if disc != oldValue { ship.bounds.size = CGSize(width: disc, height: disc); setNeedsLayout() } }
    }

    var mark: DiagramOwnShipMark? {
        didSet {
            guard mark != oldValue else { return }
            ship.tracking = mark?.tracking ?? false
            setNeedsLayout()
        }
    }

    /// The hot spots, in the page's space, each ringed where its label is drawn.
    var spots: [CGPoint] = [] {
        didSet {
            guard spots != oldValue else { return }
            rings.forEach { $0.removeFromSuperview() }
            rings = spots.map { _ in Self.ring() }
            rings.forEach { insertSubview($0, belowSubview: ship) }
            setNeedsLayout()
        }
    }

    private let ship = OwnShipView()
    private var rings: [UIView] = []
    /// A ring's side and line, in the page's points, as PDFKit's circle was.
    private static let ringSide: CGFloat = 30
    private static let ringLine: CGFloat = 2.5

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        backgroundColor = .clear
        ship.bounds.size = CGSize(width: disc, height: disc)
        ship.isHidden = true
        addSubview(ship)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    private static func ring() -> UIView {
        let ring = UIView()
        ring.isUserInteractionEnabled = false
        ring.backgroundColor = .clear
        ring.layer.borderColor = WingtipColor.Chart.caution.cgColor
        return ring
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        place()
    }

    /// Every mark where the page now lies on the screen.
    func place() {
        guard let pdfView, let page else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        let side = Self.ringSide
        for (ring, at) in zip(rings, spots) {
            let box = convert(pdfView.convert(CGRect(x: at.x - side / 2, y: at.y - side / 2, width: side, height: side), from: page), from: pdfView)
            ring.frame = box
            ring.layer.cornerRadius = box.width / 2
            ring.layer.borderWidth = Self.ringLine * box.width / side
        }
        guard let mark else {
            ship.isHidden = true
            return
        }
        // The page's zoom on the screen: a screen point is this many of mine.
        let screen = convert(CGRect(x: 0, y: 0, width: 1, height: 1), to: pdfView).width
        guard screen > 0 else { return }
        ship.isHidden = false
        ship.center = convert(pdfView.convert(mark.at, from: page), from: pdfView)
        let turn = mark.tracking ? mark.turnDeg * .pi / 180 : 0
        ship.transform = CGAffineTransform(scaleX: 1 / screen, y: 1 / screen).rotated(by: turn)
    }
}

/// Own ship over the diagram: on a white disc, the system's symbol in the
/// map's blue, a circle where there is no track or the north arrow turned
/// to it (AC 120-76D 11.17.2.2), as the map's own ship is drawn. The turn
/// is the view's; nothing in it is tapped.
final class OwnShipView: UIView {
    private let glyph = UIImageView()

    var tracking = false {
        didSet { if tracking != oldValue { paint() } }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        backgroundColor = .white
        glyph.contentMode = .scaleAspectFit
        glyph.tintColor = WingtipColor.Chart.mapBlue
        addSubview(glyph)
        paint()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    override func layoutSubviews() {
        super.layoutSubviews()
        layer.cornerRadius = bounds.width / 2
        glyph.frame = bounds.insetBy(dx: bounds.width * 0.2, dy: bounds.height * 0.2)
        glyph.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: bounds.width * 0.6)
    }

    private func paint() {
        glyph.image = UIImage(systemName: tracking ? "location.north.fill" : "circle.fill")
    }
}
