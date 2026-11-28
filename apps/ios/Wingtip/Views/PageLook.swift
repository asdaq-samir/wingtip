import SwiftUI
import UIKit

/// A chart's pages drawn full screen and beside the map (ZoomablePictures)
/// under the page's night look (PageLook, NightPage), as the plate on the
/// map is.
extension PageLook {
    /// The Dimmer's shade over a page, the night's ground at the look's
    /// alpha (PagesScrollView sets it); it takes no touch.
    static func shadeView(over page: UIView) -> UIView {
        let shade = UIView(frame: page.bounds)
        shade.backgroundColor = NightPalette.ground
        shade.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        shade.isUserInteractionEnabled = false
        return shade
    }

    /// The pages white on black, as the plate on the map is drawn (PlateRenderer):
    /// each on the paper's white, turned over by a white fill in the
    /// difference blend. Drawn once off the main thread, at full
    /// resolution, and kept by the viewer (PagesScrollView), so neither
    /// opening a chart nor moving the Dimmer draws a page again on the
    /// main thread; the Dimmer's shade is a view over the page.
    @concurrent
    static func inverted(_ images: [UIImage]) async -> [UIImage] {
        images.map { image in
            let format = UIGraphicsImageRendererFormat.preferred()
            format.scale = image.scale
            format.opaque = true
            return UIGraphicsImageRenderer(size: image.size, format: format).image { context in
                let page = CGRect(origin: .zero, size: image.size)
                NightPage.paper(in: context.cgContext, rect: page)
                image.draw(in: page)
                NightPage.over(in: context.cgContext, rect: page, look: PageLook(inverted: true))
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
        return PageLook(inverted: PageLook.inverted(kept: inverted, dark: dark), shade: chartLook.shade(dark: dark))
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
