import CryptoKit
import Foundation
import PencilKit

/// A scratchpad page's kind: a blank page to write on, or one of the forms
/// a pilot copies onto a kneeboard -- a clearance, the ATIS, the runway's
/// figures -- each a few labelled lines over the page's ink. The lines are
/// text fields, so Apple Pencil's Scribble turns what is written in them
/// into text (HIG Apple Pencil and Scribble: "Make text entry feel
/// effortless"), and a keyboard or a finger types them as well.
enum ScratchTemplate: String, Codable, CaseIterable, Identifiable, Sendable {
    case blank, craft, atis, runway

    var id: String { rawValue }

    var title: String {
        switch self {
        case .blank: "Blank"
        case .craft: "Clearance (CRAFT)"
        case .atis: "ATIS"
        case .runway: "Takeoff and Landing"
        }
    }

    var systemImage: String {
        switch self {
        case .blank: "square.and.pencil"
        case .craft: "text.badge.checkmark"
        case .atis: "antenna.radiowaves.left.and.right"
        case .runway: "airplane.departure"
        }
    }

    /// The form's lines, each a key the page keeps it by and its label.
    /// - CRAFT: a clearance as it is copied, in the order it is read: AIM
    ///   4-4-3's clearance limit, route of flight and altitude data, then
    ///   the departure frequency and transponder code the clearance gives,
    ///   in the clearance sheet's own words (ClearanceCraftSection).
    /// - ATIS: what a pilot copies of the broadcast (AIM 4-1-13: its
    ///   "phonetic letter code", the wind, the altimeter, the runways in
    ///   use and its other remarks).
    /// - Takeoff and landing: the runway and the day's figures the pilot
    ///   works out from the airplane's own handbook; none is filled in for
    ///   them, as no airplane is assumed (docs/decisions/0011).
    var lines: [(key: String, label: String)] {
        switch self {
        case .blank: []
        case .craft: [("c", "Cleared to"), ("r", "Route"), ("a", "Altitude"), ("f", "Frequency"), ("t", "Transponder")]
        case .atis: [("information", "Information"), ("wind", "Wind"), ("altimeter", "Altimeter"), ("runway", "Runway"), ("remarks", "Remarks")]
        case .runway:
            [("runway", "Runway"), ("wind", "Wind"), ("altimeter", "Altimeter"), ("density", "Density altitude"),
             ("takeoff", "Takeoff distance"), ("landing", "Landing distance"), ("rotate", "Rotate speed"), ("approach", "Approach speed")]
        }
    }
}

/// One page: its kind, the text in its lines, and its ink as PencilKit
/// keeps a drawing.
struct ScratchPage: Codable, Identifiable, Equatable, Sendable {
    var id = UUID()
    var template: ScratchTemplate
    var fields: [String: String] = [:]
    var drawing = Data()
    var made = Date()
}

/// The pages kept on this device alone, one file a flight, by the flight's
/// key (its route's idents, ReadyToFly.flightKey), so the pages written
/// for a flight come back with it; with no route, the pad's own. Gone at
/// sign-out with the pilot's other marks (Session.forgetDevice).
enum ScratchStore {
    static var folder: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appending(path: "Scratchpad", directoryHint: .isDirectory)
    }

    /// The flight's file: its key hashed, a route being no file name.
    static func file(_ flight: String) -> URL {
        let digest = SHA256.hash(data: Data(flight.utf8)).map { String(format: "%02x", $0) }.joined()
        return folder.appending(path: "\(digest).json")
    }

    static func load(_ flight: String) -> [ScratchPage] {
        guard let data = try? Data(contentsOf: file(flight)) else { return [] }
        return (try? JSONDecoder().decode([ScratchPage].self, from: data)) ?? []
    }

    /// The flight's pages kept; none left, its file gone.
    static func save(_ pages: [ScratchPage], _ flight: String) {
        let url = file(flight)
        guard !pages.isEmpty, let data = try? JSONEncoder().encode(pages) else {
            try? FileManager.default.removeItem(at: url)
            return
        }
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try? data.write(to: url, options: [.atomic, .completeFileProtection])
    }

    static func forgetAll() {
        try? FileManager.default.removeItem(at: folder)
    }
}
