import Foundation

/// The flight's figures on the phone with no signal: the plan as the
/// planner's nav log last gave it, the fuel, the glide and the nearest
/// fields from the cycle packs kept on the phone. Each is the planner's
/// or the engine's (Engine/Generated/EngineCalls), with where it comes
/// from; nothing is worked out here.
enum FlightFigures {
    /// The route and its nav log's totals, as the planner last sent them.
    static func route(facts: OnDeviceFacts) throws -> [AskFigure] {
        guard !facts.dep.isEmpty, !facts.dest.isEmpty else { throw AskRefused(why: "No route is planned on this iPhone.") }
        var said = "The route is \(facts.idents.filter { !$0.isEmpty }.joined(separator: " to "))"
        if let totals = facts.totals {
            said += ", \(Format.distance(totals.distanceNm))"
            if let ete = totals.eteMin { said += ", \(Format.duration(ete)) en route" }
            if let fuel = totals.fuelGal { said += ", \(Format.fuel(fuel)) planned" }
        }
        if let cruise = facts.cruiseFt { said += ", cruising at \(Format.cruiseAltitude(cruise)) (\(Format.altitude(cruise)))" }
        if let aircraft = facts.aircraft { said += " in the \(aircraft)" }
        return [AskFigure(id: "plan:route", label: "The plan", said: said + ".",
                          from: "the planner's nav log, held on this iPhone\(FieldFigures.asOf(facts))")]
    }

    /// The fuel: the nav log's trip, required and spare (14 CFR 91.151(a),
    /// 91.167(a)(3) reserves, the planner's), what the plan leaves at the
    /// destination from where the airplane is (the engine's in_flight, a
    /// planning figure, not a gauge), and the endurance of the fuel on
    /// board, or of full tanks, at the cruise burn (the engine's
    /// filed_endurance, AIM Appendix 4 item 19).
    static func fuel(onBoardGal: Double?, facts: OnDeviceFacts) throws -> [AskFigure] {
        var out: [AskFigure] = []
        if let totals = facts.totals, let trip = totals.fuelGal {
            var said = "The plan burns \(Format.fuel(trip))"
            if let required = totals.fuelRequiredGal {
                // The start and taxi allowance is the profile's own; with
                // none it is left out and said so, never a stock figure.
                said += " and needs \(Format.fuel(required)) with " + (totals.taxiGal == nil ? "reserve (no start and taxi fuel given for this airplane: add it in its profile)" : "taxi and reserve")
            }
            if let reserve = totals.reserveMin { said += " (a \(Format.duration(reserve)) reserve)" }
            if let margin = totals.fuelMarginGal { said += "; \(Format.fuel(margin)) to spare" }
            out.append(AskFigure(id: "fuel:plan", label: "Fuel, planned", said: said + ".",
                                 from: "the planner's nav log (reserves 14 CFR 91.151(a), 91.167(a)(3)), held on this iPhone\(FieldFigures.asOf(facts))"))
        }
        if let destination = facts.destination, let left = destination.fuelLeftGal {
            // The engine's figure, from the last fuel stop passed (AV-4);
            // below nothing the plan runs dry first, said as such.
            var said = left >= 0 ? "From here the plan leaves \(Format.fuel(left)) at \(destination.name), \(Format.distance(destination.distanceNm)) on"
                : "From here the plan runs \(Format.fuel(-left)) short of \(destination.name), \(Format.distance(destination.distanceNm)) on"
            if let ete = destination.eteMin { said += ", \(Format.duration(ete)) to go" }
            out.append(AskFigure(id: "fuel:ahead", label: "Fuel at \(destination.name)", said: said + ".",
                                 from: "the engine's in_flight from own ship's GPS fix and the nav log's legs: a planning figure, not a fuel gauge"))
        }
        let burn = facts.figures.fuelBurnGph
        if let burn, let gal = onBoardGal ?? facts.figures.usableFuelGal, let minutes = try Engine.filedEndurance(fuelGal: gal, burnGph: burn) {
            let what = onBoardGal == nil ? "Full tanks, \(Format.fuel(gal)) usable," : "\(Format.fuel(gal)) on board"
            out.append(AskFigure(id: "fuel:endurance", label: "Endurance", said: "\(what) last \(Format.duration(Double(minutes))) at \(Format.number(burn, decimals: 1)) gal an hour.",
                                 from: "the engine's filed_endurance (AIM Appendix 4, item 19) at the airplane's cruise burn"))
        }
        guard !out.isEmpty else { throw AskRefused(why: "This iPhone holds no fuel figures: plan the route with an airplane first.") }
        return out
    }

