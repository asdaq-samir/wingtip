import PDFKit
import Synchronization
import UIKit

/// The airport diagram's night look, as a chart's other pages have it
/// (PageLook): white on black and shaded by the chart's Dimmer, so the
/// diagram opened at night on the ramp is never a white page in a dark
/// cockpit, which would undo the pilot's dark adaptation (AIM 8-1-6,
/// Vision in Flight; the round-5 themes audit). The page stays PDFKit's
/// vector page, inverted where it is drawn; own ship and the hot spots'
/// rings are drawn again above the inversion and the shade, in their own
/// colours and undimmed, as the map's own ship is.
nonisolated struct DiagramNight: Equatable, Sendable {
    var inverted = false
    /// The night's ground laid over the page, the Dimmer's alpha.
    var shade: CGFloat = 0

    /// Nothing to change: the page as PDFKit draws it.
    var plain: Bool { !inverted && shade <= 0 }
}

/// A diagram page that draws itself under the night's look. PDFKit makes
/// the document's pages of this class (DiagramPages, set as the document
/// is read) and draws them off the main thread, so the look is behind a
/// lock.
final nonisolated class DiagramNightPage: PDFPage {
    private let night = Mutex(DiagramNight())

    var look: DiagramNight {
        get { night.withLock { $0 } }
        set { night.withLock { $0 = newValue } }
    }

    override func draw(with box: PDFDisplayBox, to context: CGContext) {
        let look = look
        super.draw(with: box, to: context)
        guard !look.plain else { return }
        context.saveGState()
        let all = context.boundingBoxOfClipPath
        if look.inverted {
            // A white fill in the difference blend turns the page over:
            // the paper black, the ink white, as PlatePage does the plate.
            context.setBlendMode(.difference)
            context.setFillColor(UIColor.white.cgColor)
            context.fill(all)
        }
        if look.shade > 0 {
            context.setBlendMode(.normal)
            context.setFillColor(NightPalette.ground.withAlphaComponent(look.shade).cgColor)
            context.fill(all)
        }
        context.restoreGState()
        // Own ship and the hot spots' rings again, over the inverted copy
        // the page drew of them: the same bounds, so each covers its own.
        for mark in annotations {
            context.saveGState()
            mark.draw(with: box, in: context)
            context.restoreGState()
        }
    }
}

/// The document's delegate that makes its pages DiagramNightPage, set
/// before the first page is asked for (DiagramPage.read). One for every
/// document: it holds nothing.
final nonisolated class DiagramPages: NSObject, PDFDocumentDelegate, Sendable {
    static let shared = DiagramPages()

    func classForPage() -> AnyClass { DiagramNightPage.self }
}
