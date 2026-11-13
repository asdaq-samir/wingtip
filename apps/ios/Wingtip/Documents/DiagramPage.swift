import PDFKit
import UIKit

/// A diagram's first page as PDFKit reads it, drawn as the vector page it
/// is (DiagramOwnShipView), with its graticule from its labels (nil where
/// it has none the engine can fit).
struct DiagramPage {
    typealias Graticule = EngineContract.DiagramGraticuleAnswer
    typealias Placed = EngineContract.DiagramPointAnswer

    /// The FAA's PDF, its first page the diagram.
    let document: PDFDocument
    /// The page in points.
    let size: CGSize
    let graticule: Graticule?
    /// What the engine refused of the page, said under it; nil where it
    /// read the page (a page with no labels has no problem, just no fit).
    var problem: String?

    /// The fix to draw now, nil where it is stale or too coarse: the
    /// engine's `diagram_fix_usable` (AC 120-76D 11.17.2.3, three seconds;
    /// 11.17.2.4, 30 m). Thrown where the engine cannot say: the airplane
    /// is then not drawn, a fix shown that should not be being the danger
    /// here, and the sheet says why.
    static func usable(_ fix: OwnShip.Fix?, now: Date) throws -> OwnShip.Fix? {
        guard let fix else { return nil }
        return try Engine.diagramFixUsable(ageS: now.timeIntervalSince(fix.at), accuracyM: fix.accuracyM) ? fix : nil
    }

    /// Where the fix is on the page, in points from its top left.
    /// Thrown where the engine refuses: the sheet then says it couldn't
    /// place the airplane rather than drawing it anywhere.
    func place(_ fix: OwnShip.Fix) throws -> Placed? {
        guard let g = graticule else { return nil }
        return try Engine.diagramPoint(graticule: .init(latOnX: g.latOnX, a: g.a, b: g.b, c: g.c, d: g.d, northDeg: g.northDeg),
                                       lat: fix.coordinate.latitude, lon: fix.coordinate.longitude,
                                       width: Double(size.width), height: Double(size.height))
    }

    /// Where a point the engine gives (from the page's top left, as
    /// `place` answers) is in PDFKit's space, from the media box's foot.
    func pagePoint(x: Double, y: Double) -> CGPoint {
        let box = document.page(at: 0)?.bounds(for: .mediaBox) ?? CGRect(origin: .zero, size: size)
        return CGPoint(x: box.minX + x, y: box.maxY - y)
    }

    /// The PDF's first page, and its labels found: their words by the
    /// engine (diagram_labels), where each is drawn by PDFKit, the fit by
    /// the engine (diagram_graticule).
    static func read(_ data: Data) -> DiagramPage? {
        guard let document = PDFDocument(data: data), let page = document.page(at: 0) else { return nil }
        let box = page.bounds(for: .mediaBox)
        // A page turned by its /Rotate would need its labels turned too:
        // the d-TPP's are all upright (0), and another is drawn without
        // the airplane.
        guard page.rotation == 0, let text = page.string else { return DiagramPage(document: document, size: box.size, graticule: nil) }
        // A page whose labels the engine cannot read is drawn without the
        // airplane, and says so (logged by Engine.rule).
        let words: [String]
        do { words = try Engine.diagramLabels(text: text) } catch {
            return DiagramPage(document: document, size: box.size, graticule: nil, problem: "Its latitude and longitude marks couldn't be read.")
        }
        var placed: [EngineContract.DiagramGraticuleInputLabelsItem] = []
        for word in words {
            for found in document.findString(word, withOptions: .literal) where found.pages.first == page {
                let at = found.bounds(for: page)
                // PDFKit's points are from the page's foot; the engine's
                // from its top left.
                placed.append(.init(text: word, x: Double(at.midX - box.minX), y: Double(box.maxY - at.midY)))
            }
        }
        do {
            return DiagramPage(document: document, size: box.size, graticule: try Engine.diagramGraticule(labels: placed))
        } catch {
            return DiagramPage(document: document, size: box.size, graticule: nil, problem: "Its latitude and longitude marks couldn't be fitted.")
        }
    }
}
