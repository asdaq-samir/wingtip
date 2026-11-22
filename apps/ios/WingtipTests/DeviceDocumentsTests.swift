import Foundation
import SwiftData
import Testing
@testable import Wingtip

/// The documents on the device (DeviceDocuments), the reader's places
/// (ReaderPlaces) and Keep in iCloud's records (DocumentCloud), each in a
/// folder or a store of the test's own.
@MainActor
struct DeviceDocumentsTests {
    private let store: DeviceDocuments

    init() {
        let root = FileManager.default.temporaryDirectory.appending(path: "documents-\(UUID().uuidString)", directoryHint: .isDirectory)
        store = DeviceDocuments(root: root.appending(path: "support"), cache: root.appending(path: "cache"))
    }

    private func samplePDF() throws -> URL {
        try #require(SampleDocument.make())
    }

    @Test func addsAPilotsPDFNamedAsItsFile() throws {
        let doc = try store.addOwn(from: try samplePDF(), id: "a", added: Date(timeIntervalSince1970: 1))
        #expect(doc.name == "Sample Briefing Guide")
        #expect(doc.bytes > 0)
        #expect(store.ownList() == [doc])
        #expect(DeviceDocuments.isPDF(store.ownFile("a")))
    }

    @Test func refusesAFileThatIsNoPDF() throws {
        let text = FileManager.default.temporaryDirectory.appending(path: "notes-\(UUID().uuidString).pdf")
        try Data("hello".utf8).write(to: text)
        #expect(throws: (any Error).self) { try store.addOwn(from: text) }
        #expect(store.ownList().isEmpty)
    }

    @Test func renamesAndDeletesWithAnUndo() throws {
        try store.addOwn(from: try samplePDF(), id: "a")
        try store.renameOwn("a", to: "  POH N12345  ")
        #expect(store.ownList().first?.name == "POH N12345")
        try store.renameOwn("a", to: "   ")
        #expect(store.ownList().first?.name == "POH N12345")
        try store.removeOwn("a")
        #expect(store.ownList().isEmpty)
        try store.restoreOwn("a")
        #expect(store.ownList().map(\.id) == ["a"])
        try store.removeOwn("a")
        store.purge()
        #expect(throws: (any Error).self) { try store.restoreOwn("a") }
    }

    @Test func keepsOneEditionTheNewestInTheOldOnesPlace() throws {
        let old = LibraryEntry(bytes: 10, edition: "C", group: "Handbooks", id: "phak", kind: "pdf", title: "PHAK")
        try store.keep(old, edition: "C", from: try samplePDF())
        let new = LibraryEntry(bytes: 10, edition: "D", group: "Handbooks", id: "phak", kind: "pdf", title: "PHAK")
        let kept = store.keptList()
        #expect(kept.map(\.edition) == ["C"])
        #expect(DeviceDocuments.stale(kept, shelf: [new]).map(\.id) == ["phak"])
        #expect(DeviceDocuments.stale(kept, shelf: [old]).isEmpty)
        try store.keep(new, edition: "D", from: try samplePDF())
        #expect(store.keptList().map(\.edition) == ["D"])
        let files = try FileManager.default.contentsOfDirectory(atPath: store.keptFolder("phak").path())
        #expect(files.sorted() == ["D.pdf", "kept.json"])
        store.forget("phak")
        #expect(store.keptList().isEmpty)
    }

    @Test func namesFromAServerNeverMakeAPath() {
        #expect(DeviceDocuments.safe("../../etc") == "_.._.._etc")
        #expect(DeviceDocuments.safe("FAA-H-8083-25C") == "FAA-H-8083-25C")
        #expect(!DeviceDocuments.safe("a/b").contains("/"))
    }

    @Test func keepsTheShelfForNoSignal() {
        let shelf = [LibraryEntry(edition: "2026-11-10", group: "AIM", id: "aim", kind: "pdf", title: "AIM")]
        #expect(store.loadShelf() == nil)
        store.saveShelf(shelf)
        #expect(store.loadShelf() == shelf)
    }

    @Test func theReadersPlacesAreKept() {
        let file = store.root.appending(path: "places.json")
        let places = ReaderPlaces(file: file)
        places.leftAt("aim", page: 12)
        places.toggleBookmark("aim", page: 30, label: "Preflight Briefings")
        places.toggleBookmark("aim", page: 5, label: "Weather")
        places.renameBookmark("aim", page: 30, to: "  Briefings ")
        places.setInverted(true)
        let again = ReaderPlaces(file: file)
        #expect(again.page("aim") == 12)
        #expect(again.bookmarks("aim") == [Bookmark(page: 5, label: "Weather"), Bookmark(page: 30, label: "Briefings")])
        #expect(again.inverted == true)
        again.toggleBookmark("aim", page: 5, label: "")
        #expect(again.bookmarks("aim").map(\.page) == [30])
        again.forget("aim")
        #expect(again.page("aim") == nil && again.bookmarks("aim").isEmpty)
    }

    @Test func keepInICloudMirrorsTheOwnAndTakesTheOthers() throws {
        let container = try Records.inMemory()
        let defaults = try #require(UserDefaults(suiteName: "documents-\(UUID().uuidString)"))
        let cloud = DocumentCloud(defaults: defaults, context: { container.mainContext })
        let library = DocumentLibrary(store: store)
        try store.addOwn(from: try samplePDF(), id: "mine")
        library.reloadDevice()
        // Off: nothing leaves the device.
        cloud.pushed(library.own, from: store)
        #expect(try container.mainContext.fetch(FetchDescriptor<OwnDocumentRecord>()).isEmpty)
        // Another device's document, in iCloud.
        container.mainContext.insert(OwnDocumentRecord(id: "theirs", name: "Club Rules", added: Date(), pdf: try Data(contentsOf: try samplePDF())))
        cloud.set(true, library: library)
        #expect(try container.mainContext.fetch(FetchDescriptor<OwnDocumentRecord>()).map(\.id).sorted() == ["mine", "theirs"])
        #expect(library.own.map(\.name).sorted() == ["Club Rules", "Sample Briefing Guide"])
        cloud.set(false, library: library)
        #expect(try container.mainContext.fetch(FetchDescriptor<OwnDocumentRecord>()).isEmpty)
        #expect(library.own.count == 2)
    }
}
