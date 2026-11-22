import Foundation

/// The Air Defense Identification Zones the route meets (the engine's
/// route_adiz; 14 CFR 99.41-99.49), for the Brief's one caution line: a
/// flight into, within or out of one is asked for a flight plan, a
/// listening watch, its transponder and a report before it crosses (99.9,
/// 99.11, 99.13, 99.15). Warn, never limit. The engine judges it; this
/// only hands it the route's points in order and keeps the last few
/// answers, a leg being checked every 2 nm (the web's features/plan/adiz).
@MainActor
enum RouteAdiz {
    typealias Brief = EngineContract.RouteAdizAnswerBrief

    /// The last few routes' answers by their points.
    private static var kept: [String: Result<Brief?, any Error>] = [:]
    private static var order: [String] = []
    private static let keptMost = 6

    /// The Brief's line for the plan's route, nil where it meets no ADIZ or
    /// there is no route; the engine's refusal said, never read as none.
    static func brief(_ plan: Plan) -> Result<Brief?, any Error> {
        brief(points: RouteShare.points(plan).map { (lat: $0.lat, lon: $0.lon) })
    }

    static func brief(points: [(lat: Double, lon: Double)]) -> Result<Brief?, any Error> {
        guard !points.isEmpty else { return .success(nil) }
        let key = points.map { "\($0.lat),\($0.lon)" }.joined(separator: ";")
        if let answer = kept[key] { return answer }
        let answer = Result { try Engine.routeAdiz(points: points.map { .init(lat: $0.lat, lon: $0.lon) }).brief }
        if order.count >= keptMost { kept[order.removeFirst()] = nil }
        order.append(key)
        kept[key] = answer
        return answer
    }
}
