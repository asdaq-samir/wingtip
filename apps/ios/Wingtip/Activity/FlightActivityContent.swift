#if canImport(ActivityKit)
import Foundation

/// What the Live Activity shows, put together from the app's in-flight
/// models and nothing else: the engine's `in_flight` answer for the last
/// fix (InFlight.progress), the copilot's one message (Copilot), and the
/// frequency ATC last handed us (AtcCopilot's cards, read by the engine's
/// atc_call). No figure is worked out here; each is the engine's, carried
/// to the Lock Screen. Pure, so FlightActivityTests hold it.
enum FlightActivityContent {
    /// What the content is made from, taken off the models at one moment.
    struct Inputs {
        /// The airplane against its route at the last fix; nil before the
        /// first fix or where the engine refused it (InFlight.problem).
        var progress: InFlight.Progress?
        /// The route's length, for the miles to go before the first fix.
        var routeNm: Double
        /// Whether an airplane is picked: with none there is no fuel to
        /// show (docs/decisions/0011, never an assumed airplane).
        var airplaneChosen: Bool
        /// The usable fuel at the start, the plan's (Totals.usableFuelGal).
        var usableFuelGal: Double?
        var frequency: String?
        var copilot: Copilot.Message?
        /// The route's weather gone worse since the Brief (WeatherWatch).
        var weather: String? = nil
        var now: Date
        /// The phase the activity is in (FlightActivity.observe).
        var phase: FlightActivityAttributes.Phase = .airborne
        /// The departure's flight category as the Brief had it, and the
        /// planner's time en route, for the phase before departure.
        var depCategory: String? = nil
        var plannedEteMin: Double? = nil
        /// When the airplane came to rest, and when the activity started,
        /// for the arrived phase.
        var landedAt: Date? = nil
        var startedAt: Date? = nil
    }

    static func state(_ inputs: Inputs) -> FlightActivityAttributes.ContentState {
        let progress = inputs.progress
        let next = progress?.next
        let destination = progress?.destination
        // The fuel the plan expects left now, the engine's in_flight
        // fuel_now_gal: from the last fuel stop passed, the tanks filled
        // there, less the start and taxi allowance (AV-4) -- planning
        // data, as the nav log's fuel column is, not the airplane's gauge.
        // Before the first fix the plan's tanks are as they start.
        let fuelLeft: Double? = inputs.airplaneChosen ? (progress.map { $0.fuelNowGal } ?? inputs.usableFuelGal) : nil
        // A message the alerts-ahead banner draws is not the copilot's own.
        let message = inputs.copilot.flatMap { $0.elsewhere ? nil : $0 }
        // The share of the route flown, for the progress bar and arc: the
        // engine's miles along over its length, held to 0...1.
        let flown: Double? = progress.flatMap { $0.totalNm > 0 ? min(1, max(0, $0.alongNm / $0.totalNm)) : nil }
        // The block time as the phone saw it: from the activity's start
        // to the airplane at rest.
        let block: Double? = {
            guard let landed = inputs.landedAt, let started = inputs.startedAt, landed > started else { return nil }
            return landed.timeIntervalSince(started) / 60
        }()
        return FlightActivityAttributes.ContentState(
            phase: inputs.phase,
            progress: inputs.phase == .arrived ? 1 : flown,
            nextNm: next?.distanceNm,
            depCategory: inputs.depCategory,
            plannedEteMin: inputs.plannedEteMin,
            landedAt: inputs.landedAt,
            blockMin: block,
            nextFix: next.map(\.name),
            nextEteMin: next?.eteMin,
            toGoNm: progress?.leftNm ?? inputs.routeNm,
            destEteMin: destination?.eteMin,
            eta: destination?.etaS.map { Date(timeIntervalSince1970: $0) },
            fuelLeftGal: fuelLeft,
            frequency: inputs.frequency,
            copilot: message?.title,
            copilotWarns: message?.level == "warning",
            weather: inputs.weather,
            updatedAt: inputs.now)
    }

    /// The frequency ATC last handed us, in the call card's words
    /// ("Chicago approach 124.35"): the newest call with one. The cards
    /// are newest first (AtcCopilot.cards).
    static func frequency(in cards: [AtcCopilot.Card]) -> String? {
        for card in cards {
            if let item = card.items.last(where: { $0.kind == "frequency" && $0.mhz != nil }) { return item.words }
        }
        return nil
    }

    /// Whether a new state is worth sending: the Lock Screen is read at a
    /// glance and ActivityKit limits how often an activity changes, so a
    /// state goes at once when what it names changes (the next fix, the
    /// frequency, the copilot's message) and otherwise only every
    /// `every` seconds.
    static func due(_ state: FlightActivityAttributes.ContentState, after last: FlightActivityAttributes.ContentState?,
                    every: TimeInterval) -> Bool {
        guard let last else { return true }
        if state.phase != last.phase || state.nextFix != last.nextFix || state.frequency != last.frequency || state.copilot != last.copilot || state.weather != last.weather { return true }
        return state.updatedAt.timeIntervalSince(last.updatedAt) >= every
    }
}
#endif
