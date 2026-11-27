import Foundation
import SwiftData

/// The pilot's own records on the device -- the airplanes kept as
/// Favorites and Recents, the watches set on them, the routes planned --
/// in one SwiftData store that iCloud carries to their other devices,
/// so a favourite set on the iPad is on the iPhone in the cockpit.
/// CloudKit's rules are kept by every model here:
/// each attribute optional or given a value, and nothing unique, since
/// two devices may each make the same record before they meet
/// (`Tracking.reload` folds those together).
enum Records {
    // The pilot's own documents, only while Keep in iCloud is on
    // (DocumentCloud, OwnDocumentRecord).
    static let schema = Schema([KeptAirplaneRecord.self, AirplaneWatchRecord.self, PlannedRoute.self, OwnDocumentRecord.self])

    /// The one store, in Application Support beside the last plan. It
    /// goes to iCloud through the app's first container (the
    /// entitlements in project.yml); a build without that capability, or
    /// a store that will not open, still keeps the records on the device,
    /// and only when the disk itself fails are they kept in memory, so
    /// the app always starts.
    static let container: ModelContainer = {
        let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "records.store")
        let configurations = [
            ModelConfiguration(schema: schema, url: url, cloudKitDatabase: .automatic),
            ModelConfiguration(schema: schema, url: url, cloudKitDatabase: .none),
        ]
        for (configuration, place) in zip(configurations, ["with iCloud", "on the device"]) {
            do {
                return try ModelContainer(for: schema, configurations: [configuration])
            } catch {
                Log.records.error("the records store would not open \(place, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
        // Cannot fail: an in-memory store with no file to open.
        return try! ModelContainer(for: schema, configurations: [ModelConfiguration(schema: schema, isStoredInMemoryOnly: true, cloudKitDatabase: .none)])
    }()

    /// A store that lives only as long as the test that made it.
    static func inMemory() throws -> ModelContainer {
        try ModelContainer(for: schema, configurations: [ModelConfiguration(schema: schema, isStoredInMemoryOnly: true, cloudKitDatabase: .none)])
    }

    /// Everything the store holds, gone: the account deleted
    /// (Session.deleteAccount), which iCloud carries to the other devices.
    static func erase(in context: ModelContext) {
        try? context.delete(model: KeptAirplaneRecord.self)
        try? context.delete(model: AirplaneWatchRecord.self)
        try? context.delete(model: PlannedRoute.self)
        try? context.save()
    }
}

/// An airplane the pilot kept (the web app's favoriteAircraft and
/// recentAircraft): one record per ICAO address, flagged with the lists
/// it is in, so a favourite that is also recent is one row and a
/// Favorites toggle does not touch the Recents. `addedAt` orders the
/// Favorites as they were added; `recentAt` the Recents, newest first.
@Model
final class KeptAirplaneRecord {
    var hex: String = ""
    var name: String = ""
    var type: String?
    var favorite: Bool = false
    var recent: Bool = false
    var addedAt: Date = Date()
    var recentAt: Date?

    init(hex: String, name: String, type: String?) {
        self.hex = hex
        self.name = name
        self.type = type
    }

    var kept: KeptAirplane { KeptAirplane(hex: hex, name: name, type: type) }
}

/// A watch set on an airplane (AirplaneWatch): its kind kept as the
/// enum's raw word, since a store carries words, not cases.
@Model
final class AirplaneWatchRecord {
    var hex: String = ""
    var name: String = ""
    var kind: String = AirplaneWatch.Kind.takeoff.rawValue
    var setAt: Date = Date()

    init(_ watch: AirplaneWatch) {
        hex = watch.hex
        name = watch.name
        kind = watch.kind.rawValue
    }

    /// nil for a kind a newer build wrote that this one does not know.
    var watch: AirplaneWatch? {
        AirplaneWatch.Kind(rawValue: kind).map { AirplaneWatch(hex: hex, name: name, kind: $0) }
    }
}
