import Foundation
import Observation

/// What the reader shows: a PDF on the device (the pilot's own, kept for
/// the air, or fetched to read), or a CFR part's text.
enum ReaderSource {
    case pdf(URL)
    case text(CfrText)
}

/// The documents library's model (DocumentsPage, the reader, CitedText),
/// the web's useDocuments: the pilot's own documents and the FAA's shelf,
/// each document's edition and whether it is kept on this device, and the
/// verbs: Keep for the Air and its undoing, Add, Rename and Delete with
/// its Undo. One for the app (ScreenModels), every window reading the
/// same shelf from the environment.
///
/// A kept document whose edition the shelf has replaced is kept again as
/// the shelf is read (the FAA publishes a new one, the planner fetches it,
/// this device takes it), so what is on board is the edition in force.
@MainActor
@Observable
final class DocumentLibrary {
    /// The shelf's groups in the order the page lists them (the planner's
    /// LibraryDocument.group).
    static let groups = ["Regulations", "AIM", "Handbooks", "Advisory Circulars", "Charts"]

    @ObservationIgnored let store: DeviceDocuments
    /// Keep in iCloud's mirror of the pilot's own, and the reader's places
    /// in each document, kept with the documents they are of.
    @ObservationIgnored let cloud: DocumentCloud
    @ObservationIgnored let places: ReaderPlaces
    private(set) var shelf: [LibraryEntry]
    private(set) var shelfFailed = false
    private(set) var shelfLoading = false
    private(set) var own: [OwnDocument] = []
    private(set) var kept: [KeptDocument] = []
    /// The documents being fetched to keep, by id: the share come so far.
    private(set) var keeping: [String: Double] = [:]
    /// Those that could not be, said on their rows.
    private(set) var failed: Set<String> = []
    /// Why a file handed over was not added, said at the list's head.
    var problem: String?
    @ObservationIgnored private var askedAt: Date?
    @ObservationIgnored private var loading: Task<Void, Never>?
    /// The documents listed again since the load began (a PDF opened from
    /// Files at launch): the load's older listing is not put over it.
    @ObservationIgnored private var listed = false

    init(store: DeviceDocuments, cloud: DocumentCloud, places: ReaderPlaces) {
        self.store = store
        self.cloud = cloud
        self.places = places
        shelf = []
    }

    /// The device's side read off the main actor once, after the app's
    /// first frame (ScreenModels.loadKept), where it was read in the
    /// launch before it: a delete's Undo lasts the launch it was made in,
    /// so the trash goes first, then the shelf as last read (unless one
    /// has come from the planner meanwhile) and the documents' own files.
    /// Each reader of the kept documents waits on it.
    func load() async {
        if loading == nil {
            loading = Task {
                let opened = await store.opening()
                if shelf.isEmpty { shelf = opened.shelf ?? [] }
                if !listed { (own, kept) = (opened.own, opened.kept) }
            }
        }
        await loading?.value
    }

    /// This device's library, its iCloud switch and its places, made once
    /// for the app (ScreenModels).
    static func device() -> DocumentLibrary {
        DocumentLibrary(store: .device, cloud: DocumentCloud(defaults: .standard, container: { Records.container }),
                        places: ReaderPlaces(file: DeviceDocuments.device.root.appending(path: "places.json")))
    }

    func reloadDevice() {
        listed = true
        own = store.ownList()
        kept = store.keptList()
    }

    /// The shelf by its groups, each with what it holds; with no shelf to
    /// read (no signal, never asked), what is kept, as it was kept.
    var grouped: [(group: String, documents: [LibraryEntry])] {
        let docs = shelf.isEmpty ? kept.map(\.entry) : shelf
        return Self.groups.compactMap { group in
            let in_ = docs.filter { $0.group == group }
            return in_.isEmpty ? nil : (group, in_)
        }
    }

    /// The shelf's entry for a document, else its entry as it was kept.
    func entry(_ doc: String) -> LibraryEntry? {
        shelf.first { $0.id == doc } ?? kept.first { $0.doc == doc }?.entry
    }

    func isKept(_ doc: String) -> Bool { kept.contains { $0.doc == doc } }

    /// The shelf asked again, at most each hour unless `force`: new
    /// editions come a few times a year. Then each kept document the shelf
    /// has a newer edition of is kept again in its place.
    func refreshShelf(force: Bool = false) async {
        if !force, let askedAt, Date().timeIntervalSince(askedAt) < 3600 { return }
        guard !shelfLoading else { return }
        shelfLoading = true
        // Asked, answered or not: every cite on a screen waits on the
        // shelf, and none asks again within the hour, signal or none.
        askedAt = Date()
        defer { shelfLoading = false }
        do {
            let fresh = try await Planner.library()
            shelf = fresh
            shelfFailed = false
            store.saveShelf(fresh)
        } catch {
            shelfFailed = true
            return
        }
        await load()
        for entry in DeviceDocuments.stale(kept, shelf: shelf) { await keep(entry) }
    }

