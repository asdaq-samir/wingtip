import PDFKit
import Testing
import UIKit
@testable import Wingtip

/// A chart's pages full screen at night (PageLook): white on black and
/// shaded by the Dimmer, as the plate on the map; a photo untouched.
@MainActor
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

    @Test func invertedTheWhitePaperIsBlack() async throws {
        let drawn = try #require(await PageLook.inverted([white()]).first)
        #expect(try middle(drawn).allSatisfy { $0 < 8 })
        #expect(PageLook(inverted: true).paper == .black)
    }

    /// The paper first: a PDF's page draws only its ink, so turned over on
    /// clear paper it would be one white sheet at night.
    @Test func anInvertedPageOnClearPaperIsBlack() throws {
        let format = UIGraphicsImageRendererFormat.preferred()
        format.scale = 1
        format.opaque = false
        let rect = CGRect(x: 0, y: 0, width: 4, height: 4)
        let drawn = UIGraphicsImageRenderer(size: rect.size, format: format).image { context in
            NightPage.paper(in: context.cgContext, rect: rect)
            NightPage.over(in: context.cgContext, rect: rect, look: PageLook(inverted: true))
        }
        #expect(try middle(drawn).allSatisfy { $0 < 8 })
    }

    /// The diagram's page, a blank PDF drawn by PDFKit into a clear
    /// bitmap, comes out black under White on Black, and white by day.
    @Test func theDiagramsBlankPageIsBlackAtNight() throws {
        let data = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 40, height: 40)).pdfData { $0.beginPage() }
        let document = try #require(PDFDocument(data: data))
        let pages = DiagramPages()
        document.delegate = pages
        let page = try #require(withExtendedLifetime(pages) { document.page(at: 0) } as? DiagramNightPage)
        func pixel(_ look: PageLook) throws -> [UInt8] {
            page.look = look
            var bytes = [UInt8](repeating: 0, count: 40 * 40 * 4)
            let context = try #require(CGContext(data: &bytes, width: 40, height: 40, bitsPerComponent: 8, bytesPerRow: 160,
                                                 space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
            page.draw(with: .mediaBox, to: context)
            let at = (20 * 40 + 20) * 4
            return Array(bytes[at..<at + 4])
        }
        let night = try pixel(PageLook(inverted: true))
        #expect(night[0] < 8 && night[1] < 8 && night[2] < 8 && night[3] > 247)
    }

    /// The Dimmer is the shade view's alpha over the page, no page drawn again.
    @Test func theDimmerIsTheShadesAlpha() {
        let view = PagesScrollView()
        view.images = [white()]
        view.look = PageLook(shade: 0.5)
        let page = view.subviews.first?.subviews.compactMap { $0 as? UIImageView }.first
        #expect(page?.subviews.first?.alpha == 0.5)
    }

    @Test func onlyTheFAAsChartsAreCharts() {
        #expect(PictureRequest(title: "KOSH Airport Diagram", source: .faaChart(url: "u", airport: "KOSH")).isChart)
        #expect(!PictureRequest(title: "A photo", source: .paths(["/api/photo/1.jpg"])).isChart)
    }
}
