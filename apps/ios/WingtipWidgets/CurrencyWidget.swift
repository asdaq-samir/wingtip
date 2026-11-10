import SwiftUI
import WidgetKit

/// Where the pilot stands, on the Home Screen and the Lock Screen: their
/// currency as the gateway works it out (GET /api/logbook/currency, the
/// engine's pilot_currency), read by the widget itself with the pilot's
/// own session from the App Group (WidgetFetch.currency), in the
/// Logbook's words (CurrencyWords). The small widget and the Lock Screen
/// show the one picked in its settings (CurrencyIntent); the medium shows
/// them all. Asked again every six hours, and just after midnight, when a
/// last good day can pass.
struct CurrencyWidget: Widget {
    static let kind = "CurrencyWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: Self.kind, intent: CurrencyIntent.self, provider: CurrencyProvider()) { entry in
            CurrencyView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Currency Status")
        .description("Passengers by day and at night, instrument, flight review and medical, from your logbook.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

struct CurrencyEntry: TimelineEntry {
    let date: Date
    let item: CurrencyItem
    let answer: WidgetFetch.Answer<WidgetFetch.Currency>
}

struct CurrencyProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> CurrencyEntry {
        CurrencyEntry(date: Date(), item: .dayPassengers, answer: .fresh(.sample))
    }

    func snapshot(for configuration: CurrencyIntent, in context: Context) async -> CurrencyEntry {
        context.isPreview ? placeholder(in: context) : CurrencyEntry(date: Date(), item: configuration.item, answer: await WidgetFetch.currency())
    }

    func timeline(for configuration: CurrencyIntent, in context: Context) async -> Timeline<CurrencyEntry> {
        let now = Date()
        let entry = CurrencyEntry(date: now, item: configuration.item, answer: await WidgetFetch.currency())
        let midnight = Calendar.current.nextDate(after: now, matching: DateComponents(hour: 0, minute: 1), matchingPolicy: .nextTime) ?? now
        return Timeline(entries: [entry], policy: .after(min(midnight, now.addingTimeInterval(6 * 3600))))
    }
}

extension CurrencyItem {
    var title: String {
        switch self {
        case .dayPassengers: "Passengers by Day"
        case .nightPassengers: "Passengers at Night"
        case .instrument: "Instrument"
        case .flightReview: "Flight Review"
        case .medical: "Medical"
        }
    }

    /// Its line from the gateway's days.
    func line(_ currency: WidgetFetch.Currency) -> CurrencyWords.Line {
        switch self {
        case .dayPassengers: CurrencyWords.until(currency.dayPassengersUntil)
        case .nightPassengers: CurrencyWords.until(currency.nightPassengersUntil)
        case .instrument: CurrencyWords.instrument(until: currency.instrumentCurrentUntil, from: currency.instrumentCurrentFrom,
                                                   ipcNeededAfter: currency.ipcNeededAfter)
        case .flightReview: CurrencyWords.until(currency.flightReviewUntil)
        case .medical: CurrencyWords.until(currency.medicalExpiresOn)
        }
    }
}

private struct CurrencyView: View {
    @Environment(\.widgetFamily) private var family
    let entry: CurrencyEntry

    var body: some View {
        switch entry.answer {
        case .fresh(let currency): lines(currency, kept: false)
        case .kept(let currency): lines(currency, kept: true)
        case .signedOut: note("Sign in to Wingtip Maps to see your currency.")
        case .none: note("Your currency could not be fetched.")
        }
    }

    @ViewBuilder private func lines(_ currency: WidgetFetch.Currency, kept: Bool) -> some View {
        switch family {
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                Text(entry.item.title).font(.headline).widgetAccentable()
                Text(entry.item.line(currency).words).font(.subheadline.monospacedDigit())
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
        case .systemMedium:
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                Title()
                ForEach(CurrencyItem.allCases, id: \.self) { item in
                    HStack {
                        Text(item.title).font(.caption)
                        Spacer(minLength: WingtipSpace.sm)
                        Standing(line: item.line(currency)).font(.caption.monospacedDigit())
                    }
                    .accessibilityElement(children: .combine)
                }
                Spacer(minLength: 0)
                Kept(currency: currency, kept: kept)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        default:
            VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                Title()
                Text(entry.item.title).font(.subheadline.weight(.semibold))
                Standing(line: entry.item.line(currency)).font(.subheadline.monospacedDigit())
                Spacer(minLength: 0)
                Kept(currency: currency, kept: kept)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .accessibilityElement(children: .combine)
        }
    }

    private func note(_ words: String) -> some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            if family != .accessoryRectangular { Title() }
            Text(words).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private struct Title: View {
    var body: some View {
        Label("Currency", systemImage: "person.text.rectangle")
            .font(.headline)
            .foregroundStyle(WingtipInk.tint)
    }
}

/// A line's words in its ink: current in the go green, not begun yet in
/// the caution amber, lapsed in the problem red, as the Logbook says them.
private struct Standing: View {
    let line: CurrencyWords.Line

    var body: some View {
        Text(line.words).foregroundStyle(ink)
    }

    private var ink: Color {
        switch line.standing {
        case .current: WingtipInk.go
        case .notYet: WingtipInk.caution
        case .lapsed: WingtipInk.problem
        }
    }
}

/// The last kept answer said as such, where the gateway could not be reached.
private struct Kept: View {
    let currency: WidgetFetch.Currency
    let kept: Bool

    var body: some View {
        if kept, let at = currency.fetchedAt {
            Text("Kept \(at, style: .date)").font(.caption2).foregroundStyle(WingtipInk.caution)
        }
    }
}

extension WidgetFetch.Currency {
    static let sample = WidgetFetch.Currency(
        dayPassengersUntil: "2026-12-30", nightPassengersUntil: "2026-10-02", instrumentCurrentUntil: "2027-03-31",
        instrumentCurrentFrom: nil, ipcNeededAfter: nil, flightReviewUntil: "2027-06-30", medicalExpiresOn: "2028-01-31", fetchedAt: Date())
}
