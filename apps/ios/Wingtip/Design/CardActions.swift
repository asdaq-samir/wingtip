import Foundation

/// Each kind of card's actions, in order, with one name and one glyph per
/// action, as the web's CARD_ACTIONS (apps/web/src/lib/cardActions.ts) and
/// docs/design/icons.md have them: the UI audit of 2026-11-09 (item 10)
/// found "Add Stop" and "Add to Route" for one action and each app with its
/// own set. The first of a card's actions is its filled one.
///
/// - Fly Here: the field the route's destination, the plan shown.
/// - Depart From: the field the route's departure, the plan shown (the
///   owner's one-search design, 2026-11-09).
/// - Direct To: from the airplane to the point, then on along the route.
/// - Add as Stop: the field a landing on the way, as Maps' Add Stop.
/// - Add to Route: the point a turn on the way, where it bends the route
///   least; not a landing.
/// - Hold Here: a hold at the point (AIM 5-3-8).
/// - Favorite: the field in the Favorites or out, the airport card's last
///   tile, so the card's head holds Share and its close alone (the owner,
///   2026-11-11).
enum CardAction: String, CaseIterable, Sendable {
    case flyHere, departFrom, directTo, addStop, addToRoute, holdHere, call, address, copy, favorite

    var title: String {
        switch self {
        case .flyHere: "Fly Here"
        case .departFrom: "Depart From"
        case .directTo: "Direct To"
        case .addStop: "Add as Stop"
        case .addToRoute: "Add to Route"
        case .holdHere: "Hold Here"
        case .call: "Call"
        case .address: "Address"
        case .copy: "Copy"
        case .favorite: "Favorite"
        }
    }

    /// The shared concept table's glyph (WingtipIcon).
    var systemImage: String {
        switch self {
        case .flyHere, .directTo: WingtipIcon.directTo
        case .departFrom: WingtipIcon.departFrom
        case .addStop, .addToRoute: WingtipIcon.addToRoute
        case .holdHere: WingtipIcon.holdHere
        case .call: WingtipIcon.call
        case .address: WingtipIcon.address
        case .copy: WingtipIcon.copy
        case .favorite: WingtipIcon.favorite
        }
    }
}

/// The kinds of card, each with its actions in order.
enum CardKind: Sendable {
    case airport
    /// A point held on the map: the airspace card's.
    case point
    /// A VOR, a fix or a VFR waypoint.
    case navaid

    var actions: [CardAction] {
        switch self {
        case .airport: [.flyHere, .addStop, .call, .favorite]
        case .point: [.directTo, .addToRoute, .holdHere]
        case .navaid: [.directTo, .addToRoute, .copy]
        }
    }
}
