import Observation
import PDFKit
import SwiftUI
import Synchronization

/// A PDF as the reader holds it: PDFKit's document, its pages drawn white
/// on black for the night when `inverted` (InvertiblePage), as ForeFlight's
/// Invert Colors and the web's reader turn a page. Nonisolated, as
/// PDFKit is: it draws the pages on its own threads, so `inverted`, set
/// from the reader's controls, is an Atomic each draw reads.
final nonisolated class ReaderDocument: PDFDocument, PDFDocumentDelegate {
    private let invertedFlag = Atomic(false)
    var inverted: Bool {
        get { invertedFlag.load(ordering: .relaxed) }
        set { invertedFlag.store(newValue, ordering: .relaxed) }
    }

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
final nonisolated class InvertiblePage: PDFPage {
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
    /// The words of the find under way, and its number: a match is taken
    /// only where it was told during this find and is these words, so a
    /// match a cancelled find had already queued is never highlighted.
    @ObservationIgnored private var words = ""
    private let generation = Atomic<Int>(0)
    /// The matches PDFKit has told and the main actor not yet taken, with
    /// the find's number then: taken a batch at a time (`flush`), so a
    /// common word's thousands of matches are a few hops and a few
    /// updates of `matches`, not one of each per match.
    private let told = Mutex<[Told]>([])
    private let flushQueued = Atomic(false)
    /// A cite's words still to look for (`go(at:)`), in turn: while there
    /// are some, the find under way is the cite's, and its first match is
    /// gone to and the find stopped.
    @ObservationIgnored private var citeWords: [String] = []
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
        forgetObservers()
        observers = [Notification.Name.PDFViewPageChanged, .PDFViewChangedHistory].map { name in
            NotificationCenter.default.addObserver(forName: name, object: view, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.changed() }
            }
        }
        changed()
    }

    private func forgetObservers() {
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
        observers = []
    }

    // Block observers stay with NotificationCenter until removed.
    isolated deinit { forgetObservers() }

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
    /// number anywhere. Looked for with PDFKit's find, which runs off the
    /// main thread, as the AIM's 900 pages take seconds to search whole.
    func go(at: String) {
        if let i = ReaderFinding.row(for: at, in: outline.map(\.title)) {
            go(outline[i])
            return
        }
        seek([ReaderFinding.headingWords(at), at])
    }

    /// The first of `words` the document holds, looked for in turn.
    private func seek(_ words: [String]) {
        guard let doc = document, let first = words.first else { return }
        restart(doc)
        citeWords = words
        self.words = first
        finding = true
        doc.beginFindString(first, withOptions: [.caseInsensitive])
    }

    /// Any find under way stopped and its matches put away: anything it
    /// still tells carries a number that is not the next find's.
    private func restart(_ doc: ReaderDocument) {
        generation.add(1, ordering: .sequentiallyConsistent)
        if doc.isFinding { doc.cancelFindString() }
        generation.add(1, ordering: .sequentiallyConsistent)
        citeWords = []
        finding = false
        matches = []
        current = nil
        view?.highlightedSelections = nil
    }

    func back() { if view?.canGoBack == true { view?.goBack(nil) } }
    func forward() { if view?.canGoForward == true { view?.goForward(nil) } }

    // MARK: Search

    /// Every place the words are found, PDFKit's own find run as it goes
    /// (beginFindString), the first shown as it comes.
    func find(_ query: String) {
        guard let doc = document else { return }
        restart(doc)
        let words = query.trimmingCharacters(in: .whitespaces)
        self.words = words
        guard words.count >= 2 else { return }
        finding = true
        doc.beginFindString(words, withOptions: [.caseInsensitive])
    }

    // PDFKit's find may tell its matches off the main thread: each kept,
    // in the order told, with the find's number then, and one hop to the
    // main actor queued for all those told before it runs.
    nonisolated func didMatchString(_ instance: PDFSelection) {
        let number = generation.load(ordering: .sequentiallyConsistent)
        told.withLock { $0.append(Told(match: instance, generation: number)) }
        guard flushQueued.compareExchange(expected: false, desired: true, ordering: .sequentiallyConsistent).exchanged else { return }
        Task { @MainActor [weak self] in self?.flush() }
    }

    nonisolated func documentDidEndDocumentFind(_ notification: Notification) {
        let number = generation.load(ordering: .sequentiallyConsistent)
        Task { @MainActor [weak self] in
            self?.flush()
            self?.ended(number)
        }
    }

    /// The matches told so far taken in: those of this find, and of its words.
    private func flush() {
        flushQueued.store(false, ordering: .sequentiallyConsistent)
        let batch = told.withLock { pending in
            defer { pending = [] }
            return pending
        }
        let now = generation.load(ordering: .sequentiallyConsistent)
        guard finding else { return }
        let fresh = batch.filter { $0.generation == now && Self.same($0.match.string, words) }.map(\.match)
        guard !fresh.isEmpty else { return }
        if !citeWords.isEmpty, let hit = fresh.first {
            // A cite's first place: gone to, and the find stopped there.
            if let doc = document { restart(doc) }
            view?.go(to: hit)
            view?.setCurrentSelection(hit, animate: true)
            return
        }
        for match in fresh { match.color = .systemYellow }
        matches += fresh
        if current == nil { show(0) }
    }

    /// Whether a match's text is the words looked for, case and the
    /// spacing (a line break inside a match) aside.
    nonisolated static func same(_ text: String?, _ words: String) -> Bool {
        let squeeze = { (s: String) in s.split(whereSeparator: \.isWhitespace).joined(separator: " ") }
        return text.map { squeeze($0).caseInsensitiveCompare(squeeze(words)) == .orderedSame } ?? false
    }

    private func ended(_ number: Int) {
        guard number == generation.load(ordering: .sequentiallyConsistent) else { return }
        if !citeWords.isEmpty {
            // Not found as a heading: the cite's next words looked for,
            // and with none left the reader stays where it is.
            let rest = Array(citeWords.dropFirst())
            citeWords = []
            finding = false
            seek(rest)
            return
        }
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

/// A match PDFKit told, with the number of the find it was told in.
/// PDFKit makes the selection for the call and keeps no hold on it, and
/// the reader touches it only on the main actor once taken (`flush`), so
/// it crosses from PDFKit's find thread whole.
private nonisolated struct Told: @unchecked Sendable {
    let match: PDFSelection
    let generation: Int
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