    /// Kept whole on this device in the shelf's edition, for the air.
    func keep(_ entry: LibraryEntry) async {
        guard let edition = entry.edition, keeping[entry.id] == nil else { return }
        keeping[entry.id] = 0
        failed.remove(entry.id)
        defer { keeping[entry.id] = nil }
        do {
            let file = try await fetch(entry, edition: edition) { [weak self] bytes in
                guard let total = entry.bytes, total > 0 else { return }
                self?.keeping[entry.id] = min(1, Double(bytes) / Double(total))
            }
            _ = try await store.keeping(entry, edition: edition, from: file)
            reloadDevice()
        } catch {
            failed.insert(entry.id)
        }
    }

    /// Kept no longer.
    func forget(_ entry: LibraryEntry) {
        store.forget(entry.id)
        reloadDevice()
    }

    /// A document's file in an edition, from the cache where it is there,
    /// else fetched into it: a PDF a chunk at a time, a part's text whole.
    private func fetch(_ entry: LibraryEntry, edition: String, progress: @escaping @MainActor (Int) -> Void) async throws -> URL {
        let file = store.cacheFile(doc: entry.id, edition: edition, kind: entry.kind)
        if FileManager.default.fileExists(atPath: file.path(percentEncoded: false)) { return file }
        if entry.kind == "text" {
            let text = try await Planner.libraryText(doc: entry.id, edition: edition)
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(text).write(to: file, options: .atomic)
        } else {
            try await Planner.libraryPdf(doc: entry.id, edition: edition, to: file, progress: progress)
        }
        return file
    }

    /// What the reader shows for a place: the pilot's own; a library
    /// document kept in the edition the shelf names (or in any, with no
    /// shelf to ask); else fetched from the planner. Thrown where it can't
    /// be had, which the reader says.
    func source(for place: DocPlace, progress: @escaping @MainActor (Int) -> Void = { _ in }) async throws -> (ReaderSource, edition: String?) {
        if let id = place.ownID {
            let file = store.ownFile(id)
            guard FileManager.default.fileExists(atPath: file.path(percentEncoded: false)) else { throw CocoaError(.fileNoSuchFile) }
            return (.pdf(file), nil)
        }
        await load()
        if shelf.isEmpty { await refreshShelf() }
        let wanted = shelf.first { $0.id == place.doc }?.edition
        if let mine = kept.first(where: { $0.doc == place.doc }), wanted == nil || wanted == mine.edition {
            return (try await read(store.keptFile(mine), kind: mine.entry.kind), mine.edition)
        }
        guard let entry = entry(place.doc), let edition = wanted else { throw CocoaError(.fileNoSuchFile) }
        return (try await read(try await fetch(entry, edition: edition, progress: progress), kind: entry.kind), edition)
    }

    private func read(_ file: URL, kind: String) async throws -> ReaderSource {
        kind == "text" ? .text(try await store.text(file)) : .pdf(file)
    }

    // MARK: The pilot's own

    /// PDFs handed over (Files, the share sheet, a drop), each added to
    /// the pilot's own; a file that is not a PDF said at the list's head.
    @discardableResult
    func add(_ urls: [URL]) async -> [OwnDocument] {
        let (added, refused) = await store.addingOwn(urls)
        if let name = refused.last { problem = String(localized: "\(name) isn't a PDF, so it wasn't added.") }
        if !added.isEmpty { problem = nil }
        reloadDevice()
        // Sent behind any send under way, but not waited for: a PDF opened
        // from Files opens at once, not after every earlier iCloud send.
        Task { await cloud.pushed(added, from: store) }
        return added
    }

    func name(_ id: String) -> String? { own.first { $0.id == id }?.name }

    func rename(_ id: String, to name: String) {
        try? store.renameOwn(id, to: name)
        reloadDevice()
        if let doc = own.first(where: { $0.id == id }) { cloud.renamed(doc) }
    }

    /// One of the pilot's own taken off this device, with the system's
    /// Undo (shake, ⌘Z, the bar's Undo) that puts it back; its last page
    /// and bookmarks forgotten once nothing can undo it.
    func remove(_ id: String, undo: UndoManager?) {
        guard let doc = own.first(where: { $0.id == id }), (try? store.removeOwn(id)) != nil else { return }
        reloadDevice()
        cloud.removed(id)
        guard let undo else {
            forgetRemoved(id)
            return
        }
        undo.register(self, named: String(localized: "Delete \(doc.name)")) { library in
            try? library.store.restoreOwn(id)
            library.reloadDevice()
            if let back = library.own.first(where: { $0.id == id }) { Task { await library.cloud.pushed([back], from: library.store) } }
        }
    }

    /// The deletes past their Undo gone for good, with their places.
    func forgetRemoved(_ id: String? = nil) {
        store.purge()
        if let id { places.forget(DocPlace.own(id).doc) }
    }
}

extension LibraryEntry {
    /// The edition as a pilot reads it, and its date: "FAA-H-8083-25C ·
    /// 3 Nov 2026"; none while the shelf has never had it.
    var editionLine: String? {
        guard let label else { return nil }
        let day = date.flatMap { try? Date($0, strategy: .iso8601.year().month().day()) }
        return ([label] + [day.map { $0.formatted(.dateTime.day().month(.abbreviated).year()) }].compactMap { $0 }).joined(separator: " · ")
    }
}
