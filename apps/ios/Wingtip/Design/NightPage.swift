import SwiftUI
import UIKit

/// How one of the FAA's pages is drawn at night: white on black unless the
/// pilot picked otherwise, and shaded by the chart's Dimmer, so a plate, the
/// airport diagram, a chart's pages or a handbook opened at night is never a
/// white page in a dark cockpit, which would undo the pilot's dark
/// adaptation (AIM 8-1-6, Vision in Flight). One look for every page the
/// app draws: the plate on the map (PlateRenderer), the diagram (DiagramNightPage),
/// the reader's PDF (InvertiblePage) and the pictures of a chart's pages
/// (PagesScrollView). A photo is shown as it was taken.
nonisolated struct PageLook: Equatable, Sendable {
    var inverted = false
    /// The night's ground laid over the page, the chart's own shade.
    var shade: CGFloat = 0

    /// Nothing to change: the page as it is printed.
    var plain: Bool { !inverted && shade <= 0 }

    /// The ground round a page: black under an inverted one, else the paper's white.
    var paper: UIColor { inverted ? .black : .white }

    /// The paper as the pilot sees it, its shade laid on: the margins
    /// round a page whose shade is drawn over the page alone (the
    /// diagram's PDFView), so a page kept white at night has no undimmed
    /// white bars beside it on an iPad (AIM 8-1-6).
    var shadedPaper: UIColor {
        guard shade > 0 else { return paper }
        // Mixed in the device's sRGB, as the shade is laid over the page.
        return UIColor(Color(uiColor: paper).mix(with: Color(uiColor: NightPalette.ground), by: Double(min(1, shade)), in: .device))
    }

    /// White on black for a kept pick (nil: none) under an appearance: the
    /// pilot's own pick, else the dark appearance.
    static func inverted(kept: Bool?, dark: Bool) -> Bool { kept ?? dark }
}

/// The one drawing of a page under its night look, in two halves around
/// the page's own drawing, each in the space where `rect` is the page.
nonisolated enum NightPage {
    /// The paper's white under the page, before it is drawn. A PDF's page
    /// draws only its ink, and PDFKit may lay the page's white on a layer of
    /// its own under transparent tiles: the difference blend over clear
    /// paper would give white, and the whole page would turn white at
    /// night. On a known white the blend always turns the paper black.
    static func paper(in context: CGContext, rect: CGRect) {
        context.saveGState()
        context.setBlendMode(.normal)
        context.setFillColor(UIColor.white.cgColor)
        context.fill(rect)
        context.restoreGState()
    }

    /// The look over the page once drawn: a white fill in the difference
    /// blend turns every colour over, white paper black and black ink
    /// white, the way Apple's PDFKit sample draws over a page; then the
    /// Dimmer's shade, the night's ground at its alpha, so the page is no
    /// brighter than the chart under it.
    static func over(in context: CGContext, rect: CGRect, look: PageLook) {
        guard !look.plain else { return }
        context.saveGState()
        if look.inverted {
            context.setBlendMode(.difference)
            context.setFillColor(UIColor.white.cgColor)
            context.fill(rect)
        }
        if look.shade > 0 {
            context.setBlendMode(.normal)
            context.setFillColor(NightPalette.ground.withAlphaComponent(look.shade).cgColor)
            context.fill(rect)
        }
        context.restoreGState()
    }
}
