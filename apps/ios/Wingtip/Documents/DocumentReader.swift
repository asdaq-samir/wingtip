import Observation
import OpenAPIRuntime
import SwiftUI
import UIKit

/// What a photographed page is of.
enum DocumentKind: String, CaseIterable, Sendable {
    case pohPerformance = "poh-performance"
    case weightBalance = "weight-balance"
    case logbookPage = "logbook-page"
    case clearance

    /// The page as the pilot picks it.
    var label: String {
        switch self {
        case .pohPerformance: "Performance Page"
        case .weightBalance: "Weight & Balance Page"
        case .logbookPage: "Logbook Page"
        case .clearance: "Clearance"
        }
    }
}

/// The page read and checked, as OnDeviceDocumentReader.answer writes it
/// (snake case): the engine's checks of the read, a clearance note, the
/// model, its notes and what could not be read.
struct DocumentRead: Codable, Equatable, Sendable {
    var kind: String
    var model: String
    var notes: [String]?
    var unreadable: String?
    var clearance: ClearanceNote?
    var handbookCheck: HandbookCheck?
    var logbookCheck: LogbookCheck?

    enum CodingKeys: String, CodingKey {
        case kind, model, notes, unreadable, clearance
        case handbookCheck = "handbook_check"
        case logbookCheck = "logbook_check"
    }
}

/// A copied clearance: as written, and as the controller said it.
struct ClearanceNote: Codable, Equatable, Sendable {
    var written: String
    var said: String
}

/// The engine's checks of a read (handbook_read_check,
/// logbook_read_check), as its contract gives them.
typealias HandbookCheck = EngineContract.HandbookReadCheckAnswer
typealias HandbookItem = EngineContract.HandbookReadCheckAnswerItemsItem
typealias HandbookFigure = EngineContract.HandbookReadCheckAnswerItemsItemFiguresItem
typealias HandbookFigures = EngineContract.HandbookReadCheckAnswerHandbook
typealias HandbookProfile = EngineContract.HandbookReadCheckAnswerProfile
typealias LogbookCheck = EngineContract.LogbookReadCheckAnswer
typealias LogbookRowCheck = EngineContract.LogbookReadCheckAnswerRowsItem
typealias LogbookEntryDraft = EngineContract.LogbookReadCheckAnswerRowsItemEntry
typealias DocumentFlag = EngineContract.DocumentFlag

/// The answer as the screens keep it: the read decoded, and the handbook
/// read again as the JSON it came as: an edit is made at a figure's
/// `path` ("cruise.2.tas"), which names the JSON's members, and the check
/// again is asked of the engine with that JSON, so nothing the generated
/// model renames or leaves out can be lost on the way.
struct DocumentAnswer: Equatable, Sendable {
    var read: DocumentRead
    var handbook: OpenAPIValueContainer?

    init(read: DocumentRead, handbook: OpenAPIValueContainer? = nil) {
        self.read = read
        self.handbook = handbook
    }

    /// The reader's body, both ways.
    init(data: Data) throws {
        struct Raw: Decodable { var handbook: OpenAPIValueContainer? }
        read = try JSONDecoder().decode(DocumentRead.self, from: data)
        let raw = try JSONDecoder().decode(Raw.self, from: data).handbook
        handbook = raw?.value == nil ? nil : raw
    }
}

/// A photographed page read by Apple's models (OnDeviceDocumentReader):
/// the photo made small enough to read, and the answer or why not.
/// Nothing is saved anywhere by reading: each screen shows every item for
/// the pilot to confirm, and saves only what they confirm, on their Save.
enum DocumentReader {
    /// The photo's long edge at most, in pixels: enough for a handbook's
    /// small print.
    static let longEdge: CGFloat = 2000
    static let quality: CGFloat = 0.85
    /// The photo as the model is shown it: a JPEG no longer than `longEdge`
    /// on its long side, never made larger. Nil where it cannot be drawn.
    static func jpeg(_ image: UIImage) -> Data? {
        let size = image.size
        let longest = max(size.width, size.height)
        guard longest > 0 else { return nil }
        let scale = min(1, longEdge / longest)
        let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let drawn = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
        return drawn.jpegData(compressionQuality: quality)
    }

    /// The page read on the phone (OnDeviceDocumentReader: Apple's
    /// on-device model and Vision, else Apple's Private Cloud Compute),
    /// or why it cannot be.
    static func read(_ kind: DocumentKind, image: UIImage) async throws -> DocumentAnswer {
        try await OnDeviceDocumentReader.read(kind, image: image)
    }

    /// Whether a page can be read here at all, by Apple's models. Where
    /// not, "From a Photo" is not offered.
    static var offered: Bool { OnDeviceDocumentReader.unavailableWhy == nil }

    /// Why a read failed, in words for the screen.
    static func words(for error: any Error) -> String {
        if let unavailable = error as? WordsUnavailable { return unavailable.why }
        return "The page could not be read: \(error.localizedDescription)"
    }
}

/// A finding on a figure or a row as the engine flags it: "wrong" where it
/// cannot be right, "check" where it is unusual (warn, never limit: the
/// pilot may still confirm either).
enum FlagTone: Equatable, Sendable {
    case wrong, check

    init(level: String) { self = level == "wrong" ? .wrong : .check }

    var color: Color { self == .wrong ? WingtipInk.problem : WingtipInk.caution }
    var symbol: String { self == .wrong ? "xmark.octagon.fill" : "exclamationmark.triangle.fill" }
    var said: String { self == .wrong ? "Can't be right" : "Check" }
}

/// One flag under its item, in its tone, with a mark beside the words for
/// a pilot who does not see the colour.
struct FlagLine: View {
    let flag: DocumentFlag

    var body: some View {
        let tone = FlagTone(level: flag.level)
        Label(flag.says, systemImage: tone.symbol)
            .font(WingtipType.note)
            .foregroundStyle(tone.color)
            .accessibilityLabel("\(tone.said): \(flag.says)")
    }
}

/// The read's own notes and what could not be read, above the items.
struct DocumentNotes: View {
    let read: DocumentRead

    var body: some View {
        if let unreadable = read.unreadable, !unreadable.isEmpty {
            Label(unreadable, systemImage: "eye.slash").font(WingtipType.note).foregroundStyle(WingtipInk.caution)
        }
        ForEach(Array((read.notes ?? []).enumerated()), id: \.offset) { _, note in
            Text(note).font(WingtipType.note).foregroundStyle(.secondary)
        }
    }
}

/// The read in progress and its answer, shared by the three screens: one
/// page at a time, the spinner while it is read, the problem where it
/// failed.
@MainActor
@Observable
final class DocumentReadModel {
    private(set) var reading = false
    var problem: String?
    var answer: DocumentAnswer?
    private var running: Task<Void, Never>?

    /// The page read; `then` takes the answer once it has come.
    func read(_ kind: DocumentKind, image: UIImage, then: @escaping @MainActor (DocumentAnswer) -> Void = { _ in }) {
        running?.cancel()
        reading = true
        problem = nil
        answer = nil
        running = Task {
            // A read given up for a newer one leaves the newer one's spinner.
            defer { if !Task.isCancelled { reading = false } }
            do {
                let read = try await DocumentReader.read(kind, image: image)
                guard !Task.isCancelled else { return }
                answer = read
                then(read)
            } catch {
                guard !Task.isCancelled else { return }
                problem = DocumentReader.words(for: error)
            }
        }
    }

    func cancel() {
        running?.cancel()
        running = nil
        reading = false
    }
}
