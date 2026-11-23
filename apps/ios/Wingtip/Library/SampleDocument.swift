#if DEBUG
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

    /// The outline is written with the pages, CoreGraphics' own
    /// (CGPDFContextSetOutline): PDFKit's PDFDocument.write dropped an
    /// outline set on a document read from data, and the reader's Contents
    /// then said the guide had none (DocumentsIPadTests, 2026-11-22).
    static func make() -> URL? {
        let bounds = CGRect(x: 0, y: 0, width: 612, height: 792)
        let data = UIGraphicsPDFRenderer(bounds: bounds).pdfData { context in
            for (i, heading) in headings.enumerated() {
                context.beginPage()
                heading.draw(at: CGPoint(x: 72, y: 72), withAttributes: [.font: UIFont.boldSystemFont(ofSize: 18)])
                "Page \(i + 1) of the sample briefing guide.".draw(at: CGPoint(x: 72, y: 110), withAttributes: [.font: UIFont.systemFont(ofSize: 12)])
            }
            // Each heading to the top of its page (pages count from 1).
            let children: [[String: Any]] = headings.enumerated().map { i, heading in
                ["Title": heading, "Destination": i + 1, "DestinationRect": CGRect(x: 0, y: bounds.height, width: 0, height: 0).dictionaryRepresentation]
            }
            CGPDFContextSetOutline(context.cgContext, ["Children": children] as CFDictionary)
        }
        let url = FileManager.default.temporaryDirectory.appending(path: "Sample Briefing Guide.pdf")
        do {
            try data.write(to: url, options: .atomic)
            return url
        } catch {
            return nil
        }
    }
}
#endif