    /// How far the airplane glides in still air from its GPS altitude over
    /// the ground under it (the engine's glide_range at the picked
    /// airplane's own glide ratio, its POH's Section 3); none with no
    /// airplane or no glide in its profile, never another airplane's.
    static func glide(facts: OnDeviceFacts) throws -> [AskFigure] {
        guard facts.aircraft != nil else { throw AskRefused(why: "Pick an airplane: the glide is its own.") }
        guard let ratio = facts.glideRatio else { throw AskRefused(why: "The glide needs this airplane's glide ratio: add it in its profile.") }
        guard let own = facts.own, let altitude = own.altitudeFt else { throw AskRefused(why: "This iPhone has no GPS altitude for the airplane.") }
        guard let range = try Engine.glideRange(altitudeFt: altitude, speedKt: own.groundspeedKt, groundFt: own.groundFt, glideRatio: ratio) else {
            throw AskRefused(why: "The engine gives no glide on the ground or with no height over it.")
        }
        var said = "In still air the airplane glides about \(Format.distance(range)) from \(Format.altitude(altitude.rounded())) GPS"
        if let ground = own.groundFt { said += " over ground at \(Format.altitude(ground.rounded()))" }
        return [AskFigure(id: "glide", label: "Glide", said: said + ".",
                          from: "the engine's glide_range at the airplane's own glide ratio (its POH's Section 3) from own ship's GPS fix; the ground from the cycle pack")]
    }

    /// What finds the fields in a box: the cycle packs kept on the phone
    /// (the engine's airports_in_view), or a test's.
    typealias Pins = @Sendable (_ south: Double, _ west: Double, _ north: Double, _ east: Double) -> [AirportPin]?

    static let packPins: Pins = { CyclePacks.shared.airportsInView(south: $0, west: $1, north: $2, east: $3) }

    /// The fields nearest the airplane from the packs kept on the phone
    /// (NASR, by the FAA's cycle), ranked by the engine's best_fields:
    /// with no airplane's glide figures it guesses no glide and puts the
    /// nearest first, with each one's distance and true course.
    static func nearest(facts: OnDeviceFacts, pins: Pins = packPins) throws -> [AskFigure] {
        guard let own = facts.own else { throw AskRefused(why: "This iPhone has no GPS fix for the airplane.") }
        guard let kept = try PackFields.ranked(lat: own.lat, lon: own.lon, altitudeFt: own.altitudeFt, speedKt: own.groundspeedKt,
                                               limit: 3, pins: pins), !kept.pins.isEmpty else {
            throw AskRefused(why: "No region's pack is kept on this iPhone round the airplane; keep the route for the air first.")
        }
        return kept.ranked.fields.map { field in
            var said = "\(field.ident), \(field.name), is \(Format.distance(field.distanceNm)) away on \(Format.heading(field.courseDeg)) true"
            if let ete = field.eteMin { said += ", \(Format.duration(ete))" }
            return AskFigure(id: "nearest:\(field.ident)", label: "\(field.ident) nearest", said: said + ".",
                             from: "the FAA's NASR airports in the cycle pack kept on this iPhone, ranked by the engine's best_fields from own ship's GPS fix")
        }
    }
}
