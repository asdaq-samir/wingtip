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
        var now: Date
    }

    static func state(_ inputs: Inputs) -> FlightActivityAttributes.ContentState {
        let progress = inputs.progress
        let next = progress?.next
        let destination = progress?.destination
        // The fuel the plan expects left now: the usable fuel less the
        // engine's planned burn to this point along the route (in_flight's
        // burnt_gal, motion::instruments) -- planning data, as the nav
        // log's fuel column is, not the airplane's gauge.
        let fuelLeft: Double? = {
            guard inputs.airplaneChosen, let usable = inputs.usableFuelGal else { return nil }
            return max(0, usable - (progress?.burntGal ?? 0))
        }()
        // A message the alerts-ahead banner draws is not the copilot's own.
        let message = inputs.copilot.flatMap { $0.elsewhere ? nil : $0 }
        return FlightActivityAttributes.ContentState(
            nextFix: next.map(\.name),
            nextEteMin: next?.eteMin,
            toGoNm: progress?.leftNm ?? inputs.routeNm,
            destEteMin: destination?.eteMin,
            eta: destination?.etaS.map { Date(timeIntervalSince1970: $0) },
            fuelLeftGal: fuelLeft,
            frequency: inputs.frequency,
            copilot: message?.title,
            copilotWarns: message?.level == "warning",
            updatedAt: inputs.now
        )
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
        if state.nextFix != last.nextFix || state.frequency != last.frequency || state.copilot != last.copilot { return true }
        return state.updatedAt.timeIntervalSince(last.updatedAt) >= every
    }
}
#endif
