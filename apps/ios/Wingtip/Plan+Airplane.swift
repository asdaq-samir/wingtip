import Foundation

/// The airplane the plan flies (docs/decisions/0011): none until the
/// pilot picks one by its N-number, its type's profile then, or for an
/// airplane of a type the planner has no profile for, its own figures
/// alone (the planner's aircraft "own"), and what the chip and the screens
/// read of it. No Cessna 172 figure, nor any other airplane's, fills a gap
/// in another's (the owner, 2026-11-09).
extension Plan {
    /// This app's mark for no airplane picked, as a kept plan stores it:
    /// never sent, as the planner takes no airplane as no `aircraft` at all
    /// (`plannerAircraft`).
    nonisolated static let noAirplane = "none"
    /// A pilot's own airplane of no stock type, flown on its own figures
    /// alone (the planner's wingtip.planning.OWN_AIRPLANE).
    nonisolated static let ownAirplane = "own"
    /// Whether an airplane has been picked, so its figures (time, fuel,
    /// groundspeed, weight and balance) may be shown; none is assumed.
    var airplaneChosen: Bool { aircraft != Plan.noAirplane }
    /// The airplane as the planner is asked it: the profile's name, nil
    /// with none picked, which it plans with no airplane (the owner,
    /// 2026-11-09: "don't assume"); an own airplane only once it has the
    /// cruise speed and burn the planner needs, asked for where they are
    /// missing (AskFigureRow) and planned with none till then.
    var plannerAircraft: String? {
        guard airplaneChosen else { return nil }
        return aircraft == Plan.ownAirplane && !figures.flyable ? nil : aircraft
    }
    /// The airplane as the chip names it: its N-number, else its type;
    /// nil with none picked, where the chip asks for one.
    var airplaneName: String? { tail ?? (airplaneChosen && aircraft != Plan.ownAirplane ? aircraft.uppercased() : nil) }

    /// The stock type flown, as a form or the logbook writes it: nil with
    /// none picked, or an own airplane of no stock type (its record's).
    var stockType: String? { airplaneChosen && aircraft != Plan.ownAirplane ? aircraft.uppercased() : nil }
    /// What the airplane's loading is kept under (Verdict): its type's
    /// profile, or an own airplane's N-number, each its own.
    var loadKey: String { aircraft == Plan.ownAirplane ? (tail ?? aircraft) : aircraft }

    /// The airplane a kept plan flew: the stock profile with no N-number
    /// was the profile every plan was once flown on unasked, so it is no
    /// airplane now (docs/decisions/0011), as the web's preferences took
    /// their stock default to NO_AIRPLANE.
    nonisolated static func airplane(kept: Kept) -> (aircraft: String, tail: String?) {
        if kept.tail == nil && kept.aircraft == keptDefault { return (noAirplane, nil) }
        return (kept.aircraft, kept.tail)
    }

    /// The profile an N-number flies on: its type's where the planner has
    /// one, else its own figures alone.
    nonisolated static func profile(type: String?, profiles: [String]) -> String {
        guard let type, profiles.contains(type) else { return ownAirplane }
        return type
    }

    /// An airplane by its N-number: one of the pilot's own with every
    /// figure its record keeps, on its type's profile or on those alone;
    /// else the figures kept on this device for it, on the FAA's
    /// registry's type's profile, or on those alone where the planner has
    /// none for its type (or the registry cannot be asked).
    func fly(tail: String, own: [OwnAircraftRecord], profiles: [AircraftProfile]) async {
        await fly(tail: tail, own: own, names: profiles.map(\.name))
    }

    /// The same by the stock profiles' names alone (Airplanes' books).
    func fly(tail: String, own: [OwnAircraftRecord], names: [String]) async {
        let tail = tail.uppercased()
        self.tail = tail
        if let mine = own.first(where: { $0.tailNumber.uppercased() == tail }) {
            let wanted = mine.typeDesignator.lowercased().filter { $0.isLetter || $0.isNumber }
            aircraft = Plan.profile(type: wanted, profiles: names)
            figures = Figures(mine)
        } else {
            figures = OwnFigureStore.load(tail)
            let registered = try? await Planner.registered(tail)
            // A type the engine cannot match flies on the pilot's own
            // figures alone (logged by Engine.rule).
            let type = registered.flatMap { try? Registered.profile(manufacturer: $0.manufacturer, model: $0.model, year: $0.year) }
            aircraft = Plan.profile(type: type, profiles: names.isEmpty ? type.map { [$0] } ?? [] : names)
        }
        if routed { plan() }
    }

    /// The pilot's airplanes in (signed in, or saved to): the N-number
    /// flown takes its record's figures, and is planned again where they
    /// changed.
    func took(records: [OwnAircraftRecord]) {
        guard let tail, let mine = records.first(where: { $0.tailNumber.uppercased() == tail.uppercased() }) else { return }
        took(Figures(mine), for: tail)
    }

    /// Figures saved for an airplane: flown at once where it is the one
    /// on the page, planned again.
    func took(_ new: Figures, for tail: String?) {
        guard self.tail?.uppercased() == tail?.uppercased(), figures != new else { return }
        figures = new
        if routed { plan() }
    }

    /// The stock profile a kept plan once flew on unasked, read back as
    /// no airplane (`airplane(kept:)`).
    nonisolated static let keptDefault = "c172"

    /// A type flown on the planner's profile for it, with no N-number and
    /// no figures of the pilot's: picked by the pilot by name (the demo
    /// flight), so it is their choice, not one assumed (decision 0011).
    /// Not planned here: the caller sets the route and plans it once.
    func flyType(_ profile: String) {
        tail = nil
        aircraft = profile
        figures = Figures()
    }

    /// No airplane: the route's own figures alone, planned again.
    func flyNoAirplane() {
        tail = nil
        aircraft = Plan.noAirplane
        figures = Figures()
        if routed { plan() }
    }
}
