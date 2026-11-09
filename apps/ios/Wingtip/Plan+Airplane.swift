import Foundation

/// The airplane the plan flies (docs/decisions/0011): none until the
/// pilot picks one by its N-number, its type's profile then, and what the
/// chip and the screens read of it.
extension Plan {
    /// The planner's name for no airplane picked (wingtip.planning.NO_AIRPLANE).
    nonisolated static let noAirplane = "none"
    /// Whether an airplane has been picked, so its figures (time, fuel,
    /// groundspeed, weight and balance) may be shown; none is assumed.
    var airplaneChosen: Bool { aircraft != Plan.noAirplane }
    /// The airplane as the chip names it: its N-number, else its type;
    /// nil with none picked, where the chip asks for one.
    var airplaneName: String? { tail ?? (airplaneChosen ? aircraft.uppercased() : nil) }

    /// The airplane a kept plan flew: the stock profile with no N-number
    /// was the profile every plan was once flown on unasked, so it is no
    /// airplane now (docs/decisions/0011), as the web's preferences took
    /// their stock default to NO_AIRPLANE.
    nonisolated static func airplane(kept: Kept) -> (aircraft: String, tail: String?) {
        if kept.tail == nil && kept.aircraft == stockProfile { return (noAirplane, nil) }
        return (kept.aircraft, kept.tail)
    }

    /// An airplane by its N-number: one of the pilot's own with its
    /// figures, else the FAA's registry's type on the planner's profile
    /// for it, where it has one; the profile in use stands otherwise.
    func fly(tail: String, own: [OwnAircraftRecord], profiles: [AircraftProfile]) async {
        let tail = tail.uppercased()
        self.tail = tail
        // The figures kept on this device for the N-number first, then the
        // pilot's own airplane's on the gateway, then the type's.
        let kept = TailFigures.load(tail)
        if let mine = own.first(where: { $0.tailNumber.uppercased() == tail }) {
            let wanted = mine.typeDesignator.lowercased().filter { $0.isLetter || $0.isNumber }
            // The pilot's own airplane flies on its own figures over its
            // type's profile, else over the stock one for the service
            // ceiling the altitudes need, as the web's baseProfile does.
            aircraft = profiles.contains(where: { $0.name == wanted }) ? wanted : Plan.stockProfile
            figures = kept.cruiseTasKt == nil && kept.serviceCeilingFt == nil ? Figures(mine) : kept
        } else {
            figures = kept
            if let registered = try? await Planner.registered(tail),
               // A type the engine cannot match keeps the airplane picked (logged by Engine.rule).
               let profile = try? Registered.profile(manufacturer: registered.manufacturer, model: registered.model, year: registered.year) {
                aircraft = profile
            }
        }
        if routed { plan() }
    }

    /// The profile a pilot's own airplane of a type the planner has no
    /// figures for is flown on, under the pilot's figures (the web's
    /// DEFAULT_AIRCRAFT): never flown with no airplane picked.
    nonisolated static let stockProfile = "c172"

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
