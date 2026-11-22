import SwiftUI

/// A field's runway menu on FPL's timeline, "Land RWY 24" or "Takeoff RWY
/// 24" (TimelineFieldParts): the field's runway ends with Into the Wind
/// first (the planner's pick where none is, AirportWords.windEnd), and
/// with an approach picked the approach's own runway (LandingRunway).
struct TimelineRunwayMenu: View {
    @Environment(Plan.self) private var plan
    let point: TimelinePoint
    let cards: RouteFieldCards
    let takeoff: Bool

    /// The runway menu, its label the runway picked or the wind's.
    var body: some View {
        let place = cards.place(point.ident)
        let ends = TimelineRunways.ends(place)
        if !ends.isEmpty {
            let key = point.ident.uppercased()
            let picked = takeoff ? plan.extras.takeoffs[key] : plan.extras.landings[key]
            let wind = place.flatMap { AirportWords.windEnd($0.runways) }
            // With an approach picked, the landing is on its own runway
            // (the engine's landing_runway, owner rec 10), another only by
            // circling: the wind's pick gives way to it.
            let approach = takeoff ? nil : plan.picks(at: point.ident, kinds: ["approach"]).first
            let landing = approach == nil ? nil
                : LandingRunway.at(point.ident, approach: approach, procedures: cards.procedures[key], picked: picked)
            let shown = landing?.runway ?? picked ?? wind
            let othersAllowed = landing?.othersAllowed ?? true
            let verb = takeoff ? "Takeoff" : "Land"
            Menu {
                Button { plan.setRunway(nil, at: point.ident, takeoff: takeoff) } label: {
                    if landing?.runway != nil, !othersAllowed {
                        Label("The Approach's (\(landing?.runway ?? ""))", systemImage: "checkmark")
                    } else {
                        Label(wind.map { "Into the Wind (\($0))" } ?? "Into the Wind", systemImage: picked == nil ? "checkmark" : "wind")
                    }
                }
                Divider()
                ForEach(ends, id: \.self) { end in
                    Button { plan.setRunway(end, at: point.ident, takeoff: takeoff) } label: {
                        if shown == end, picked != nil { Label("Runway \(end)", systemImage: "checkmark") } else { Text("Runway \(end)") }
                    }
                    // No circling published: the approach lands straight in.
                    .disabled(!othersAllowed && end != landing?.runway)
                }
            } label: {
                Text(shown.map { "\(verb) RWY \($0)" } ?? "\(verb) RWY \(Format.none)")
            }
            .accessibilityLabel("\(point.ident) \(takeoff ? "takeoff" : "landing") runway")
            .accessibilityValue(shown.map { "Runway \($0)\(picked == nil ? ", into the wind" : "")" } ?? "none picked")
            .accessibilityIdentifier("\(takeoff ? "takeoff" : "land")-runway-\(point.ident)")
        }
    }
}
