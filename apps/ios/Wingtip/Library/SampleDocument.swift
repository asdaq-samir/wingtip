#if DEBUG
import PDFKit
import UIKit

/// A small PDF made on the device for the UI tests (`-sample-document`,
/// DocumentsIPadTests): three pages, each headed as the AIM heads a
/// paragraph, under an outline, so the reader's contents, search,
/// bookmarks and keys are tested with no planner and no file to bundle.
enum SampleDocument {
    static let argument = "-sample-document"
    static let headings = ["7-1-1. National Weather Service", "7-1-5. Preflight Briefings", "7-1-9. Inflight Weather Advisories"]

    /// Added once as the pilot's own, where the launch asks for it.
    @MainActor
    static func addIfAsked(to library: DocumentLibrary) {
        guard CommandLine.arguments.contains(argument), !library.own.contains(where: { $0.name == "Sample Briefing Guide" }) else { return }
        guard let file = make() else { return }
        library.add([file])
    }

    static func make() -> URL? {
        let bounds = CGRect(x: 0, y: 0, width: 612, height: 792)
        let data = UIGraphicsPDFRenderer(bounds: bounds).pdfData { context in
            for (i, heading) in headings.enumerated() {
                context.beginPage()
                heading.draw(at: CGPoint(x: 72, y: 72), withAttributes: [.font: UIFont.boldSystemFont(ofSize: 18)])
                "Page \(i + 1) of the sample briefing guide.".draw(at: CGPoint(x: 72, y: 110), withAttributes: [.font: UIFont.systemFont(ofSize: 12)])
            }
        }
        guard let doc = PDFDocument(data: data) else { return nil }
        let root = PDFOutline()
        for (i, heading) in headings.enumerated() {
            guard let page = doc.page(at: i) else { continue }
            let item = PDFOutline()
            item.label = heading
            item.destination = PDFDestination(page: page, at: CGPoint(x: 0, y: bounds.height))
            root.insertChild(item, at: i)
        }
        doc.outlineRoot = root
        let url = FileManager.default.temporaryDirectory.appending(path: "Sample Briefing Guide.pdf")
        return doc.write(to: url) ? url : nil
    }
}
#endif
