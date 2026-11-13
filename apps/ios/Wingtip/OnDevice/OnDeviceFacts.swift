import Foundation

/// What the phone holds about the flight, taken once on the main actor
/// when a question is asked, so the on-device answer (OnDeviceAsk) and
/// its tools (OnDeviceTools) read a value and never the live models: the
/// plan's route and its nav log's totals, the briefing's fields with
/// their runways, METARs and TAFs as the planner last sent them, the
/// airplane's figures, own ship's last fix, and the engine's in-flight
/// answer. Nothing here is a figure of its own: each is the planner's or
/// the engine's, and keeps its time where it has one, since in the air
/// with no signal a report is as old as the last fetch.
struct OnDeviceFacts: Equatable, Sendable {
    /// One field of the route as the briefing gave it.
    struct Field: Equatable, Sendable {
        var ident: String
        var name: String?
        var elevationFt: Double?
        var runways: [APIRunway] = []
        var metar: Metar?
        /// The TAF as sent, where the briefing's forecast has the station.
        var taf: String?
    }

    /// Own ship's last fix, and the ground under it from the packs.
    struct Own: Equatable, Sendable {
        var lat: Double
        var lon: Double
        var altitudeFt: Double?
        var groundspeedKt: Double?
        var trackDeg: Double?
        var groundFt: Double?
    }

    var dep = ""
    var dest = ""
    var stops: [String] = []
    /// The airplane's name as the planner knows it, nil with none picked
    /// (docs/decisions/0011: nothing is judged on an airplane assumed).
    var aircraft: String?
    var figures = Figures()
    /// The picked airplane's glide ratio, its profile's (its POH's
    /// Section 3: the pilot's own over its type's book); nil with none,
    /// which no other airplane's fills.
    var glideRatio: Double?
    var fields: [String: Field] = [:]
    var totals: Totals?
    /// The nav log's cruise altitude, ft.
    var cruiseFt: Double?
    var own: Own?
    /// The engine's in_flight answer for the destination ahead, while
    /// flying the route (InFlight).
    var destination: InFlight.Waypoint?
    /// When the planner worked out the plan, for "as of".
    var plannedAt: Date?

    var idents: [String] { [dep] + stops + [dest] }

    /// A field the question names, else the destination.
    func field(_ ident: String?) -> Field? {
        let asked = (ident ?? "").trimmingCharacters(in: .whitespaces).uppercased()
        if let found = fields[asked] { return found }
        // "MSN" for KMSN, as a pilot says it.
        if asked.count == 3, let found = fields["K" + asked] { return found }
        return asked.isEmpty ? fields[dest.uppercased()] : nil
    }
}

extension OnDeviceFacts {
    /// The facts as the app has them: the plan on the page, own ship and
    /// the engine's in-flight answer.
    @MainActor
    static func make(plan: Plan, ownShip: OwnShip, inFlight: InFlight) -> OnDeviceFacts {
        var facts = OnDeviceFacts(dep: plan.dep.uppercased(), dest: plan.dest.uppercased(), stops: plan.stops.map { $0.uppercased() })
        facts.aircraft = plan.airplaneChosen ? plan.aircraft : nil
        facts.figures = plan.figures
        // The airplane's own glide ratio, the pilot's over its type's book
        // (airplane_figures); none with no airplane.
        facts.glideRatio = Airplanes.shared.value(.glideRatio, plan: plan)
        facts.totals = plan.totals
        facts.cruiseFt = plan.ownAltitudeFt ?? plan.altitudeFt
        facts.plannedAt = plan.plannedAt
        facts.destination = inFlight.onRoute ? inFlight.progress?.destination : nil
        if let briefing = plan.briefing { facts.fields = fields(of: briefing) }
        if let fix = ownShip.fix {
            facts.own = Own(lat: fix.coordinate.latitude, lon: fix.coordinate.longitude, altitudeFt: fix.altitudeFt,
                            groundspeedKt: fix.groundspeedKt, trackDeg: fix.trackDeg, groundFt: ownShip.groundFt)
        }
        return facts
    }

    /// The briefing's fields: each airport's facilities, its METAR, and
    /// the TAF of the station that is the field.
    static func fields(of briefing: Briefing) -> [String: Field] {
        var out: [String: Field] = [:]
        for (ident, airport) in briefing.airports.additionalProperties {
            out[ident.uppercased()] = Field(ident: ident.uppercased(), name: airport.name, elevationFt: airport.elevationFt, runways: airport.runways)
        }
        for (ident, metar) in briefing.metars.additionalProperties {
            out[ident.uppercased(), default: Field(ident: ident.uppercased())].metar = metar
        }
        for station in briefing.forecast.stations {
            guard let raw = station.raw else { continue }
            out[station.icaoId.uppercased(), default: Field(ident: station.icaoId.uppercased())].taf = raw
        }
        return out
    }
}
