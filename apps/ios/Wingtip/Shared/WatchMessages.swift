import Foundation

// What the phone and the watch say to each other over WatchConnectivity
// (Wingtip/WatchLink.swift on the phone, WingtipWatch/WatchSession.swift
// on the watch): each message one small Codable struct, carried as JSON
// bytes under one key of the session's dictionary (WatchMessageKey).
// Compiled into both apps, which must see one and the same type; the
// watch links no engine and no API, so nothing here depends on either.
// Nonisolated: WatchConnectivity hands messages over on its own queue.

/// The keys of the WCSession dictionaries. The application context
/// carries `context`; a request from the watch carries `nearest` and is
/// answered with `nearest` too.
nonisolated enum WatchMessageKey {
    static let context = "context"
    static let nearest = "nearest"
}

/// The coder both sides use: dates as ISO 8601, so a message read on
/// either is the one written.
nonisolated enum WatchCoding {
    static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}

/// The pilot's fix as the phone reads it (OwnShip.Fix), the figures the
/// watch shows or asks the nearest airports from.
nonisolated struct WatchFix: Codable, Equatable, Sendable {
    var lat: Double
    var lon: Double
    var altitudeFt: Double?
    var trackDeg: Double?
    var groundspeedKt: Double?
    var at: Date
}

/// An airplane's checklist in the engine's shape (`sections`, each
/// `title` and `items`, each `challenge` and `response`), so the phone
/// encodes the Checklist it has read and the watch reads these from the
/// same bytes.
nonisolated struct WatchChecklist: Codable, Equatable, Sendable {
    var sections: [WatchChecklistSection]
}

nonisolated struct WatchChecklistSection: Codable, Equatable, Sendable {
    var title: String
    var items: [WatchChecklistItem]
}

nonisolated struct WatchChecklistItem: Codable, Equatable, Sendable {
    var challenge: String
    var response: String?
}

/// What the watch keeps of the phone (the application context, which
/// WatchConnectivity delivers once the watch wakes, latest wins): the
/// airplane picked and its checklist, and the phone's last fix.
nonisolated struct WatchContext: Codable, Equatable, Sendable {
    var tail: String?
    var checklist: WatchChecklist?
    var fix: WatchFix?
    var sentAt: Date
}

/// The watch's question: the fields nearest a point, from its own
/// location or the phone's fix.
nonisolated struct NearestRequest: Codable, Equatable, Sendable {
    var lat: Double
    var lon: Double
    var limit: Int = 8
}

/// The phone's answer, from the planner (/api/airports/nearest, nearest
/// first); `problem` says why there are none when there are none.
nonisolated struct NearestReply: Codable, Equatable, Sendable {
    var airports: [WatchAirport]
    var problem: String?
}

/// A field near a point: its distance and bearing from there, worked out
/// by the planner (NearestAirport, the properties the wrist shows).
nonisolated struct WatchAirport: Codable, Equatable, Sendable, Identifiable {
    var ident: String
    var name: String
    var lat: Double
    var lon: Double
    var distanceNm: Double
    var bearingDeg: Double
    var flightCategory: String?

    var id: String { ident }

    /// The bearing as the wrist writes it: three figures, whole degrees,
    /// north as 360, never 000 (FAA Order JO 7110.65, 2-4-17), as the
    /// phone's Format.heading does; the watch has no Format of its own.
    var bearingWords: String {
        let whole = (Int(bearingDeg.rounded()) % 360 + 360) % 360
        return String(format: "%03d°", whole == 0 ? 360 : whole)
    }
}
