import Foundation

/// A pilot's own document: a POH, a checklist, the insurance, the club's
/// rules. On this device, and in their own iCloud only if they turn it on
/// (DocumentCloud); never sent to Wingtip's servers.
struct OwnDocument: Codable, Hashable, Identifiable, Sendable {
    let id: String
    var name: String
    var bytes: Int
    /// When it was added.
    var added: Date
}

/// A library document kept for the air, with its shelf's entry as it was
/// kept, so the library lists it with no signal.
struct KeptDocument: Codable, Hashable, Sendable {
    let doc: String
    let edition: String
    let bytes: Int
    let entry: LibraryEntry
}

/// Where the documents live on the device, apart from the screens so a
/// test gives its own folder: the pilot's own in Application Support
/// (theirs, so in the device's backup), each in a folder of its own with
/// its markup beside it; the library's kept for the air there too, out of
/// the backup since the planner has them again; the ones read without
/// keeping in Caches, which iOS may clear when it needs the room.
struct DeviceDocuments: Sendable {
    let root: URL
    let cache: URL

    static let device = DeviceDocuments(
        root: FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appending(path: "Library", directoryHint: .isDirectory),
        cache: FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appending(path: "Library", directoryHint: .isDirectory))

    private var fm: FileManager { .default }
    private var own: URL { root.appending(path: "own", directoryHint: .isDirectory) }
    private var trash: URL { root.appending(path: "trash", directoryHint: .isDirectory) }
    private var kept: URL { root.appending(path: "kept", directoryHint: .isDirectory) }

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = .sortedKeys
        return e
    }()

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    /// A name from a server or a file made safe as a file's name: an
    /// edition is "FAA-H-8083-25C" or "2026-11-10", never a path.
    static func safe(_ name: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: ".-_"))
        let cleaned = String(name.unicodeScalars.map { allowed.contains($0) ? Character($0) : "_" })
        return cleaned.isEmpty || cleaned.hasPrefix(".") ? "_" + cleaned : cleaned
    }

    // MARK: The pilot's own

    func ownFolder(_ id: String) -> URL { own.appending(path: Self.safe(id), directoryHint: .isDirectory) }
    func ownFile(_ id: String) -> URL { ownFolder(id).appending(path: "document.pdf") }

    /// The pilot's own, the first added first.
    func ownList() -> [OwnDocument] {
        let folders = (try? fm.contentsOfDirectory(at: own, includingPropertiesForKeys: nil)) ?? []
        return folders.compactMap { folder in
            (try? Data(contentsOf: folder.appending(path: "info.json"))).flatMap { try? Self.decoder.decode(OwnDocument.self, from: $0) }
        }
        .sorted { ($0.added, $0.id) < ($1.added, $1.id) }
    }

    /// Whether a file is a PDF, by its first bytes rather than its name.
    static func isPDF(_ url: URL) -> Bool {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return false }
        defer { try? handle.close() }
        return (try? handle.read(upToCount: 4)) == Data("%PDF".utf8)
    }

    /// A PDF the pilot handed over (Files, the share sheet, a drop) copied
    /// in as their own, named as its file is without ".pdf". Thrown for a
    /// file that is not a PDF.
    @discardableResult
    func addOwn(from url: URL, id: String = UUID().uuidString, added: Date = Date()) throws -> OwnDocument {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard Self.isPDF(url) else { throw CocoaError(.fileReadCorruptFile) }
        let folder = ownFolder(id)
        try fm.createDirectory(at: folder, withIntermediateDirectories: true)
        try? fm.removeItem(at: ownFile(id))
        try fm.copyItem(at: url, to: ownFile(id))
        let bytes = (try? fm.attributesOfItem(atPath: ownFile(id).path(percentEncoded: false))[.size] as? Int) ?? 0
        var name = url.deletingPathExtension().lastPathComponent.trimmingCharacters(in: .whitespaces)
        if name.isEmpty { name = String(localized: "Document") }
        let doc = OwnDocument(id: id, name: name, bytes: bytes, added: added)
        try write(doc)
        return doc
    }

    func write(_ doc: OwnDocument) throws {
        try fm.createDirectory(at: ownFolder(doc.id), withIntermediateDirectories: true)
        try Self.encoder.encode(doc).write(to: ownFolder(doc.id).appending(path: "info.json"), options: .atomic)
    }

    /// Renamed in place; a name of nothing but spaces leaves it as it was.
    func renameOwn(_ id: String, to name: String) throws {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, var doc = ownList().first(where: { $0.id == id }) else { return }
        doc.name = trimmed
        try write(doc)
    }

    /// Taken off the list, its folder (the PDF and its markup) held aside
    /// for the Undo until `purge`.
    func removeOwn(_ id: String) throws {
        try fm.createDirectory(at: trash, withIntermediateDirectories: true)
        let held = trash.appending(path: Self.safe(id), directoryHint: .isDirectory)
        try? fm.removeItem(at: held)
        try fm.moveItem(at: ownFolder(id), to: held)
    }

    /// The Undo of a delete: the folder back as it was.
    func restoreOwn(_ id: String) throws {
        try fm.createDirectory(at: own, withIntermediateDirectories: true)
        try fm.moveItem(at: trash.appending(path: Self.safe(id), directoryHint: .isDirectory), to: ownFolder(id))
    }

    /// The deletes no Undo can bring back now, gone for good.
    func purge() {
        try? fm.removeItem(at: trash)
    }

    // MARK: The library's, kept for the air or read

    func keptFolder(_ doc: String) -> URL { kept.appending(path: Self.safe(doc), directoryHint: .isDirectory) }

    func keptFile(_ entry: KeptDocument) -> URL {
        keptFolder(entry.doc).appending(path: Self.safe(entry.edition) + (entry.entry.kind == "text" ? ".json" : ".pdf"))
    }

    /// The library's documents kept on this device.
    func keptList() -> [KeptDocument] {
        let folders = (try? fm.contentsOfDirectory(at: kept, includingPropertiesForKeys: nil)) ?? []
        return folders.compactMap { folder in
            (try? Data(contentsOf: folder.appending(path: "kept.json"))).flatMap { try? Self.decoder.decode(KeptDocument.self, from: $0) }
        }
        .sorted { $0.doc < $1.doc }
    }

    /// A document kept in its edition from a file fetched (a PDF, or a
    /// CFR part's text as JSON), in the old edition's place: one edition
    /// on board, the one in force.
    @discardableResult
    func keep(_ entry: LibraryEntry, edition: String, from file: URL) throws -> KeptDocument {
        let folder = keptFolder(entry.id)
        try? fm.removeItem(at: folder.appending(path: "kept.json"))
        for old in (try? fm.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? [] where old.lastPathComponent != "markup" {
            try? fm.removeItem(at: old)
        }
        try fm.createDirectory(at: folder, withIntermediateDirectories: true)
        let bytes = (try? fm.attributesOfItem(atPath: file.path(percentEncoded: false))[.size] as? Int) ?? 0
        let record = KeptDocument(doc: entry.id, edition: edition, bytes: bytes, entry: entry)
        try fm.copyItem(at: file, to: keptFile(record))
        try Self.encoder.encode(record).write(to: folder.appending(path: "kept.json"), options: .atomic)
        // Out of the device's backup: the planner has it again.
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var marked = kept
        try? fm.createDirectory(at: marked, withIntermediateDirectories: true)
        try? marked.setResourceValues(values)
        return record
    }

    /// Kept no longer; the pilot's markup on it stays (markupFolder).
    func forget(_ doc: String) {
        for file in (try? fm.contentsOfDirectory(at: keptFolder(doc), includingPropertiesForKeys: nil)) ?? [] where file.lastPathComponent != "markup" {
            try? fm.removeItem(at: file)
        }
    }

    /// Where a library document read but not kept is put, in Caches.
    func cacheFile(doc: String, edition: String, kind: String) -> URL {
        cache.appending(path: Self.safe(doc), directoryHint: .isDirectory)
            .appending(path: Self.safe(edition) + (kind == "text" ? ".json" : ".pdf"))
    }

    /// The kept documents the shelf has a newer edition of: kept again in
    /// its place as the shelf is read, so what is on board is in force.
    static func stale(_ kept: [KeptDocument], shelf: [LibraryEntry]) -> [LibraryEntry] {
        shelf.filter { entry in
            guard let edition = entry.edition, let mine = kept.first(where: { $0.doc == entry.id }) else { return false }
            return mine.edition != edition
        }
    }

    // MARK: Markup, beside the document

    /// The pilot's markup on a document, one drawing a page: in a pilot's
    /// own document's folder (so it goes where the document goes), and for
    /// the library's beside its kept folder, by edition, since a new
    /// edition's pages are not the old one's.
    func markupFolder(_ place: DocPlace, edition: String?) -> URL {
        if let id = place.ownID { return ownFolder(id).appending(path: "markup", directoryHint: .isDirectory) }
        return keptFolder(place.doc).appending(path: "markup", directoryHint: .isDirectory)
            .appending(path: Self.safe(edition ?? "none"), directoryHint: .isDirectory)
    }

    // MARK: The shelf as last read, for no signal

    private var shelfFile: URL { root.appending(path: "shelf.json") }

    func saveShelf(_ shelf: [LibraryEntry]) {
        try? fm.createDirectory(at: root, withIntermediateDirectories: true)
        try? Self.encoder.encode(shelf).write(to: shelfFile, options: .atomic)
    }

    func loadShelf() -> [LibraryEntry]? {
        (try? Data(contentsOf: shelfFile)).flatMap { try? Self.decoder.decode([LibraryEntry].self, from: $0) }
    }
}
