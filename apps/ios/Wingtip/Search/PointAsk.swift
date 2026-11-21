import Foundation

/// What the one search is asked to pick for the route, as Apple Maps'
/// Add Stop and Change Stop sheets ask theirs (the web's SearchPick, the
/// owner, 2026-11-19 to 21): a stop added before the destination, or the
/// point at `index` of the route's points (0 the departure, the last the
/// destination, a stop between) put in place of `ident`. While it asks, a
/// tap on a field anywhere on the search's page -- Nearest, a Favorite, a
/// Recent, a result -- picks it (Plan.pick), and the pilot is back on the
/// plan; a field that cannot be picked is greyed with why (Plan.refusal).
enum PointAsk: Equatable, Hashable, Sendable {
    case addStop
    case change(index: Int, ident: String)

    /// The ask's title over the search, Maps' own words: Add Stop, Change
    /// Stop, or the end being changed.
    func title(points: Int) -> String {
        switch self {
        case .addStop: "Add Stop"
        case .change(let index, _) where index == 0: "Departure"
        case .change(let index, _) where index == points - 1: "Destination"
        case .change: "Change Stop"
        }
    }

    /// The point being changed, said under the title; nil for Add Stop.
    var replacing: String? {
        if case .change(_, let ident) = self, !ident.isEmpty { return ident }
        return nil
    }
}

extension Plan {
    /// Why a field cannot be picked for `ask`, said greyed on its row, or
    /// nil where it can: a field NASR lists as closed is never offered as
    /// a landing field (decision 0043; `closed` is the planner's label from
    /// the engine's field_status, "Closed indefinitely"), and a field
    /// already a stop of the route is not put in twice. The two ends may be
    /// the same field (a local flight), so a pick for an end is refused
    /// only by the stops; the point being changed is always its own pick.
    func refusal(_ ident: String, closed: String?, for ask: PointAsk) -> String? {
        if let closed, !closed.isEmpty { return closed }
        let key = ident.uppercased()
        let points = idents.map { $0.uppercased() }
        let at: Int?
        if case .change(let index, _) = ask { at = index } else { at = nil }
        let end = at.map { $0 == 0 || $0 == points.count - 1 } ?? false
        for (i, point) in points.enumerated() where point == key && i != at {
            let isEnd = i == 0 || i == points.count - 1
            if end && isEnd { continue }
            return "Already on the route"
        }
        return nil
    }

    /// The field picked for `ask` put into the route and planned: a stop
    /// added before the destination, or the point at its index changed.
    /// Nothing where the pick is refused (refusal).
    func pick(_ ident: String, closed: String? = nil, for ask: PointAsk) {
        guard refusal(ident, closed: closed, for: ask) == nil else { return }
        let ident = ident.uppercased()
        switch ask {
        case .addStop:
            stops.append(ident)
        case .change(let index, _):
            let last = stops.count + 1
            if index <= 0 {
                dep = ident
            } else if index >= last {
                dest = ident
            } else {
                stops[index - 1] = ident
            }
        }
        plan()
    }
}
