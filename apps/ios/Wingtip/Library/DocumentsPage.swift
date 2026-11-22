import SwiftUI
import UniformTypeIdentifiers

/// The documents library, a page of You (ForeFlight's Documents, the
/// web's DocumentsPage, decision 0056): the pilot's own PDFs first -- the
/// POH, checklists, the insurance, the club's rules -- added from Files,
/// the share sheet or a drop, on this device and in their own iCloud only
/// if they turn it on; then the FAA's shelf by its groups, each with its
/// edition and date and Keep for the Air at the row's end. A row opens the
/// reader; on an iPad its context menu opens it in a window of its own.
struct DocumentsPage: View {
    @Environment(Navigator.self) private var nav
    @Environment(\.undoManager) private var undo
    @Environment(DocumentLibrary.self) private var library
    private var cloud: DocumentCloud { library.cloud }
    @State private var adding = false
    @State private var renaming: OwnDocument?
    @State private var name = ""
    @State private var turningOff = false

    var body: some View {
        List {
            Section {
                ProblemLine(library.problem)
                ForEach(library.own) { doc in
                    OwnRow(doc: doc, open: { nav.reading = .own(doc.id) },
                           rename: { name = doc.name; renaming = doc },
                           delete: { library.remove(doc.id, undo: undo) })
                }
                Button("Add a PDF", systemImage: "doc.badge.plus") { adding = true }
                    .accessibilityIdentifier("documents-add")
            } header: {
                Text("Your Documents")
            } footer: {
                Text(cloud.on ? "On this device and in your iCloud." : "On this device only. Wingtip never sends them anywhere.")
            }
            Section {
                Toggle("Keep in iCloud", isOn: Binding(get: { cloud.on }, set: { on in
                    if on { cloud.set(true, library: library) } else { turningOff = true }
                }))
                .accessibilityIdentifier("documents-icloud")
            } footer: {
                Text("Your documents in your own iCloud, on your other devices. Markup and bookmarks stay on each device.")
            }
            shelf
        }
        .listStyle(.insetGrouped)
        .navigationTitle(Screen.documents.title)
        .toolbar { UndoToolbarItem() }
        .refreshable { await library.refreshShelf(force: true) }
        .task {
            #if DEBUG
            SampleDocument.addIfAsked(to: library)
            #endif
            library.reloadDevice()
            cloud.pull(into: library)
            await library.refreshShelf()
        }
        .fileImporter(isPresented: $adding, allowedContentTypes: [.pdf], allowsMultipleSelection: true) { result in
            if case .success(let urls) = result { library.add(urls) }
        }
        // A PDF dragged in from Files, Mail or Safari beside the app.
        .onDrop(of: [.pdf], isTargeted: nil) { providers in
            for provider in providers {
                _ = provider.loadFileRepresentation(forTypeIdentifier: UTType.pdf.identifier) { url, _ in
                    // The system's copy lasts only while this runs.
                    let copy = url.flatMap(WindowFiles.copy)
                    Task { @MainActor in if let copy { library.add([copy]) } }
                }
            }
            return !providers.isEmpty
        }
        .alert("Rename Document", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Name", text: $name)
            Button("Rename") { if let doc = renaming { library.rename(doc.id, to: name) } }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog("Stop keeping your documents in iCloud?", isPresented: $turningOff, titleVisibility: .visible) {
            Button("Delete from iCloud", role: .destructive) { cloud.set(false, library: library) }
        } message: {
            Text("They stay on this device. Their copies in your iCloud are deleted.")
        }
        .accessibilityIdentifier("documents-page")
    }

    @ViewBuilder private var shelf: some View {
        if library.grouped.isEmpty {
            Section {
                if library.shelfLoading {
                    ProgressView("Fetching the library…")
                } else if library.shelfFailed {
                    ContentUnavailableView("Library Not Reached", systemImage: "books.vertical",
                                           description: Text("The FAA's documents can't be listed now. Those you keep for the air are listed here with no signal."))
                }
            }
        }
        ForEach(library.grouped, id: \.group) { group in
            Section(LocalizedStringKey(group.group)) {
                ForEach(group.documents, id: \.id) { entry in
                    ShelfRow(entry: entry, library: library) { nav.reading = DocPlace(doc: entry.id) }
                }
            }
        }
    }
}

/// One of the pilot's own: its name and size, a tap to read, Rename and
/// Delete in its context menu and Delete in its swipe.
private struct OwnRow: View {
    let doc: OwnDocument
    let open: () -> Void
    let rename: () -> Void
    let delete: () -> Void

    var body: some View {
        Button(action: open) {
            LabeledContent {
                Text(Int64(doc.bytes).formatted(.byteCount(style: .file)))
            } label: {
                Label(doc.name, systemImage: "doc.richtext")
            }
        }
        .foregroundStyle(.primary)
        .accessibilityIdentifier("own-document")
        .contextMenu {
            OpenDocumentWindowItem(place: .own(doc.id))
            Button("Rename", systemImage: "pencil", action: rename)
            Button("Delete", systemImage: "trash", role: .destructive, action: delete)
        }
        .swipeActions {
            Button("Delete", systemImage: "trash", role: .destructive, action: delete)
        }
    }
}

/// A document of the FAA's shelf: its title, its edition and date under
/// it, and Keep for the Air at the row's end (its size in its name; kept,
/// a tinted check that takes it off; fetching, how far).
private struct ShelfRow: View {
    let entry: LibraryEntry
    let library: DocumentLibrary
    let open: () -> Void

    var body: some View {
        HStack {
            Button(action: open) {
                VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                    Text(entry.title)
                    if let edition = entry.editionLine { Text(edition).font(.footnote).foregroundStyle(.secondary) }
                    if library.failed.contains(entry.id) {
                        Text("Couldn't keep it. Try again with a signal.").font(.footnote).foregroundStyle(.red)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .foregroundStyle(.primary)
            .disabled(entry.edition == nil && !library.isKept(entry.id))
            keepButton
        }
        .contextMenu { OpenDocumentWindowItem(place: DocPlace(doc: entry.id)) }
        .accessibilityIdentifier("shelf-\(entry.id)")
    }

    @ViewBuilder private var keepButton: some View {
        if let share = library.keeping[entry.id] {
            ProgressView(value: share).progressViewStyle(.circular)
                .accessibilityLabel("Keeping \(entry.title) for the Air")
        } else if library.isKept(entry.id) {
            Button("Kept for the Air. Remove", systemImage: "checkmark.circle.fill") { library.forget(entry) }
                .labelStyle(.iconOnly)
                .accessibilityIdentifier("kept-\(entry.id)")
        } else if entry.edition != nil {
            let size = entry.bytes.map { Int64($0).formatted(.byteCount(style: .file)) }
            Button(size.map { "Keep for the Air, \($0)" } ?? "Keep for the Air", systemImage: "arrow.down.circle") {
                Task { await library.keep(entry) }
            }
            .labelStyle(.iconOnly)
            .accessibilityIdentifier("keep-\(entry.id)")
        }
    }
}
