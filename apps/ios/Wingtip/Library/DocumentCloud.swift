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
@MainActor
@Observable
final class DocumentCloud {
    static let shared = DocumentCloud(defaults: .standard, context: { Records.container.mainContext })

    static let key = "documents.iCloud"

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let context: @MainActor () -> ModelContext
    private(set) var on: Bool

    init(defaults: UserDefaults, context: @escaping @MainActor () -> ModelContext) {
        self.defaults = defaults
        self.context = context
        on = defaults.bool(forKey: Self.key)
    }

    /// The switch turned: on, every document sent and every record taken;
    /// off, every record deleted.
    func set(_ on: Bool, library: DocumentLibrary) {
        self.on = on
        defaults.set(on, forKey: Self.key)
        if on {
            pushed(library.own, from: library.store)
            pull(into: library)
        } else {
            let ctx = context()
            for record in records(ctx) { ctx.delete(record) }
            try? ctx.save()
        }
    }

    private func records(_ ctx: ModelContext) -> [OwnDocumentRecord] {
        (try? ctx.fetch(FetchDescriptor<OwnDocumentRecord>())) ?? []
    }

    /// Documents added (or put back by an Undo) sent, where they have no
    /// record yet.
    func pushed(_ docs: [OwnDocument], from store: DeviceDocuments) {
        guard on, !docs.isEmpty else { return }
        let ctx = context()
        let have = Set(records(ctx).map(\.id))
        for doc in docs where !have.contains(doc.id) {
            ctx.insert(OwnDocumentRecord(id: doc.id, name: doc.name, added: doc.added, pdf: try? Data(contentsOf: store.ownFile(doc.id))))
        }
        try? ctx.save()
    }

    func renamed(_ doc: OwnDocument) {
        guard on else { return }
        let ctx = context()
        for record in records(ctx) where record.id == doc.id { record.name = doc.name }
        try? ctx.save()
    }

    func removed(_ id: String) {
        guard on else { return }
        let ctx = context()
        for record in records(ctx) where record.id == id { ctx.delete(record) }
        try? ctx.save()
    }

    /// The pilot's documents from their other devices written here, and a
    /// name changed there taken; run as the library opens.
    func pull(into library: DocumentLibrary) {
        guard on else { return }
        let ctx = context()
        for record in records(ctx) {
            if let mine = library.own.first(where: { $0.id == record.id }) {
                if mine.name != record.name, !record.name.isEmpty { try? library.store.renameOwn(mine.id, to: record.name) }
                continue
            }
            guard let pdf = record.pdf else { continue }
            let file = FileManager.default.temporaryDirectory.appending(path: "\(DeviceDocuments.safe(record.id)).pdf")
            guard (try? pdf.write(to: file, options: .atomic)) != nil else { continue }
            library.took(OwnDocument(id: record.id, name: record.name, bytes: pdf.count, added: record.added), pdf: file)
            try? FileManager.default.removeItem(at: file)
        }
        library.reloadDevice()
    }
}
