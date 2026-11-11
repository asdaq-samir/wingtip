import SwiftUI
import WidgetKit

/// A field's weather on the Home Screen and the Lock Screen: the airport
/// the pilot picks in the widget's settings (AirportWeatherIntent, the
/// home base offered first), its flight category, its METAR as sent and
/// its TAF as issued, which the widget asks the planner for itself on its
/// own timeline (WidgetFetch.weather), every half hour: a METAR is hourly,
/// with specials between, and the widget is read at a glance, not flown
/// by. The reports are never reworded; the time they were had is shown.
struct AirportWeatherWidget: Widget {
    static let kind = "AirportWeatherWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: Self.kind, intent: AirportWeatherIntent.self, provider: AirportWeatherProvider()) { entry in
            AirportWeatherView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Airport Weather")
        .description("An airport's METAR and TAF, as sent.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular, .accessoryInline])
    }
}

struct AirportWeatherEntry: TimelineEntry {
    let date: Date
    /// The field picked; nil until one is.
    let ident: String?
    let weather: WidgetFetch.FieldWeather?
    /// Whether the weather is the last kept, a new one not to be had.
    var kept = false
}

struct AirportWeatherProvider: AppIntentTimelineProvider {
    static let refreshAfter: TimeInterval = 30 * 60

    func placeholder(in context: Context) -> AirportWeatherEntry {
        AirportWeatherEntry(date: Date(), ident: "KMSN", weather: .sample)
    }

    func snapshot(for configuration: AirportWeatherIntent, in context: Context) async -> AirportWeatherEntry {
        context.isPreview ? placeholder(in: context) : await entry(configuration)
    }

    func timeline(for configuration: AirportWeatherIntent, in context: Context) async -> Timeline<AirportWeatherEntry> {
        let entry = await entry(configuration)
        return Timeline(entries: [entry], policy: .after(entry.date.addingTimeInterval(Self.refreshAfter)))
    }

    private func entry(_ configuration: AirportWeatherIntent) async -> AirportWeatherEntry {
        guard let ident = configuration.airport?.id else { return AirportWeatherEntry(date: Date(), ident: nil, weather: nil) }
        switch await WidgetFetch.weather(ident) {
        case .fresh(let weather): return AirportWeatherEntry(date: Date(), ident: ident, weather: weather)
        case .kept(let weather): return AirportWeatherEntry(date: Date(), ident: ident, weather: weather, kept: true)
        case .signedOut, .none: return AirportWeatherEntry(date: Date(), ident: ident, weather: nil)
        }
    }
}

private struct AirportWeatherView: View {
    @Environment(\.widgetFamily) private var family
    let entry: AirportWeatherEntry

    var body: some View {
        if let ident = entry.ident {
            switch family {
            case .accessoryRectangular: lock(ident)
            case .accessoryCircular: circle(ident)
            case .accessoryInline: Text("\(ident) \(entry.weather?.report?.flightCategory ?? "—")")
            case .systemMedium: card(ident, taf: true)
            default: card(ident, taf: false)
            }
        } else {
            VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                Label("Airport Weather", systemImage: "cloud.sun")
                    .font(.headline)
                    .foregroundStyle(WingtipInk.tint)
                Text("Touch and hold to choose an airport.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    private func card(_ ident: String, taf: Bool) -> some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            HStack(spacing: WingtipSpace.sm) {
                Text(ident).font(.headline)
                CategoryChip(category: entry.weather?.report?.flightCategory)
            }
            if let name = entry.weather?.name, !family.isSmall || name.count < 22 {
                Text(name).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
            if let report = entry.weather?.report?.raw {
                // The report as sent, never reworded.
                Text(report).font(.caption2.monospaced()).lineLimit(taf ? 2 : 4)
            } else {
                Text(entry.weather == nil ? "No answer from the planner." : "No report within 10 statute miles.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if taf, let forecast = entry.weather?.taf {
                Text(forecast).font(.caption2.monospaced()).foregroundStyle(.secondary).lineLimit(3)
            }
            Spacer(minLength: 0)
            AsOf(weather: entry.weather, kept: entry.kept)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .combine)
    }

    /// The Lock Screen's circle: the ident over its category, the word
    /// itself, never the colour alone.
    private func circle(_ ident: String) -> some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Text(ident).font(.caption2.weight(.semibold)).widgetAccentable()
                Text(entry.weather?.report?.flightCategory ?? "—").font(.headline)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func lock(_ ident: String) -> some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
            HStack(spacing: WingtipSpace.xs) {
                Text(ident).font(.headline).widgetAccentable()
                Text(entry.weather?.report?.flightCategory ?? "—").font(.headline)
            }
            Text(entry.weather?.report?.raw ?? "No report")
                .font(.caption2.monospaced())
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// The flight category in its colour, as the map's pip and the airport
/// card say it (FlightCategory.words).
private struct CategoryChip: View {
    let category: String?

    var body: some View {
        if let category {
            Text(category)
                .font(.caption.weight(.bold))
                .foregroundStyle(Color(uiColor: FlightCategory.words(category)))
                .widgetAccentable()
        }
    }
}

/// When the report was had, and that it is the last kept where the
/// planner could not be reached; the station's ident where the report is
/// a neighbour's.
private struct AsOf: View {
    let weather: WidgetFetch.FieldWeather?
    let kept: Bool

    var body: some View {
        if let weather, let at = weather.fetchedAt {
            HStack(spacing: WingtipSpace.xs) {
                if let from = weather.reportFrom { Text("From \(from)") }
                // Not live: when it was had (HIG Widgets), as reports say it.
                Text("\(kept ? "Kept" : "Updated") \(Format.zulu(at))")
            }
            .font(.caption2)
            .foregroundStyle(kept ? WingtipInk.caution : .secondary)
        }
    }
}

private extension WidgetFamily {
    var isSmall: Bool { self == .systemSmall }
}

extension WidgetFetch.FieldWeather {
    /// What the gallery and the placeholder show.
    static let sample = WidgetFetch.FieldWeather(
        ident: "KMSN", name: "Dane County Regional",
        metar: .init(raw: "KMSN 091253Z 27010KT 10SM FEW050 12/03 A3012", flightCategory: "VFR", observedAt: nil),
        taf: "TAF KMSN 091120Z 0912/1012 27012KT P6SM FEW050", nearbyMetar: nil, fetchedAt: Date())
}
