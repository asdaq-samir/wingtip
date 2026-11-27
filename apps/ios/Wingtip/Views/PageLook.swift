import SwiftUI
import UIKit

/// How a chart's pages are drawn full screen and beside the map
/// (ZoomablePictures), as the plate on the map is (PlateLook): white on
/// black at night unless the pilot picked otherwise on the plate's card,
/// and shaded by the chart's Dimmer (ChartLook), so a plate or a diagram
/// opened at night is never a white page in a dark cockpit, which would
/// undo the pilot's dark adaptation (AIM 8-1-6, Vision in Flight; the
/// round-4 themes audit, 2026-11-27). A photo is shown as it was taken.
struct PageLook: Equatable {
    var inverted = false
    /// The night's ground laid over the page, the chart's own shade.
    var shade: CGFloat = 0

    /// The ground round a page: black under an inverted one, else the paper's white.
    var paper: UIColor { inverted ? .black : .white }

    /// The page as drawn under this look, the way PlatePage draws the plate
    /// on the map: on the paper's white, turned over by a white fill in the
    /// difference blend, then the Dimmer's shade. The picture itself where
    /// there is nothing to change.
    func drawn(_ image: UIImage) -> UIImage {
        guard inverted || shade > 0 else { return image }
        let format = UIGraphicsImageRendererFormat.preferred()
        format.scale = image.scale
        format.opaque = true
        return UIGraphicsImageRenderer(size: image.size, format: format).image { context in
            let page = CGRect(origin: .zero, size: image.size)
            UIColor.white.setFill()
            context.fill(page)
            image.draw(in: page)
            if inverted { context.fill(page, blendMode: .difference) }
            if shade > 0 {
                NightPalette.ground.withAlphaComponent(shade).setFill()
                context.fill(page, blendMode: .normal)
            }
        }
    }
}

/// The plate card's White on Black and the Dimmer as kept on the device,
/// read by the views that open a chart's pages.
struct PageLookKept: DynamicProperty {
    @Environment(\.colorScheme) private var scheme
    @AppStorage(PlateLook.Keys.inverted) private var inverted: Bool?
    private var chartLook = ChartLookKept()

    /// A chart's pages as the plate on the map is drawn; any other picture as it is.
    func look(chart: Bool) -> PageLook {
        guard chart else { return PageLook() }
        let dark = scheme == .dark
        return PageLook(inverted: PlateLook.inverted(kept: inverted, dark: dark), shade: chartLook.shade(dark: dark))
    }
}

extension PictureRequest {
    /// One of the FAA's charts (a plate, the diagram, the Chart
    /// Supplement's pages), not a photo.
    var isChart: Bool {
        if case .faaChart = source { return true }
        return georeference != nil
    }
}

extension ShownPicture {
    var isChart: Bool { georeference != nil || request?.isChart == true }
}
