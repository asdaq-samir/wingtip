import Foundation
import PencilKit
import Testing
@testable import Wingtip

/// The iPad's own rules (docs/design/ios.md §16; the owner, 2026-11-21:
/// "Primary app users are on iPad"): the room for the sidebar beside a
/// card, the windows, a chart's own window, the pilot's markup and the
/// files dropped on a window.
@MainActor
struct IPadTests {
    /// The sidebar stays beside a card where the map keeps a phone's width
    /// between them, at full screen held sideways; not upright, nor at a
    /// half or two thirds of a 13-inch in Split View.
    @Test(arguments: [1194.0, 1376, 1133])
    func theSidebarStaysBesideACardWhereTheMapHasRoom(width: Double) {
        #expect(SplitRoom.cardFitsBesideSidebar(width: width))
    }

    @Test(arguments: [834.0, 1032, 744, 683, 910])
    func theSidebarLeavesTheCardWhereTheMapHasNoRoom(width: Double) {
        #expect(!SplitRoom.cardFitsBesideSidebar(width: width))
    }

    @Test func theSidebarsRoomAddsUpToAPhonesWidthOfMap() {
        #expect(SplitRoom.sidebar + SplitRoom.inspector + SplitRoom.leastMap == 1125)
    }

    /// The first window runs the loops; shut, the next takes them on, and
    /// a window joining again is not counted twice.
    @Test func theLoopsGoToTheNextWindowWhenTheLeadShuts() {
        let lead = WindowLead()
        let (first, second) = (UUID(), UUID())
        lead.join(first)
        lead.join(second)
        lead.join(first)
        #expect(lead.leads(first) && !lead.leads(second))
        lead.leave(first)
        #expect(lead.leads(second))
        lead.leave(second)
        #expect(lead.windows.isEmpty)
    }

    /// A chart asked for by what it is, as a window keeps it through a
    /// relaunch: the same request back, and the viewer's picture made from
    /// it carrying it on for its markup and its window.
    @Test func aChartsWindowKeepsWhatItShows() throws {
        let request = PictureRequest(title: "ILS or LOC RWY 36", source: .faaChart(url: "https://aeronav.faa.gov/d-tpp/2611/00123IL36.PDF", airport: "KOSH"))
        let back = try JSONDecoder().decode(PictureRequest.self, from: JSONEncoder().encode(request))
        #expect(back == request)
        let shown = ShownPicture(request)
        #expect(shown.title == request.title && shown.request == request)
        #expect(shown.kept?.key == "KOSH|https://aeronav.faa.gov/d-tpp/2611/00123IL36.PDF")
        #expect(ShownPicture.faaChart(request.title, url: "https://aeronav.faa.gov/d-tpp/2611/00123IL36.PDF", airport: "KOSH").request == request)
    }

    /// Markup is kept by the chart's address, which names its cycle: the
    /// next cycle's plate starts clean. A field's runway sketch, drawn on
    /// the device, has no address and so neither markup nor window.
    @Test func markupIsKeptByTheChartsAddress() {
        let this = PictureRequest(title: "Plate", source: .faaChart(url: "https://aeronav.faa.gov/d-tpp/2611/00123IL36.PDF", airport: "KOSH"))
        let next = PictureRequest(title: "Plate", source: .faaChart(url: "https://aeronav.faa.gov/d-tpp/2612/00123IL36.PDF", airport: "KOSH"))
        #expect(this.markupKey != next.markupKey)
        #expect(PictureRequest(title: "Photo", source: .paths(["/a.png", "/b.png"])).markupKey == "/a.png|/b.png")
        #expect(ShownPicture(title: "KOSH runways") { [] }.request == nil)
    }

    /// A drawing kept and read back; cleared, its file gone; and every one
    /// forgotten at sign-out (Session.forgetDevice).
    @Test func markupIsKeptReadBackAndForgotten() {
        let key = "test|\(UUID().uuidString)"
        #expect(PlateMarkup.load(key).strokes.isEmpty)
        let ink = PKInk(.pen, color: .red)
        let points = [CGPoint(x: 10, y: 10), CGPoint(x: 200, y: 120)].enumerated().map { index, at in
            PKStrokePoint(location: at, timeOffset: Double(index) / 10, size: CGSize(width: 4, height: 4), opacity: 1, force: 1, azimuth: 0, altitude: .pi / 2)
        }
        let drawing = PKDrawing(strokes: [PKStroke(ink: ink, path: PKStrokePath(controlPoints: points, creationDate: Date()))])
        PlateMarkup.save(drawing, key)
        #expect(PlateMarkup.load(key).strokes.count == 1)
        PlateMarkup.save(PKDrawing(), key)
        #expect(!FileManager.default.fileExists(atPath: PlateMarkup.file(key).path))
        PlateMarkup.save(drawing, key)
        PlateMarkup.forgetAll()
        #expect(PlateMarkup.load(key).strokes.isEmpty)
    }

    /// The files a window takes are those the app opens from Files, and
    /// words dropped go to the search on one line; a page of text does not.
    @Test func aWindowTakesTheAppsFilesAndAFewWords() throws {
        #expect(WindowFiles.types.contains(.wingtipFlight))
        #expect(Set(WindowFiles.types.compactMap(\.preferredFilenameExtension)).isSuperset(of: Links.trackExtensions))
        #expect(WindowFiles.searchWords("  KOSH\n KMSN ") == "KOSH KMSN")
        #expect(WindowFiles.searchWords(" \n ") == nil)
        #expect(WindowFiles.searchWords(String(repeating: "word ", count: 100)) == nil)
        let file = FileManager.default.temporaryDirectory.appending(path: "\(UUID().uuidString).gpx")
        try Data("<gpx/>".utf8).write(to: file)
        let copy = try #require(WindowFiles.copy(file))
        #expect(copy != file && copy.lastPathComponent == file.lastPathComponent)
        #expect(Links.command(for: copy) == .track(copy))
    }
}
