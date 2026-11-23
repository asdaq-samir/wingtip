import Foundation
import Observation
import SwiftData

/// A pilot's own document as their iCloud carries it to their other
/// devices: a record in the records store (Records), whose CloudKit sync
/// puts it in the pilot's own private iCloud database, Apple's and not
/// ours (docs/privacy-inventory.md). Only while the pilot has turned on
/// Keep in iCloud (DocumentCloud). CloudKit's rules: every attribute
/// optional or given a value, nothing unique.
/// Nonisolated, so the records actor (DocumentRecords) can make and read
/// one off the main actor.
@Model
nonisolated final class OwnDocumentRecord {
    var id: String = ""
    var name: String = ""
    var added: Date = Date()
    /// The PDF itself, kept beside the store as a file and sent to iCloud
    /// as an asset (SwiftData's external storage).
    @Attribute(.externalStorage) var pdf: Data?

    init(id: String, name: String, added: Date, pdf: Data?) {
        self.id = id
        self.name = name
        self.added = added
        self.pdf = pdf
    }
}

/// Keep in iCloud, the library's one switch for the pilot's own documents
/// (the owner, 2026-11-21: "iCloud only if the pilot turns it on"). Off by
/// default: the documents stay on this device. On, each is mirrored into a
/// record (OwnDocumentRecord) and those from the pilot's other devices are
/// written here; turned off, the copies in iCloud are deleted and the ones
/// on this device stay. Markup, bookmarks and last pages stay on each
/// device.
///
/// A pilot's own run to tens of megabytes each, so one document is in
/// memory at a time, and its bytes never touch the main actor: the record
/// carrying the PDF is written and read in DocumentRecords, a model actor
/// of its own, and the file on this device in DeviceDocuments. This class
/// is the main actor's front: the switch, and the lists that load no PDF.
/// Sends run one after another (`queue`), so two Adds close together never
/// send the same document twice.
@MainActor
@Observable
final class DocumentCloud {
    static let key = "documents.iCloud"

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let container: @MainActor () -> ModelContainer
    @ObservationIgnored private var queue: Task<Void, Never>?
    @ObservationIgnored private var recordsActor: DocumentRecords?
    private(set) var on: Bool

    init(defaults: UserDefaults, container: @escaping @MainActor () -> ModelContainer) {
        self.defaults = defaults
        self.container = container
        on = defaults.bool(forKey: Self.key)
    }

    /// The switch turned: on, every document sent and every record taken;
    /// off, every record deleted.
    func set(_ on: Bool, library: DocumentLibrary) async {
        self.on = on
        defaults.set(on, forKey: Self.key)
        if on {
            await pushed(library.own, from: library.store)
            await pull(into: library)
        } else {
            await queue?.value
            let ctx = context()
            for record in (try? ctx.fetch(Self.listed())) ?? [] { ctx.delete(record) }
            try? ctx.save()
        }
    }

    /// A context of its own for each piece of work, dropped with it, so a
    /// record's PDF is not held after it is saved or read.
    private func context() -> ModelContext { ModelContext(container()) }

    /// The actor that writes and reads the records' PDFs, made once.
    private func records() -> DocumentRecords {
        if let made = recordsActor { return made }
        let made = DocumentRecords(modelContainer: container())
        recordsActor = made
        return made
    }

    /// The records' ids, names and dates, their PDFs left in the store.
    private static func listed() -> FetchDescriptor<OwnDocumentRecord> {
        var descriptor = FetchDescriptor<OwnDocumentRecord>()
        descriptor.propertiesToFetch = [\.id, \.name, \.added]
        return descriptor
    }

    /// Documents added (or put back by an Undo) sent, where they have no
    /// record yet, after any sending already under way.
    func pushed(_ docs: [OwnDocument], from store: DeviceDocuments) async {
        guard on, !docs.isEmpty else { return }
        let before = queue
        let task = Task {
            await before?.value
            await push(docs, from: store)
        }
        queue = task
        await task.value
    }

    private func push(_ docs: [OwnDocument], from store: DeviceDocuments) async {
        for doc in docs {
            // Turned off meanwhile, or sent already.
            guard on else { return }
            await records().send(doc, file: store.ownFile(doc.id))
        }
    }

    func renamed(_ doc: OwnDocument) {
        guard on else { return }
        let ctx = context()
        for record in (try? ctx.fetch(Self.listed())) ?? [] where record.id == doc.id { record.name = doc.name }
        try? ctx.save()
    }

    func removed(_ id: String) {
        guard on else { return }
        let ctx = context()
        for record in (try? ctx.fetch(Self.listed())) ?? [] where record.id == id { ctx.delete(record) }
        try? ctx.save()
    }

    /// The pilot's documents from their other devices written here, and a
    /// name changed there taken; run as the library opens. Each one's PDF
    /// read from its record and written here off the main actor.
    func pull(into library: DocumentLibrary) async {
        guard on else { return }
        let listed = ((try? context().fetch(Self.listed())) ?? []).map { OwnDocument(id: $0.id, name: $0.name, bytes: 0, added: $0.added) }
        for record in listed {
            if let mine = library.own.first(where: { $0.id == record.id }) {
                if mine.name != record.name, !record.name.isEmpty { try? library.store.renameOwn(mine.id, to: record.name) }
                continue
            }
            await records().take(record, into: library.store)
        }
        library.reloadDevice()
    }
}

/// Keep in iCloud's records with their PDFs, written and read off the
/// main actor, so a 10 to 60 MB save or fetch (SwiftData's external
/// storage file) never holds the library's screen. A context of its own
/// for each document, dropped with it, so no PDF is held after it is
/// saved or read.
@ModelActor
actor DocumentRecords {
    /// One document's record made from its file, unless it has one.
    func send(_ doc: OwnDocument, file: URL) {
        let id = doc.id
        let ctx = ModelContext(modelContainer)
        let have = (try? ctx.fetchCount(FetchDescriptor<OwnDocumentRecord>(predicate: #Predicate { $0.id == id }))) ?? 0
        guard have == 0 else { return }
        autoreleasepool {
            ctx.insert(OwnDocumentRecord(id: doc.id, name: doc.name, added: doc.added, pdf: try? Data(contentsOf: file)))
            try? ctx.save()
        }
    }

    /// One record's PDF read and written to this device as the document.
    func take(_ doc: OwnDocument, into store: DeviceDocuments) async {
        let id = doc.id
        let pdf: Data? = autoreleasepool {
            (try? ModelContext(modelContainer).fetch(FetchDescriptor<OwnDocumentRecord>(predicate: #Predicate { $0.id == id })))?.first?.pdf
        }
        guard let pdf else { return }
        await store.adoptOwn(doc, pdf: pdf)
    }
}
