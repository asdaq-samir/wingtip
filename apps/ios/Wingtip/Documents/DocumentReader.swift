import Observation
import OpenAPIRuntime
import SwiftUI
import UIKit

/// What a photographed page is of, as the assistant's POST
/// /api/read-document names it (ReadAsk.kind).
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

/// The page read and checked (the assistant's DocumentRead, generated):
/// the read, the engine's checks of it, a clearance note, what could not
/// be read.
typealias DocumentRead = ASDocumentRead

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
        read = try Planner.json.decode(DocumentRead.self, from: data)
        let raw = try JSONDecoder().decode(Raw.self, from: data).handbook
        handbook = raw?.value == nil ? nil : raw
    }
}

/// A photographed page read by the assistant: the photo made small enough
/// to send, the ask, and the answer or the reader's own words why not.
/// Nothing is saved anywhere by reading: each screen shows every item for
/// the pilot to confirm, and saves only what they confirm, on their Save.
enum DocumentReader {
    /// The photo's long edge at most, in pixels: enough for a handbook's
    /// small print, and well under the reader's 3.5 MB once a JPEG.
    static let longEdge: CGFloat = 2000
    static let quality: CGFloat = 0.85
    /// The photo as the reader takes it: a JPEG no longer than `longEdge`
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

    /// The ask: the photo in base64, what it is of, and the phone's own
    /// date, which a logbook row may not be after.
    static func ask(_ kind: DocumentKind, jpeg: Data, today: String = Day.today()) -> ASReadAsk {
        ASReadAsk(image: jpeg.base64EncodedString(), kind: kind.rawValue, mediaType: "image/jpeg", today: today)
    }

    /// The page read on the phone where it can (OnDeviceDocumentReader:
    /// Apple's on-device model and Vision, iOS 27, the photo never sent),
    /// else through the gateway as the other assistant calls go;
    /// CSRF-checked, as it is a paid call made for the pilot.
    /// While the server's Claude features are off (ServerFeatures, the
    /// owner's decision of 2026-11-10 in docs/decisions) the assistant is
    /// never sent the photo: Apple's models read it or nothing does.
    static func read(_ kind: DocumentKind, image: UIImage, claudeOn: Bool = ServerFeatures.claudeOnNow) async throws -> DocumentAnswer {
        if OnDeviceDocumentReader.unavailableWhy == nil {
            do {
                return try await OnDeviceDocumentReader.read(kind, image: image)
            } catch {
                Log.onDevice.notice("the page could not be read on the phone: \(error.localizedDescription, privacy: .public)")
                if !claudeOn { throw error }
            }
        }
        guard claudeOn else { throw WordsUnavailable(why: OnDeviceDocumentReader.unavailableWhy ?? "This iPhone could not read the page.") }
        return try await server(kind, image: image)
    }

    /// Whether a page can be read here at all: by Apple's models, or by
    /// the assistant while the server's Claude features are this pilot's.
    /// Where neither, "From a Photo" is not offered.
    @MainActor static var offered: Bool {
        OnDeviceDocumentReader.unavailableWhy == nil || ServerFeatures.shared.claudeOn
    }

    /// The page read by the assistant (Claude), the photo sent.
    static func server(_ kind: DocumentKind, image: UIImage) async throws -> DocumentAnswer {
        guard let jpeg = jpeg(image) else { throw Planner.Failure(status: 422, detail: "That photo could not be opened.") }
        let read = try await Planner.ask(.upload) { try await $0.readDocument(body: .json(ask(kind, jpeg: jpeg))).ok.body.json }
        return try DocumentAnswer(data: JSONEncoder().encode(read))
    }

    /// Why a read failed, in words for the screen: the reader's own detail
    /// where it gave one.
    static func words(for error: any Error) -> String {
        if let unavailable = error as? WordsUnavailable { return unavailable.why }
        guard let failure = error as? Planner.Failure else {
            return (error as? URLError)?.code == .timedOut ? "The page took too long to read. Try again." : "The page could not be sent: \(error.localizedDescription)"
        }
        switch failure.status {
        case 503: return failure.detail ?? "The page reader can't be reached just now. Try again in a minute."
        case 502: return failure.detail ?? "The figures read could not be checked."
        case 413: return failure.detail ?? "That photo is too large to send."
        case 422: return failure.detail ?? "That photo could not be read as an image."
        case 404: return AssistantClient.notHere
        default: return failure.localizedDescription
        }
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
    let flag: ASDocumentFlag

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
