import Foundation
import Observation

/// An airport kept on the device: a Favorite or one opened lately, with
/// its name and town so the strip reads without asking the planner
/// (the web app's favoriteAirports and recents, lib/preferences).
struct KeptAirport: Codable, Equatable, Sendable, Identifiable, Hashable {
    let ident: String
    let name: String
    var municipality: String?
    var lat: Double
    var lon: Double

    var id: String { ident }

    init(ident: String, name: String, municipality: String? = nil, lat: Double, lon: Double) {
        self.ident = ident
        self.name = name
        self.municipality = municipality
        self.lat = lat
        self.lon = lon
    }

    init(_ place: AirportPlace) {
        self.init(ident: place.ident, name: place.name, municipality: place.municipality, lat: place.lat, lon: place.lon)
    }
}

/// What the Airport tab's strip shows, picked from the filter menu at
/// its heading's right (the owner's, 2026-10-15).
enum AirportShows: String, CaseIterable, Codable, Sendable {
    case favorites, recents, nearest

    var title: String {
        switch self {
        case .favorites: "Favorites"
        case .recents: "Recents"
        case .nearest: "Nearest"
        }
    }
}

/// The Airport tab's Favorites and Recents, and which of them -- or the
/// nearest fields -- its strip shows, kept on the device as the web app
/// keeps them in the browser. One shelf for the app.
@MainActor
@Observable
final class AirportShelf {
    static let shared = AirportShelf()

    typealias Shows = AirportShows

    /// As many recents as the web app keeps.
    static let recentsKept = 20

    private(set) var favorites: [KeptAirport] = []
    private(set) var recents: [KeptAirport] = []
    private(set) var shows: Shows = .favorites

    func show(_ list: Shows) {
        shows = list
        defaults.set(list.rawValue, forKey: Keys.shows)
    }

    private let defaults: UserDefaults

    enum Keys {
        static let favorites = "airport.favorites"
        static let recents = "airport.recents"
        static let shows = "airport.shows"
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        favorites = defaults.decoded([KeptAirport].self, forKey: Keys.favorites) ?? []
        recents = defaults.decoded([KeptAirport].self, forKey: Keys.recents) ?? []
        shows = defaults.string(forKey: Keys.shows).flatMap(Shows.init(rawValue:)) ?? .favorites
    }

    func isFavorite(_ ident: String) -> Bool { favorites.contains { $0.ident == ident } }

    /// The star: a Favorite added at the end, or taken off -- the taking
    /// off one Undo away with the window's UndoManager.
    func toggleFavorite(_ airport: KeptAirport, undo: UndoManager? = nil) {
        var list = favorites
        if let at = list.firstIndex(where: { $0.ident == airport.ident }) {
            list.remove(at: at)
            setFavorites(list, undo: undo, named: "Remove Favorite")
        } else {
            list.append(airport)
            setFavorites(list, undo: nil, named: "")
        }
    }

    func removeFavorites(at offsets: IndexSet, undo: UndoManager? = nil) {
        var list = favorites
        list.remove(atOffsets: offsets)
        setFavorites(list, undo: undo, named: offsets.count == 1 ? "Remove Favorite" : "Remove Favorites")
    }

    /// The Favorites as `list`, the list before registered as its undo
    /// (and that undo's own redo) where an UndoManager is given.
    private func setFavorites(_ list: [KeptAirport], undo: UndoManager?, named name: String) {
        let before = favorites
        favorites = list
        save(favorites, Keys.favorites)
        undo?.register(self, named: name) { $0.setFavorites(before, undo: undo, named: name) }
    }

    func moveFavorites(from offsets: IndexSet, to destination: Int) {
        favorites.move(fromOffsets: offsets, toOffset: destination)
        save(favorites, Keys.favorites)
    }

    /// A card opened: the field first in Recents, once.
    func opened(_ airport: KeptAirport) {
        recents.removeAll { $0.ident == airport.ident }
        recents.insert(airport, at: 0)
        if recents.count > Self.recentsKept { recents.removeLast(recents.count - Self.recentsKept) }
        save(recents, Keys.recents)
    }

    func removeRecents(at offsets: IndexSet) {
        recents.remove(atOffsets: offsets)
        save(recents, Keys.recents)
    }

    func clearRecents() {
        recents = []
        save(recents, Keys.recents)
    }

    private func save(_ list: [KeptAirport], _ key: String) {
        defaults.setEncoded(list, forKey: key)
    }
}
