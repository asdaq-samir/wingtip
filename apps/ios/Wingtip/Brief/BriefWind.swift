import Foundation

/// The Brief's wind aloft for the route (the web's glance, the Brief
/// audit's finding 11): the strongest headwind over every leg, the
/// engine's `route_headwind`, where the first stretch's wind said nothing
/// of a later leg flown into a strong one. The component is the wind
/// triangle's along each leg's true course (FAA-H-8083-25C ch. 16; the
/// winds aloft forecast is true, FAA-H-8083-28B 27.6), worked by the engine.
enum BriefWind {
    /// "18 kt, KJVL–KMSN"; "None" with tailwinds all the way; "—" where no
    /// leg has both a wind and a course.
    static func mostHeadwind(_ legs: [Leg]) -> String {
        let asked = legs.map { leg in
            EngineContract.RouteHeadwindInputLegsItem(
                from: leg.from, to: leg.to, trueCourseDeg: leg.trueCourseDeg,
                wind: leg.wind.map { .init(windDirTrueDeg: $0.windDirTrueDeg, windSpeedKt: $0.windSpeedKt) })
        }
        let answer: EngineContract.RouteHeadwindAnswer?
        do { answer = try Engine.routeHeadwind(legs: asked) } catch { return String(localized: "Not worked out") }
        guard let most = answer else { return Format.none }
        guard most.headwindKt.rounded() > 0 else { return String(localized: "None") }
        return "\(Format.speed(most.headwindKt)), \(most.from)–\(most.to)"
    }
}
