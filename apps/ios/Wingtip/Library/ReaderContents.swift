import PDFKit
import SwiftUI

/// The reader's Contents, in the inspector beside the page on an iPad and
/// a sheet on an iPhone: the document's outline, the pilot's bookmarks
/// (renamed in place, swiped away) and its pages as PDFKit's own
/// thumbnails, one segmented control between them, as ForeFlight's one
/// panel and the web's ReaderContents have them. A row tapped goes there,
/// and on an iPhone the sheet goes with it.
struct ReaderContents: View {
    let model: ReaderModel
    let done: () -> Void
    @Environment(\.horizontalSizeClass) private var width
    @State private var shown = Part.contents
    @State private var renaming: Bookmark?
    @State private var name = ""

    enum Part: String, CaseIterable, Identifiable {
        case contents = "Contents", bookmarks = "Bookmarks", pages = "Pages"
        var id: String { rawValue }
        var title: LocalizedStringKey { LocalizedStringKey(rawValue) }
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("Show", selection: $shown) {
                ForEach(Part.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(WingtipSpace.md)
            switch shown {
            case .contents: outline
            case .bookmarks: bookmarks
            case .pages:
                if let doc = model.pdf.document, let view = model.pdf.view {
                    Thumbnails(view: view, document: doc)
                }
            }
        }
        .alert("Rename Bookmark", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Name", text: $name)
            Button("Rename") { if let mark = renaming { model.renameBookmark(mark, to: name) } }
            Button("Cancel", role: .cancel) {}
        }
        // A container of its own, so its rows keep their own identifiers
        // ("reader-bookmarks"): set on the stack alone, the panel's was
        // given to every element in it, and the bookmarks list went
        // unfound (DocumentsIPadTests:45).
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("reader-contents-panel")
    }

    /// Gone to, and the sheet put away where it covers the page.
    private func went() {
        if width == .compact { done() }
    }

    @ViewBuilder private var outline: some View {
        if model.pdf.outline.isEmpty {
            ContentUnavailableView("No Contents", systemImage: "list.bullet", description: Text("This document has no table of contents."))
        } else {
            List(model.pdf.outline) { row in
                Button {
                    model.pdf.go(row)
                    went()
                } label: {
                    Text(row.title).padding(.leading, CGFloat(row.depth) * WingtipSpace.lg)
                }
                .foregroundStyle(.primary)
            }
            .listStyle(.plain)
        }
    }

    @ViewBuilder private var bookmarks: some View {
        if model.bookmarks.isEmpty {
            ContentUnavailableView("No Bookmarks", systemImage: "bookmark", description: Text("Bookmark This Page puts the page here."))
        } else {
            List {
                ForEach(model.bookmarks, id: \.page) { mark in
                    Button {
                        model.pdf.go(page: mark.page)
                        went()
                    } label: {
                        LabeledContent(mark.label, value: String(localized: "Page \(mark.page)"))
                    }
                    .foregroundStyle(.primary)
                    .contextMenu {
                        Button("Rename", systemImage: "pencil") {
                            name = mark.label
                            renaming = mark
                        }
                    }
                    .swipeActions {
                        Button("Remove", systemImage: "bookmark.slash", role: .destructive) {
                            model.places.toggleBookmark(model.place.doc, page: mark.page, label: mark.label)
                        }
                    }
                }
            }
            .listStyle(.plain)
            .accessibilityIdentifier("reader-bookmarks")
        }
    }
}

/// PDFKit's own thumbnails of the pages, a tap going to the page (its
/// PDFThumbnailView, tied to the reader's PDFView).
private struct Thumbnails: UIViewRepresentable {
    let view: PDFView
    let document: PDFDocument

    func makeUIView(context: Context) -> PDFThumbnailView {
        let thumbnails = PDFThumbnailView()
        thumbnails.layoutMode = .vertical
        thumbnails.thumbnailSize = CGSize(width: 120, height: 160)
        thumbnails.backgroundColor = .clear
        thumbnails.pdfView = view
        return thumbnails
    }

    func updateUIView(_ thumbnails: PDFThumbnailView, context: Context) {
        if thumbnails.pdfView !== view { thumbnails.pdfView = view }
    }
}
