import Testing
import UIKit
@testable import Wingtip

/// A chart's pages full screen at night (PageLook): white on black and
/// shaded by the Dimmer, as the plate on the map; a photo untouched.
struct PageLookTests {
    private func white() -> UIImage {
        let format = UIGraphicsImageRendererFormat.preferred()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4), format: format).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
        }
    }

    /// The red, green and blue of the page's middle, 0 to 255.
    private func middle(_ image: UIImage) throws -> [UInt8] {
        let picture = try #require(image.cgImage)
        var pixel = [UInt8](repeating: 0, count: 4)
        let context = try #require(CGContext(data: &pixel, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                             space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(picture, in: CGRect(x: -2, y: -2, width: 4, height: 4))
        return Array(pixel.prefix(3))
    }

    @Test func aPageUnchangedIsThePictureItself() {
        let page = white()
        #expect(PageLook().drawn(page) === page)
    }

    @Test func invertedTheWhitePaperIsBlack() throws {
        let drawn = PageLook(inverted: true).drawn(white())
        #expect(try middle(drawn).allSatisfy { $0 < 8 })
        #expect(PageLook(inverted: true).paper == .black)
    }

    @Test func theDimmerShadesTheWhitePage() throws {
        let drawn = PageLook(shade: 0.5).drawn(white())
        #expect(try middle(drawn).allSatisfy { $0 < 160 })
    }

    @Test func onlyTheFAAsChartsAreCharts() {
        #expect(PictureRequest(title: "KOSH Airport Diagram", source: .faaChart(url: "u", airport: "KOSH")).isChart)
        #expect(!PictureRequest(title: "A photo", source: .paths(["/api/photo/1.jpg"])).isChart)
    }
}
