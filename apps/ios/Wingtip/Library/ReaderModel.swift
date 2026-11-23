import Foundation
import Observation

/// The reader's view model (ReaderView), the web's useReader: which
/// document, where its pages come from, where it opens, its bookmarks, the
/// night's inversion, its markup and the link Share sends.
@MainActor
@Observable
final class ReaderModel {
    enum State {
        /// Fetching: the bytes come so far.
        case loading(Int)
        case pdf
        case text(CfrText)
        /// Why it can't be shown, in the reader's own words.
        case failed(String)
    }

    let place: DocPlace
    @ObservationIgnored let library: DocumentLibrary
    @ObservationIgnored let places: ReaderPlaces
    let pdf = PDFReaderController()
    private(set) var state: State = .loading(0)
    private(set) var markup: DocumentMarkup?
    /// The text part's section shown first (a cite's), or none.
    private(set) var textStart: String?

    init(place: DocPlace, library: DocumentLibrary) {
        self.place = place
        self.library = library
        places = library.places
    }

    var title: String {
        if let id = place.ownID { return library.name(id) ?? String(localized: "Document") }
        return library.entry(place.doc)?.title ?? place.doc
    }

    /// The edition as a pilot reads it, and its date: "FAA-H-8083-25C ·
    /// 3 Nov 2026". None for the pilot's own.
    var editionLine: String? {
        place.isOwn ? nil : library.entry(place.doc)?.editionLine
    }

    /// White on black: the pilot's own choice, else the dark appearance.
    func inverted(dark: Bool) -> Bool { places.inverted ?? dark }

    func setInverted(_ on: Bool) {
        places.setInverted(on)
        pdf.invert(on)
    }

    /// The document had and opened where it should: a shared or
    /// bookmarked page, a cite's paragraph, else where it was left.
    func load(dark: Bool) async {
        state = .loading(0)
        do {
            let (source, edition) = try await library.source(for: place) { [weak self] bytes in self?.state = .loading(bytes) }
            switch source {
            case .text(let text):
                textStart = ReaderFinding.section(text, at: place.at)
                state = .text(text)
            case .pdf(let url):
                guard pdf.load(url, inverted: inverted(dark: dark)) else {
                    state = .failed(String(localized: "This PDF can't be opened. It may be damaged."))
                    return
                }
                markup = DocumentMarkup(doc: place.doc, edition: edition)
                let doc = place.doc
                pdf.onPage = { [places] page in places.leftAt(doc, page: page) }
                state = .pdf
            }
        } catch {
            state = .failed(place.isOwn
                ? String(localized: "This document is no longer on this device.")
                : String(localized: "This document can't be had now. Keep it for the Air to read it with no signal."))
        }
    }

    /// Once PDFKit's view is up: the place the reader opens at.
    func opened() {
        if let page = place.page {
            pdf.go(page: page)
        } else if let at = place.at {
            pdf.go(at: at)
        } else if let left = places.page(place.doc) {
            pdf.go(page: left)
        }
    }

    var bookmarks: [Bookmark] { places.bookmarks(place.doc) }

    var bookmarked: Bool { places.isBookmarked(place.doc, page: pdf.page) }

    /// A bookmark on the page in view, named for its outline's heading
    /// where it has one, else its number; or the one there taken off.
    func toggleBookmark() {
        let page = pdf.page
        let label = pdf.outline.last { row in
            guard let dest = row.item?.destination?.page, let doc = pdf.document else { return false }
            return doc.index(for: dest) + 1 <= page
        }?.title ?? String(localized: "Page \(page)")
        places.toggleBookmark(place.doc, page: page, label: label)
    }

    func renameBookmark(_ mark: Bookmark, to label: String) {
        places.renameBookmark(place.doc, page: mark.page, to: label)
    }

    /// The page in view as a link any device opens (the web's address,
    /// a universal link on the phones); none for the pilot's own.
    var shareLink: URL? {
        guard case .pdf = state else { return place.link() }
        return DocPlace(doc: place.doc, page: pdf.page).link()
    }
}
