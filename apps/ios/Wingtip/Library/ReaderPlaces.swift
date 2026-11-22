import Foundation
import Observation

/// A page the pilot marked, named as they named it.
struct Bookmark: Codable, Hashable, Sendable {
    /// From 1, as the page's number is said.
    var page: Int
    var label: String
}

/// Where the pilot was in each document, their bookmarks and the night's
/// inverted pages, kept on this device as the web's readerPlaces keeps
/// them (ForeFlight's last page, bookmarks with names and Invert Colors):
/// one small JSON file in Application Support, by the document's name (a
/// library document's id or "own:<id>").
@MainActor
@Observable
final class ReaderPlaces {
    static let shared = ReaderPlaces(file: DeviceDocuments.device.root.appending(path: "places.json"))

    /// The most a document's bookmarks hold: a pilot's tabs, not an index.
    static let mostBookmarks = 50

    struct Kept: Codable, Equatable {
        var pages: [String: Int] = [:]
        var bookmarks: [String: [Bookmark]] = [:]
        /// White on black for the night; nil follows the dark appearance.
        var inverted: Bool?
    }

    private(set) var kept: Kept
    @ObservationIgnored private let file: URL

    init(file: URL) {
        self.file = file
        kept = (try? Data(contentsOf: file)).flatMap { try? JSONDecoder().decode(Kept.self, from: $0) } ?? Kept()
    }

    func page(_ doc: String) -> Int? { kept.pages[doc] }
    func bookmarks(_ doc: String) -> [Bookmark] { kept.bookmarks[doc] ?? [] }
    var inverted: Bool? { kept.inverted }

    func leftAt(_ doc: String, page: Int) {
        guard kept.pages[doc] != page else { return }
        kept.pages[doc] = page
        save()
    }

    func isBookmarked(_ doc: String, page: Int) -> Bool {
        bookmarks(doc).contains { $0.page == page }
    }

    /// A bookmark on the page, or the one there taken off.
    func toggleBookmark(_ doc: String, page: Int, label: String) {
        var marks = bookmarks(doc)
        if marks.contains(where: { $0.page == page }) {
            marks.removeAll { $0.page == page }
        } else {
            marks.append(Bookmark(page: page, label: label))
            marks.sort { $0.page < $1.page }
            marks = Array(marks.prefix(Self.mostBookmarks))
        }
        kept.bookmarks[doc] = marks
        save()
    }

    /// Renamed; a name of nothing but spaces leaves it as it was.
    func renameBookmark(_ doc: String, page: Int, to label: String) {
        let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        kept.bookmarks[doc] = bookmarks(doc).map { $0.page == page ? Bookmark(page: page, label: trimmed) : $0 }
        save()
    }

    func setInverted(_ on: Bool) {
        kept.inverted = on
        save()
    }

    /// A document's places forgotten with it (a pilot's own deleted).
    func forget(_ doc: String) {
        kept.pages[doc] = nil
        kept.bookmarks[doc] = nil
        save()
    }

    private func save() {
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? JSONEncoder().encode(kept).write(to: file, options: .atomic)
    }
}
