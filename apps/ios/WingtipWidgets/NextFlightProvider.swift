import WidgetKit

/// Next Flight's timeline, by its settings (NextFlightIntent): the plan on
/// the page is the app's own snapshot (WidgetSnapshot), redrawn the
/// moment it changes (WidgetFeed); a saved flight is the gateway's as the
/// app last listed it (WidgetStore), with its departure's weather asked
/// of the planner here (WidgetFetch) and no Go / No-Go, which is asked
/// only for the plan on the page. One entry each time; nothing to
/// schedule ahead.
struct NextFlightProvider: AppIntentTimelineProvider {
    /// How long the entry stands before the system asks again.
    static let refreshAfter: TimeInterval = 15 * 60

    func placeholder(in context: Context) -> FlightEntry {
        FlightEntry(date: Date(), flight: .sample)
    }

    func snapshot(for configuration: NextFlightIntent, in context: Context) async -> FlightEntry {
        FlightEntry(date: Date(), flight: context.isPreview ? .sample : await Self.flight(configuration.flight))
    }

    func timeline(for configuration: NextFlightIntent, in context: Context) async -> Timeline<FlightEntry> {
        let now = Date()
        let entry = FlightEntry(date: now, flight: await Self.flight(configuration.flight))
        return Timeline(entries: [entry], policy: .after(now.addingTimeInterval(Self.refreshAfter)))
    }

    /// The flight picked: the plan on the page where none is, or the
    /// saved one is gone from the list.
    static func flight(_ choice: WidgetFlightChoice?) async -> WidgetSnapshot? {
        guard let id = choice?.savedID, let saved = WidgetStore.savedFlights().first(where: { $0.id == id }) else {
            return WidgetSnapshot.read()
        }
        let weather: WidgetFetch.FieldWeather? = switch await WidgetFetch.weather(saved.dep) {
        case .fresh(let w), .kept(let w): w
        case .signedOut, .none: nil
        }
        return WidgetSnapshot(
            dep: saved.dep, dest: saved.dest, stops: saved.stops,
            distanceNm: saved.distanceNm, eteMin: saved.eteMin, fuelGal: saved.fuelGal,
            verdict: nil, verdictWords: nil,
            depMetarRaw: weather?.report?.raw, depFlightCategory: weather?.report?.flightCategory, depWind: nil,
            updatedAt: weather?.fetchedAt ?? Date())
    }
}
