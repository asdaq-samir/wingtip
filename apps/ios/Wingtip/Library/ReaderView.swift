import SwiftUI

/// The documents library's reader, ForeFlight's and the web's one viewer:
/// the document full screen under its title and edition, PDFKit's own view
/// for a PDF (PDFReaderView) and a CFR part as text in the app's type
/// (CfrTextReader). In its bar: Back and Forward through the places the
/// pilot has jumped (a link, a contents row, a search's match: ⌘[ and ⌘]),
/// Contents (the outline, the bookmarks and the pages, in the inspector
/// beside the page on an iPad and a sheet on an iPhone, the system's own
/// adapting), Bookmark This Page, Markup with Apple Pencil, and a menu of
/// Invert Colors, Share This Page and Open in New Window. Its search (⌘F)
/// is the bar's, every match lit with the next and the last at the foot.
struct ReaderView: View {
    @State private var model: ReaderModel
    let inWindow: Bool
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dismissWindow) private var dismissWindow
    @Environment(\.openWindow) private var openWindow
    @Environment(\.supportsMultipleWindows) private var windows
    @Environment(\.colorScheme) private var scheme
    @State private var contents = false
    @State private var query = ""
    @State private var searching = false
    /// Whether this reader's window is the key one (the system's Find):
    /// of two windows side by side, both are active, one is key.
    @State private var window = KeyWindow()

    init(place: DocPlace, library: DocumentLibrary, inWindow: Bool = false) {
        _model = State(initialValue: ReaderModel(place: place, library: library))
        self.inWindow = inWindow
    }

    var body: some View {
        NavigationStack {
            page
                .navigationTitle(model.title)
                .navigationSubtitle(model.editionLine ?? "")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { bar }
                .searchable(text: $query, isPresented: $searching, placement: .toolbar, prompt: Text("Search This Document"))
                .onSubmit(of: .search) { find() }
                .task(id: query) {
                    // As the pilot types, after a breath.
                    try? await Task.sleep(for: .milliseconds(350))
                    if !Task.isCancelled { find() }
                }
                .inspector(isPresented: $contents) {
                    ReaderContents(model: model) { contents = false }
                        .inspectorColumnWidth(min: 280, ideal: 340, max: 420)
                }
                .safeAreaInset(edge: .bottom) { matchBar }
        }
        .task { await model.load(dark: scheme == .dark) }
        // The menu bar's Find, Back and Forward for this reader
        // (WingtipCommands), the keys a hardware keyboard sends.
        .focusedSceneValue(\.readerActions, ReaderActions(find: { searching = true }, back: { model.pdf.back() }, forward: { model.pdf.forward() }))
        // ⌘F, the system's Find, in this reader's window or over the map.
        .keyWindow(window)
        .onReceive(NotificationCenter.default.publisher(for: .systemFind)) { _ in if window.isKey { searching = true } }
        .onChange(of: scheme) { _, now in if model.places.inverted == nil { model.pdf.invert(now == .dark) } }
        .accessibilityIdentifier("reader")
    }

    private func find() {
        if case .pdf = model.state { model.pdf.find(query) }
    }

    private func close() {
        if inWindow { dismissWindow() } else { dismiss() }
    }

    @ViewBuilder private var page: some View {
        switch model.state {
        case .loading(let bytes):
            ProgressView {
                Text(bytes > 0 ? "Fetching \(Int64(bytes).formatted(.byteCount(style: .file)))…" : "Fetching…")
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let why):
            ContentUnavailableView(model.title, systemImage: "doc.questionmark", description: Text(why))
        case .text(let text):
            CfrTextReader(text: text, start: model.textStart, query: query)
        case .pdf:
            if let markup = model.markup {
                PDFReaderView(controller: model.pdf, markup: markup)
                    .ignoresSafeArea(edges: .bottom)
                    .onAppear { model.opened() }
            }
        }
    }

    @ToolbarContentBuilder private var bar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) { CloseButton(action: close) }
        if case .pdf = model.state {
            ToolbarItemGroup(placement: .topBarLeading) {
                Button("Back", systemImage: "chevron.backward") { model.pdf.back() }
                    .disabled(!model.pdf.canGoBack)
                    .accessibilityIdentifier("reader-back")
                Button("Forward", systemImage: "chevron.forward") { model.pdf.forward() }
                    .disabled(!model.pdf.canGoForward)
                    .accessibilityIdentifier("reader-forward")
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
                if let markup = model.markup {
                    Toggle(isOn: Binding(get: { markup.on }, set: { markup.on = $0 })) {
                        Label("Markup", systemImage: "pencil.tip.crop.circle")
                    }
                    .accessibilityIdentifier("reader-markup")
                }
                Button(model.bookmarked ? "Remove Bookmark" : "Bookmark This Page",
                       systemImage: model.bookmarked ? "bookmark.fill" : "bookmark") { model.toggleBookmark() }
                    .accessibilityIdentifier("reader-bookmark")
                Button("Contents", systemImage: "list.bullet") { contents.toggle() }
                    .accessibilityIdentifier("reader-contents")
            }
        }
        ToolbarItem(placement: .topBarTrailing) { more }
    }

    private var more: some View {
        Menu("More", systemImage: "ellipsis") {
            if case .pdf = model.state {
                Toggle(isOn: Binding(get: { model.inverted(dark: scheme == .dark) }, set: { model.setInverted($0) })) {
                    Label("Invert Colors", systemImage: "circle.lefthalf.filled.inverse")
                }
                if model.markup?.on == true {
                    Button("Clear Page's Markup", systemImage: "trash", role: .destructive) { model.markup?.clearPage() }
                }
            }
            if let link = model.shareLink {
                ShareLink(item: link, subject: Text(model.title)) {
                    Label("Share This Page", systemImage: "square.and.arrow.up")
                }
            }
            if windows, !inWindow {
                Button("Open in New Window", systemImage: "macwindow.badge.plus") {
                    openWindow(id: DocPlace.window, value: DocPlace(doc: model.place.doc, page: model.pdf.page))
                    close()
                }
                .accessibilityIdentifier("reader-new-window")
            }
        }
        .accessibilityIdentifier("reader-more")
    }

    /// The search's matches, one at a time, at the foot.
    @ViewBuilder private var matchBar: some View {
        if case .pdf = model.state, !query.isEmpty, searching || !model.pdf.matches.isEmpty {
            HStack {
                Button("Previous Match", systemImage: "chevron.up") { model.pdf.step(-1) }
                    .labelStyle(.iconOnly)
                    .keyboardShortcut("g", modifiers: [.command, .shift])
                Spacer()
                Group {
                    if model.pdf.matches.isEmpty {
                        Text(model.pdf.finding ? "Searching…" : "Not found")
                    } else {
                        Text("\((model.pdf.current ?? 0) + 1) of \(model.pdf.matches.count)\(model.pdf.finding ? "…" : "")")
                            .monospacedDigit()
                    }
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("reader-matches")
                Spacer()
                Button("Next Match", systemImage: "chevron.down") { model.pdf.step(1) }
                    .labelStyle(.iconOnly)
                    .keyboardShortcut("g", modifiers: .command)
            }
            .buttonStyle(.borderless)
            .padding(.horizontal, WingtipSpace.lg)
            .padding(.vertical, WingtipSpace.sm)
            .background(.bar)
        }
    }
}

/// What the menu bar's Find, Back and Forward do in the reader in front,
/// published as the scene's focused value (WingtipCommands).
struct ReaderActions {
    let find: () -> Void
    let back: () -> Void
    let forward: () -> Void
}

extension FocusedValues {
    @Entry var readerActions: ReaderActions?
}
