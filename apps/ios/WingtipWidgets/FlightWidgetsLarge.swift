import SwiftUI
import WidgetKit

// Next Flight's large and extra-large cards, each laid out for its own
// size rather than the small card stretched (HIG Widgets: "offer widgets
// in multiple sizes when doing so adds value", and a larger size shows
// more, not the same bigger). The large card reads top to bottom, as a
// Brief does: the route with its stops, the verdict and its words, the
// figures as three labelled tiles, then the departure's weather with the
// report as sent. The extra large, an iPad's alone, sets the same in
// three columns side by side, the way a kneeboard is read across.

/// The large card: the flight in rows.
struct LargeFlightCard: View {
    let flight: WidgetSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.md) {
            RouteTitle(flight: flight)
            StopsLine(flight: flight)
            VerdictBlock(flight: flight, lines: 3)
            FigureTiles(flight: flight)
            Divider()
            DepartureBlock(flight: flight, reportLines: 4)
            Spacer(minLength: 0)
            UpdatedLine(flight: flight)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .combine)
    }
}

/// The extra-large card (iPad): the route and its figures, the verdict,
/// the departure's weather, a column each.
struct ExtraLargeFlightCard: View {
    let flight: WidgetSnapshot

    var body: some View {
        HStack(alignment: .top, spacing: WingtipSpace.lg) {
            VStack(alignment: .leading, spacing: WingtipSpace.md) {
                RouteTitle(flight: flight)
                StopsLine(flight: flight)
                Spacer(minLength: 0)
                FigureTiles(flight: flight)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            Divider()
            VStack(alignment: .leading, spacing: WingtipSpace.md) {
                Text("Go / No-Go")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                VerdictBlock(flight: flight, lines: 6)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            Divider()
            VStack(alignment: .leading, spacing: WingtipSpace.md) {
                DepartureBlock(flight: flight, reportLines: 6)
                Spacer(minLength: 0)
                UpdatedLine(flight: flight)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .combine)
    }
}

/// The stops on the way, in order; nothing for a flight straight there.
private struct StopsLine: View {
    let flight: WidgetSnapshot

    var body: some View {
        if !flight.stops.isEmpty {
            Text("Via \(flight.stops.joined(separator: ", "))")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
    }
}

/// The verdict and the Brief's words for it, as many lines as there is room.
private struct VerdictBlock: View {
    let flight: WidgetSnapshot
    let lines: Int

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            VerdictLine(verdict: flight.verdict)
            if let words = flight.verdictWords {
                Text(words)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(lines)
            }
        }
    }
}

/// Distance, time en route and fuel, each a figure over its name.
private struct FigureTiles: View {
    let flight: WidgetSnapshot

    var body: some View {
        HStack(alignment: .top, spacing: WingtipSpace.md) {
            tile("Distance", flight.distanceNm.map { "\(Int($0.rounded())) nm" })
            tile("Time En Route", flight.eteMin.map(Format.duration))
            tile("Fuel", flight.fuelGal.map { String(format: "%.1f gal", $0) })
        }
    }

    private func tile(_ name: String, _ figure: String?) -> some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
            Text(figure ?? "—")
                .font(.title3.weight(.semibold).monospacedDigit())
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(name)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The departure's weather: its category and wind, and the METAR as sent.
private struct DepartureBlock: View {
    let flight: WidgetSnapshot
    let reportLines: Int

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            Text("Departure \(flight.dep)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            WeatherLine(flight: flight)
            if let raw = flight.depMetarRaw {
                // The report as sent, never reworded.
                Text(raw)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(reportLines)
            }
        }
    }
}

/// Not live: when the app last had it (HIG Widgets).
private struct UpdatedLine: View {
    let flight: WidgetSnapshot

    var body: some View {
        Text("Updated \(Format.zulu(flight.updatedAt))")
            .font(.caption2)
            .foregroundStyle(.tertiary)
    }
}

#Preview("Next Flight, large", as: .systemLarge) {
    FlightWidget()
} timeline: {
    FlightEntry(date: .now, flight: .sample)
}

#Preview("Next Flight, extra large", as: .systemExtraLarge) {
    FlightWidget()
} timeline: {
    FlightEntry(date: .now, flight: .sample)
}
