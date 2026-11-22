import Observation
import PDFKit
import SwiftUI

/// A PDF as the reader holds it: PDFKit's document, its pages drawn white
/// on black for the night when `inverted` (InvertiblePage), as ForeFlight's
/// Invert Colors and the web's reader turn a page.
final class ReaderDocument: PDFDocument, PDFDocumentDelegate {
    var inverted = false

    override init?(url: URL) {
        super.init(url: url)
        delegate = self
    }

    func classForPage() -> AnyClass { InvertiblePage.self }
}

/// A page drawn as PDFKit draws it, then, on an inverted document, every
/// colour turned over by a white fill in the difference blend: white
/// paper black, black type white, a chart's colours their opposites. The
/// way Apple's PDFKit sample draws over a page (draw(with:to:)).
final class InvertiblePage: PDFPage {
    override func draw(with box: PDFDisplayBox, to context: CGContext) {
        super.draw(with: box, to: context)
        guard (document as? ReaderDocument)?.inverted == true else { return }
        context.saveGState()
        context.setBlendMode(.difference)
        context.setFillColor(UIColor.white.cgColor)
        context.fill(bounds(for: box))
        context.restoreGState()
    }
}

/// The reader's hold on PDFKit's view (PDFReaderView): where it is, how
/// many pages, the search's matches, the outline, and the verbs the
/// reader's bar, the contents and the menu bar's keys ask of it.
@MainActor
@Observable
final class PDFReaderController: NSObject, PDFDocumentDelegate {
    @ObservationIgnored weak var view: PDFView?
    @ObservationIgnored private(set) var document: ReaderDocument?
    /// The page in view, from 1, and of how many.
    private(set) var page = 1
    private(set) var pages = 0
    private(set) var outline: [ReaderFinding.OutlineRow] = []
    private(set) var matches: [PDFSelection] = []
    private(set) var current: Int?
    private(set) var finding = false
    private(set) var canGoBack = false
    private(set) var canGoForward = false
    /// Told each page turned (ReaderModel keeps the page left at).
    @ObservationIgnored var onPage: @MainActor (Int) -> Void = { _ in }
    @ObservationIgnored private var observers: [NSObjectProtocol] = []

    func load(_ url: URL, inverted: Bool) -> Bool {
        guard let doc = ReaderDocument(url: url) else { return false }
        doc.inverted = inverted
        // The reader hears the find's matches; the pages stay invertible.
        doc.delegate = self
        document = doc
        pages = doc.pageCount
        outline = ReaderFinding.rows(doc.outlineRoot)
        return true
    }

    /// The view made (PDFReaderView): the document shown, its page turns
    /// and its history watched.
    func attach(_ view: PDFView) {
        self.view = view
        view.document = document
        observers = [Notification.Name.PDFViewPageChanged, .PDFViewChangedHistory].map { name in
            NotificationCenter.default.addObserver(forName: name, object: view, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.changed() }
            }
        }
        changed()
    }

    private func changed() {
        guard let view, let doc = document, let shown = view.currentPage else { return }
        page = doc.index(for: shown) + 1
        canGoBack = view.canGoBack
        canGoForward = view.canGoForward
        onPage(page)
    }

    // MARK: Going places

    func go(page: Int) {
        guard let target = document?.page(at: max(0, min(pages - 1, page - 1))) else { return }
        view?.go(to: target)
    }

    func go(_ row: ReaderFinding.OutlineRow) {
        if let destination = row.item?.destination {
            view?.go(to: destination)
        } else if let action = row.item?.action as? PDFActionGoTo {
            view?.go(to: action.destination)
        }
    }

    /// A cite's paragraph or section: its row in the outline, else the
    /// first place its number is set as a heading ("7-1-5."), else its
    /// number anywhere.
    func go(at: String) {
        if let i = ReaderFinding.row(for: at, in: outline.map(\.title)) {
            go(outline[i])
            return
        }
        guard let doc = document else { return }
        for words in [ReaderFinding.headingWords(at), at] {
            if let hit = doc.findString(words, withOptions: [.caseInsensitive]).first {
                view?.go(to: hit)
                view?.setCurrentSelection(hit, animate: true)
                return
            }
        }
    }

    func back() { if view?.canGoBack == true { view?.goBack(nil) } }
    func forward() { if view?.canGoForward == true { view?.goForward(nil) } }

    // MARK: Search

    /// Every place the words are found, PDFKit's own find run as it goes
    /// (beginFindString), the first shown as it comes.
    func find(_ query: String) {
        guard let doc = document else { return }
        if doc.isFinding { doc.cancelFindString() }
        matches = []
        current = nil
        view?.highlightedSelections = nil
        let words = query.trimmingCharacters(in: .whitespaces)
        guard words.count >= 2 else { return }
        finding = true
        doc.beginFindString(words, withOptions: [.caseInsensitive])
    }

    // PDFKit's find may tell its matches off the main thread: each taken
    // to the main actor, in the order told.
    nonisolated func didMatchString(_ instance: PDFSelection) {
        nonisolated(unsafe) let match = instance
        Task { @MainActor [weak self] in self?.found(match) }
    }

    nonisolated func documentDidEndDocumentFind(_ notification: Notification) {
        Task { @MainActor [weak self] in self?.ended() }
    }

    private func found(_ match: PDFSelection) {
        guard finding else { return }
        match.color = .systemYellow
        matches.append(match)
        if current == nil { show(0) }
    }

    private func ended() {
        finding = false
        view?.highlightedSelections = matches.isEmpty ? nil : matches
    }

    /// The pages' class, for the night's inversion (InvertiblePage).
    nonisolated func classForPage() -> AnyClass { InvertiblePage.self }

    func step(_ by: Int) {
        guard !matches.isEmpty else { return }
        show(((current ?? -by) + by + matches.count) % matches.count)
    }

    private func show(_ i: Int) {
        current = i
        let match = matches[i]
        view?.setCurrentSelection(match, animate: true)
        view?.go(to: match)
    }

    // MARK: The night

    /// Pages white on black, or back: drawn again from where the pilot is.
    func invert(_ on: Bool) {
        guard let doc = document, doc.inverted != on, let view else { return }
        doc.inverted = on
        let at = view.currentDestination
        view.document = nil
        view.document = doc
        if let at { view.go(to: at) }
        view.backgroundColor = on ? .black : .secondarySystemBackground
    }
}

/// PDFKit's own view of the document (UIViewRepresentable): one column
/// of pages scrolled continuously, scaled to the width and zoomed with a
/// pinch or a trackpad as Books and Files show a PDF, its links followed,
/// and its pages' markup over them (DocumentMarkup).
struct PDFReaderView: UIViewRepresentable {
    let controller: PDFReaderController
    let markup: DocumentMarkup

    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.autoScales = true
        view.pageShadowsEnabled = true
        view.backgroundColor = controller.document?.inverted == true ? .black : .secondarySystemBackground
        view.pageOverlayViewProvider = markup
        view.accessibilityIdentifier = "reader-pdf"
        controller.attach(view)
        markup.view = view
        return view
    }

    func updateUIView(_ view: PDFView, context: Context) {
        // Markup on: PDFKit's own gestures give way to the pencil.
        view.isInMarkupMode = markup.on
    }
}
