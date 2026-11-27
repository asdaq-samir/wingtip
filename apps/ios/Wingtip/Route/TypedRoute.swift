import Foundation

/// A route typed or pasted whole, as the web's Type the Route takes it
/// into the route's field (RouteEditor, the owner's 2026-11-21 ask for it
/// at Add a Stop's end): "KPWK DCT OBK V100 KLAS", a clearance's or a filed
/// flight plan's. The engine reads it as item 15 of FAA Form 7233-4 has it
/// (AIM Appendix 4, its `route_read`): DCT taken out, a speed and level
/// group the cruise's, the rest the route's points in order. The first is
/// left from, the last landed at, and those between flown through, each
/// checked by the planner as it plans (a word it knows no place by is said
/// on FPL with its Remove, PlanProblemView). A SID or a STAR typed among
/// them ("KMSP BAEE1 BAE ... OSH OSHH2 KATW") is the route's procedure, not
/// a point, named with the points typed either side of it. All of it is
/// the engine's `route_typed`, one call for the whole text, as the web's
/// route box reads it (routeEdit's readTyped).
enum TypedRoute {
    struct Read: Equatable, Sendable {
        var dep: String
        var stops: [String]
        var dest: String
        /// The cruise a level group asked for, feet MSL; nil for none or VFR's.
        var cruiseFt: Double?
        /// The SIDs and STARs typed, to be picked at the route's ends.
        var procedures: [EngineContract.RouteTypedAnswerProceduresItem] = []
    }

    /// The route the words say; nil where they name fewer than two points.
    /// Thrown where the engine cannot read them.
    static func read(_ text: String) throws -> Read? {
        let read = try Engine.routeTyped(words: text.split(whereSeparator: \.isWhitespace).map(String.init))
        // The words read, less the procedures: the engine's `points` also
        // leaves out what is not a stop's ident, but a position's
        // "@42.1,-88.2" (From My Position's, RouteExtras.position) is a
        // stop here, and an airway typed is kept for FPL to say it knows
        // no place by it, with its Remove (PlanProblemView), as before.
        let names = Set(read.procedures.map(\.name))
        let points = read.words.filter { !names.contains($0) }
        guard let dep = points.first, let dest = points.last, points.count >= 2 else { return nil }
        return Read(dep: dep, stops: Array(points.dropFirst().dropLast()), dest: dest, cruiseFt: read.cruiseFt, procedures: read.procedures)
    }

    /// The typed SIDs and STARs as picks, each found among its field's
    /// procedures as the web's typedProcedure finds it: a departure from
    /// `dep`, its transition the point typed after it where the procedure
    /// has that transition, else an arrival into `dest` by the point
    /// before it. `missed` names those neither field publishes; `list` is
    /// a field's procedures (Planner.procedures), nil where it could not
    /// be had.
    @MainActor
    static func picks(_ read: Read, list: @MainActor (String) async -> ProcedureList?) async -> (picks: [ProcedurePick], missed: [String]) {
        var picks: [ProcedurePick] = []
        var missed: [String] = []
        var lists: [String: ProcedureList?] = [:]
        for typed in read.procedures {
            var found: ProcedurePick?
            for (field, kind, join) in [(read.dep, "departure", typed.after), (read.dest, "arrival", typed.before)] {
                if lists[field] == nil { lists[field] = .some(await list(field)) }
                guard let listed = lists[field] ?? nil,
                      let procedure = listed.procedures.first(where: { $0.kind == kind && $0.id == typed.name }) else { continue }
                let transition = join.flatMap { procedure.transitions.contains($0) ? $0 : nil }
                found = ProcedurePick(ident: field, id: procedure.id, kind: kind, name: procedure.name, transition: transition)
                break
            }
            if let found {
                picks.removeAll { $0.ident == found.ident && $0.kind == found.kind }
                picks.append(found)
            } else {
                missed.append(typed.name)
            }
        }
        return (picks, missed)
    }

    /// What is said where typed procedures were not found, the web's words:
    /// "OSHH3 is not a departure from KMSP or an arrival into KATW".
    static func missedWords(_ missed: [String], read: Read) -> String {
        "\(missed.joined(separator: " and ")) \(missed.count > 1 ? "are" : "is") not a departure from \(read.dep) or an arrival into \(read.dest). "
            + "A SID is typed after the departure and a STAR before the destination, as in a filed route."
    }

    /// The route as the field starts with it: its points in order, a space
    /// between, so a pilot edits the route there rather than typing it again.
    static func words(dep: String, stops: [String], dest: String) -> String {
        ([dep] + stops + [dest]).filter { !$0.isEmpty }.joined(separator: " ")
    }
}

extension Plan {
    /// The route typed whole put in place of the one there, at the cruise
    /// it asks for where it asks one (the pilot's own, as a clearance's
    /// "maintain" is), with the typed SIDs and STARs picked in place of the
    /// fields' picks of their kind, planned again. Undo takes it back
    /// ("Route replaced").
    func useTypedRoute(_ read: TypedRoute.Read, picks: [ProcedurePick] = []) {
        dep = read.dep
        stops = read.stops
        dest = read.dest
        for pick in picks {
            procedures.removeAll { $0.ident == pick.ident && $0.kind == pick.kind }
            procedures.append(pick)
        }
        if let feet = read.cruiseFt {
            ownAltitudeFt = feet
            ownAltitudeLegal = false
        }
        plan()
    }
}

extension Plan {
    /// Words typed into FPL's route box after its last pill, read with the
    /// route's own points before them, so a field typed there is the new
    /// destination and the old one a stop on the way, as Maps' Add Stop
    /// does and the web's box takes what is typed after the destination
    /// (RouteBox); a whole route typed into an empty one is the route. A
    /// SID or a STAR among them is looked up in its field's procedures
    /// first. Planned, nil; else why not, to say under the box.
    func typeRoute(_ typed: String) async -> String? {
        let text = "\(TypedRoute.words(dep: dep, stops: stops, dest: dest)) \(typed)"
        let read: TypedRoute.Read
        do {
            guard let typed = try TypedRoute.read(text) else {
                return "A route needs two points at least: where it leaves from and where it lands."
            }
            read = typed
        } catch {
            return Problems.say("The route couldn't be read", error)
        }
        guard !read.procedures.isEmpty else {
            useTypedRoute(read)
            return nil
        }
        let found = await TypedRoute.picks(read) { try? await Planner.procedures($0) }
        guard found.missed.isEmpty else { return TypedRoute.missedWords(found.missed, read: read) }
        useTypedRoute(read, picks: found.picks)
        return nil
    }
}
