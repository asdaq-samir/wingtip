import Foundation
import PlannerAPI

/// A document of the planner's shelf (/api/library, wingtip.library), by
/// the name the engine's citations give it, with the edition it keeps.
typealias LibraryEntry = APILibraryDocument
/// A CFR part's text in one edition: its subparts, sections, paragraphs.
typealias CfrText = APICfrText

extension Planner {
    /// The library's shelf in its order: the FAA's books, the AIM, the
    /// circulars and the CFR parts, each with its edition and date.
    static func library() async throws -> [LibraryEntry] {
        try await call(.read) { try await $0.libraryShelf().ok.body.json.documents }
    }

    /// A CFR part's text in the edition kept (the eCFR's issue date).
    static func libraryText(doc: String, edition: String) async throws -> CfrText {
        try await call(.read) { try await $0.libraryText(path: .init(doc: doc, edition: edition)).ok.body.json }
    }

    /// A document's PDF in its edition, written to `file` as it comes, a
    /// handbook being tens of megabytes; `progress` told the bytes so far.
    /// The file is whole or not there: written beside it, then moved.
    static func libraryPdf(doc: String, edition: String, to file: URL, progress: @escaping @MainActor (Int) -> Void) async throws {
        let partial = file.appendingPathExtension("part")
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: partial.path(), contents: nil)
        defer { try? FileManager.default.removeItem(at: partial) }
        let handle = try FileHandle(forWritingTo: partial)
        var written = 0
        do {
            let body = try await call { try await $0.libraryPdf(path: .init(doc: doc, edition: edition)).ok.body.pdf }
            for try await chunk in body {
                try handle.write(contentsOf: chunk)
                written += chunk.count
                let sofar = written
                await progress(sofar)
            }
            try handle.close()
        } catch {
            try? handle.close()
            throw error
        }
        // A PDF starts "%PDF": a page the gateway or a portal answered in
        // its place is no document to keep.
        let head = try FileHandle(forReadingFrom: partial)
        let magic = try head.read(upToCount: 4)
        try head.close()
        guard magic == Data("%PDF".utf8) else { throw Failure(status: 200, detail: String(localized: "The library sent something that isn't a PDF.")) }
        try? FileManager.default.removeItem(at: file)
        try FileManager.default.moveItem(at: partial, to: file)
    }
}
