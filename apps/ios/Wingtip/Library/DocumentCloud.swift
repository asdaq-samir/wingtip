import Foundation
import Observation
import SwiftData

/// A pilot's own document as their iCloud carries it to their other
/// devices: a record in the records store (Records), whose CloudKit sync
/// puts it in the pilot's own private iCloud database, Apple's and not
/// ours (docs/privacy-inventory.md). Only while the pilot has turned on
/// Keep in iCloud (DocumentCloud). CloudKit's rules: every attribute
/// optional or given a value, nothing unique.
@Model
final class OwnDocumentRecord {
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
/// memory at a time: its file read and written off the main actor
/// (DeviceDocuments), and its record saved in a context of its own that
/// goes with it. Sends run one after another (`queue`), so two Adds close
/// together never send the same document twice.
@MainActor
@Observable
final class DocumentCloud {
    static let key = "documents.iCloud"

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let container: @MainActor () -> ModelContainer
    @ObservationIgnored private var queue: Task<Void, Never>?
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
            let have = (try? context().fetchCount(FetchDescriptor<OwnDocumentRecord>(predicate: #Predicate { $0.id == doc.id }))) ?? 0
            guard have == 0 else { continue }
            let pdf = await store.ownPDF(doc.id)
            autoreleasepool {
                let ctx = context()
                ctx.insert(OwnDocumentRecord(id: doc.id, name: doc.name, added: doc.added, pdf: pdf))
                try? ctx.save()
            }
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
    /// read from its record alone and written off the main actor.
    func pull(into library: DocumentLibrary) async {
        guard on else { return }
        let records = ((try? context().fetch(Self.listed())) ?? []).map { OwnDocument(id: $0.id, name: $0.name, bytes: 0, added: $0.added) }
        for record in records {
            if let mine = library.own.first(where: { $0.id == record.id }) {
                if mine.name != record.name, !record.name.isEmpty { try? library.store.renameOwn(mine.id, to: record.name) }
                continue
            }
            guard let pdf = pdf(of: record.id) else { continue }
            await library.store.adoptOwn(record, pdf: pdf)
        }
        library.reloadDevice()
    }

    /// One record's PDF, read in a context that goes once it is read.
    private func pdf(of id: String) -> Data? {
        autoreleasepool {
            (try? context().fetch(FetchDescriptor<OwnDocumentRecord>(predicate: #Predicate { $0.id == id })))?.first?.pdf
        }
    }
}
