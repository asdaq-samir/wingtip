import Foundation

/// A line typed into the one search and sent, or said into its
/// microphone, done (FieldCommands.read says what it means): a route of
/// idents planned, a place by name flown to, a field's card opened, a
/// screen opened by its word, a command in the words ("direct Janesville",
/// "maintain four thousand five hundred") done at once, anything else put
/// to the assistant. The plan's existing setters and the planner's
/// existing searches do the work; the host (the plan's sheet or the
/// strip) says where a card, a screen and a question go.
@MainActor
struct FieldRunner {
    let plan: Plan
    let ownShip: OwnShip
    let session: Session
    /// A screen by its word; why not, where it cannot open yet.
    let open: (FieldScreen) -> String?
    /// A field's card, by its ident.
    let card: (String) -> Void
    /// The question for the assistant.
    let ask: (String) -> Void
    /// The plan in sight once the route is set.
    let showPlan: () -> Void

    /// Done; nil, or why not, said where it was asked.
    func run(_ line: String) async -> String? {
        guard let command = FieldCommands.read(line) else { return nil }
        return await perform(command, text: line)
    }

    func perform(_ command: FieldCommand, text: String) async -> String? {
        switch command {
        case .open(let screen):
            return open(screen)
        case .field(let ident):
            card(ident)
            return nil
        case .route(let typedDep, let stops, let dest):
            return await route(dep: typedDep, stops: stops, dest: dest)
        case .place(let words):
            // The pilot's own commands in the words first, as the radio's
            // pill offers them: "direct Janesville", "altitude 5500".
            if let done = await spoken(text) { return done.isEmpty ? nil : done }
            if let why = await planTo(words) {
                // Not a place the search knows: a question after all.
                if !why.lowercased().contains("not found") { return why }
            } else {
                return nil
            }
            ask(text)
            return nil
        case .ask(let question):
            if let done = await spoken(question) { return done.isEmpty ? nil : done }
            ask(question)
            return nil
        }
    }

    /// Idents alone: one is the destination, from the route's departure,
    /// else the field nearest the airplane, else the pilot's home field.
    func route(dep typedDep: String?, stops: [String], dest: String) async -> String? {
        var dep = typedDep ?? plan.dep
        if dep.isEmpty {
            if let at = ownShip.fix?.coordinate, let near = try? await Planner.nearestOrPacks(lat: at.latitude, lon: at.longitude, limit: 1).fields.first {
                dep = near.ident
            }
            if dep.isEmpty, let home = session.pilot?.homeBase ?? FirstFlightModel.savedHome(), !home.isEmpty { dep = home.uppercased() }
            if dep.isEmpty { return "Say where from too: \"C81 KDLH\", or allow your position." }
        }
        if dep == dest, stops.isEmpty { return "\(dest) is where you are. Say somewhere to fly to." }
        plan.dep = dep
        plan.stops = stops
        plan.dest = dest
        plan.plan()
        showPlan()
        return nil
    }

    /// Direct To a field or a point: on the route, from the airplane to it
    /// and on; off it, a diversion from where the airplane is; with no
    /// position, a stop on the way (the radio's Direct To does the same).
    func directTo(_ ident: String) {
        if plan.idents.contains(ident) {
            plan.directTo(ident, from: ownShip.fix)
        } else if let fix = ownShip.fix {
            plan.divert(to: ident, from: fix)
        } else {
            plan.stops.append(ident)
            plan.plan()
        }
        showPlan()
    }

    /// A command in the words, done at once: "direct <place>" through the
    /// engine's direct_of, found near the route as a clearance's place is
    /// (Planner.clearancePlaces); an altitude said as a clearance says it
    /// ("maintain four thousand five hundred", the engine's read_clearance)
    /// flown as the pilot's own. Nil where the words hold no command; ""
    /// where one was done; else why not.
    func spoken(_ text: String) async -> String? {
        let direct: String?
        do { direct = try HeardCall.directOf(text) } catch { return "The words couldn't be read: \(error.localizedDescription)" }
        if let said = direct {
            guard plan.routed else { return "Direct To needs a route." }
            var near: [(Double, Double)] = []
            if let course = plan.course {
                near += [(course.departure.lat, course.departure.lon), (course.destination.lat, course.destination.lon)]
            }
            if let fix = ownShip.fix { near.append((fix.coordinate.latitude, fix.coordinate.longitude)) }
            let nearText = near.map { String(format: "%.3f,%.3f", $0.0, $0.1) }.joined(separator: ";")
            guard let found = try? await Planner.clearancePlaces(ClearanceAsk(near: nearText, route: [said])),
                  let ident = found.route?.first?.first(where: { $0.ident != nil })?.ident else {
                return "“\(said)” was not found near the route."
            }
            directTo(ident)
            return ""
        }
        let lower = text.lowercased()
        if lower.contains("altitude") || lower.contains("climb") || lower.contains("descend") || lower.contains("maintain"),
           let ft = (try? Clearance.read(text))?.maintainFt {
            guard plan.routed else { return "Plan a route first; then say an altitude, \"altitude 5500\"." }
            plan.ownAltitudeFt = Double(ft)
            plan.ownAltitudeLegal = false
            Feel.tap(.altitude)
            plan.plan()
            showPlan()
            return ""
        }
        return nil
    }

    /// A place by name through the planner's places search, and the
    /// biggest field by it (the longest runway of the nearest five) the
    /// route's end; nil once planned, else why not.
    func planTo(_ words: String) async -> String? {
        let found: [PlaceFound]
        do {
            found = try await Planner.places(words)
        } catch {
            return "The place could not be looked up: \(error.localizedDescription)"
        }
        guard let place = found.first else { return "“\(words)” was not found." }
        guard let fields = try? await Planner.nearestOrPacks(lat: place.lat, lon: place.lon, limit: 5).fields, !fields.isEmpty else {
            return "No field was found near \(place.label)."
        }
        let biggest = fields.max { ($0.longestRunwayFt ?? 0) < ($1.longestRunwayFt ?? 0) } ?? fields[0]
        return await route(dep: nil, stops: [], dest: biggest.ident)
    }
}
