import Foundation
import Observation

/// How the plates on the map are drawn, from the plate's card: how solid
/// the page is, whether its colours are turned white on black for the
/// night, and whether the approach's fixes carry their tags (ForeFlight's
/// plate settings, the owner's screenshot, 2026-11-11). Kept on the
/// device, as the map's other switches are (MapExtrasInput.Keys).
struct PlateLook: Equatable {
    /// The page's opacity, from clear (0) to solid (1).
    var opacity: Double = PlateLook.defaultOpacity
    var inverted = false
    var annotations = true

    /// Solid enough to read the plate, the chart still faintly under it,
    /// as ForeFlight opens its plate on the map.
    static let defaultOpacity = 0.85
    /// Never wholly clear: a page at nought would still take the map's
    /// taps with nothing to show for it.
    static let leastOpacity = 0.1

    enum Keys {
        static let opacity = "plate.opacity"
        static let inverted = "plate.inverted"
        static let annotations = "plate.annotations"
    }
}

/// The plates taken off the map from their card (Hide Plate), by their key
/// ("KOSH:I36"): the procedure stays on the route. Held for the session,
/// not kept: a hidden plate comes back when its approach is picked again or
/// when the Map card's Approach Plates is turned on (the spec, 2026-11-11).
@MainActor @Observable
final class HiddenPlates {
    static let shared = HiddenPlates()
    private(set) var keys: Set<String> = []

    func hide(_ key: String) { keys.insert(key) }

    /// Every plate back: the Map card's switch turned on.
    func showAll() { keys = [] }

    /// The approaches on the route now: a plate whose approach was not
    /// there before (picked again) comes back.
    func picked(_ now: [String], before: [String]) {
        let fresh = Set(now).subtracting(before)
        if !fresh.isDisjoint(with: keys) { keys.subtract(fresh) }
    }
}

/// A plate's key and how its card writes its name.
enum PlateKey {
    static func of(_ pick: ProcedurePick) -> String { "\(pick.ident):\(pick.id)" }

    /// The field and the procedure of a key ("KOSH:I36").
    static func parts(_ key: String) -> (ident: String, procedure: String)? {
        let parts = key.split(separator: ":", maxSplits: 1).map(String.init)
        guard parts.count == 2, !parts[0].isEmpty, !parts[1].isEmpty else { return nil }
        return (parts[0], parts[1])
    }

    /// The plate's title as its card shows it: the field, then the FAA's
    /// name of the approach in sentence case with its codes kept ("KOSH
    /// ILS or LOC rwy 36", CLAUDE.md's Writing).
    static func title(ident: String, name: String) -> String {
        let words = AirportWords.faaWords(name)
        return words.isEmpty ? ident : "\(ident) \(words)"
    }
}
