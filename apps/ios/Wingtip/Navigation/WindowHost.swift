import SwiftUI
import UniformTypeIdentifiers

/// A window's root, as the menu bar and the iPad's other inputs reach it:
/// the window's commands published for the menu bar (WingtipCommands),
/// File's Open Flight or Track, and drag and drop onto the window from
/// Files, Mail or another app beside it (HIG Drag and drop: "As much as
/// possible, support drag and drop throughout your app"). A Wingtip
/// flight, a GPX or a KML dropped or picked goes the way the same file
/// opened from Files does (Links.command): previewed, never planned
/// without the pilot's Use This Plan. Words dropped, an airport's
/// identifier or a route copied from elsewhere, go into the one search,
/// whose results the pilot picks from. The owner, 2026-11-21: "Yes do it
/// all for iPad".
struct WindowHost: ViewModifier {
    let search: OneSearchModel
    let open: (Screen) -> Void
    let page: (PlanPage) -> Void
    /// The root's run of a command (RootView.apply).
    let run: @MainActor (AppCommand) async -> Void
    @State private var importing = false
    @State private var problem: String?
    @Environment(Navigator.self) private var nav
    /// Whether this window is the key one, which the system's Find is for:
    /// of two windows side by side, both are active, one is key.
    @State private var window = KeyWindow()

    func body(content: Content) -> some View {
        content
            .keyWindow(window)
            .focusedSceneValue(\.windowActions, WindowActions(
                search: { search.presented = true }, open: open, page: page, openFile: { importing = true }))
            // ⌘F, Edit > Find (WingtipCommands): the one search, but while
            // the reader is up over the map, which finds in its document
            // (ReaderView).
            .onReceive(NotificationCenter.default.publisher(for: .systemFind)) { _ in
                if window.isKey, nav.reading == nil { search.presented = true }
            }
            .fileImporter(isPresented: $importing, allowedContentTypes: WindowFiles.types) { result in
                if case .success(let url) = result { take(WindowFiles.copy(url)) }
            }
            .onDrop(of: WindowFiles.types + [.plainText], isTargeted: nil) { providers in drop(providers) }
            .alert(problem ?? "", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } })) {
                Button("OK", role: .cancel) {}
            }
    }

    /// A file taken in: its command run, or why it could not be.
    private func take(_ url: URL?) {
        guard let url, let command = Links.command(for: url) else {
            problem = WindowFiles.unreadable
            return
        }
        Task { await run(command) }
    }

    private func drop(_ providers: [NSItemProvider]) -> Bool {
        guard let provider = providers.first else { return false }
        if let type = WindowFiles.types.first(where: { provider.hasItemConformingToTypeIdentifier($0.identifier) }) {
            // The system's copy lasts only while this runs: copied first.
            _ = provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, _ in
                let copy = url.flatMap(WindowFiles.copy)
                Task { @MainActor in take(copy) }
            }
            return true
        }
        guard provider.canLoadObject(ofClass: String.self) else { return false }
        _ = provider.loadObject(ofClass: String.self) { text, _ in
            guard let words = text.flatMap(WindowFiles.searchWords) else { return }
            Task { @MainActor in
                search.text = words
                search.presented = true
            }
        }
        return true
    }
}

/// The files a window takes, and how.
enum WindowFiles {
    /// A Wingtip flight (FlightFile), a PDF for the pilot's own documents
    /// (DocumentLibrary), and the tracks the app reads
    /// (Links.trackExtensions), as project.yml declares them.
    static let types: [UTType] = [.wingtipFlight, .pdf] + Links.trackExtensions.sorted().compactMap { UTType(filenameExtension: $0) }

    static let unreadable = String(localized: "That file isn't a Wingtip flight, a PDF or a GPX or KML track.")

    /// A file handed over copied where the app may read it after the
    /// handing is done (a drop's file lasts only while its handler runs; a
    /// picked file only inside its security scope), its name kept, as the
    /// file's kind is read by its extension (Links.command).
    nonisolated static func copy(_ url: URL) -> URL? {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let folder = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString, directoryHint: .isDirectory)
        let copy = folder.appending(path: url.lastPathComponent)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try FileManager.default.copyItem(at: url, to: copy)
            return copy
        } catch {
            return nil
        }
    }

    /// Dropped words as the one search takes them: on one line, trimmed,
    /// and none for an empty drop or a page of text no search is for.
    nonisolated static func searchWords(_ text: String) -> String? {
        let words = text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        return words.isEmpty || words.count > 200 ? nil : words
    }
}
