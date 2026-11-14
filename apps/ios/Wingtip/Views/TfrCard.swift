import SwiftUI

/// A temporary flight restriction's card, from a tap on one (the airspace
/// card's TFR rows) or its link (`tfr=6/4116`), as the web's TfrCard (the
/// owner's iPhone screenshot of TFR 6/4116 near Grand Forks, 2026-11-14):
/// "TFR 6/4116" with its kind and Active or Later as a badge under it
/// (rules.md §9), Share at the bar's start sending its link; then its
/// altitudes and where (the engine's tfr_read), when it is in force, the
/// rule it is under, and its NOTAM on tfr.faa.gov. A TFR the list no longer
/// has (ended or cancelled) says so, its NOTAM's page still a tap away.
struct TfrCard: View {
    let notamId: String
    @State private var tfr: APITfr?
    @State private var problem: String?
    @State private var gone = false

    var body: some View {
        List {
            Section {
                VStack(spacing: WingtipSpace.xs) {
                    Text("TFR \(notamId)").font(WingtipType.card).accessibilityAddTraits(.isHeader)
                    if let tfr {
                        HStack(spacing: WingtipSpace.sm) {
                            if let kind = tfr.kind { Text(kind).font(.subheadline).foregroundStyle(.secondary) }
                            TimelineView(.everyMinute) { context in
                                let active = Self.active(tfr, now: context.date)
                                StatusBadge(active ? .active : .later).accessibilityIdentifier(active ? "status-active" : "status-later")
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity)
                .listRowBackground(Color.clear)
            }
            if let tfr {
                let read = try? Engine.tfrRead(kind: tfr.kind, rule: tfr.rule, floorFt: tfr.floorFt, floorRef: tfr.floorRef,
                                               ceilingFt: tfr.ceilingFt, ceilingRef: tfr.ceilingRef)
                Section {
                    if let place = read?.where { Text(place) }
                    if let times = Self.times(tfr) { Text(times).accessibilityIdentifier("tfr-times") }
                    // Its purpose, or the rule it is under with its section.
                    if let purpose = tfr.purpose.map(AirportWords.faaWords) ?? read?.rule { Text(purpose).accessibilityIdentifier("tfr-purpose") }
                }
            } else if gone || problem != nil {
                Section {
                    Text(problem ?? "Not on tfr.faa.gov's list now: ended or cancelled.").foregroundStyle(.secondary)
                }
            } else {
                Section { ProgressView("Fetching the TFRs…") }
            }
            Section {
                Link("The NOTAM on tfr.faa.gov", destination: AirspaceCard.tfrPage(notamId))
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("TFR \(notamId)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(removing: .title)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                ShareLink(item: Self.link(notamId), subject: Text("TFR \(notamId)")) { Label("Share", systemImage: WingtipIcon.share) }
            }
        }
        .task(id: notamId) {
            do {
                tfr = try await Planner.tfrs().first { $0.notamId == notamId }
                gone = tfr == nil
            } catch {
                problem = "The TFRs didn't load. Check tfr.faa.gov before flight."
            }
        }
    }

    /// Its own link, which opens this card.
    static func link(_ notamId: String) -> URL {
        Config.gateway.appending(path: Screen.linkPath).appending(queryItems: [URLQueryItem(name: LinkKey.tfr.rawValue, value: notamId)])
    }

    /// In force now: started (or no start given) and not yet ended.
    static func active(_ tfr: APITfr, now: Date) -> Bool {
        let from = FieldNotamWords.date(tfr.effective), to = FieldNotamWords.date(tfr.expires)
        return (from.map { $0 <= now } ?? true) && (to.map { now < $0 } ?? true)
    }

    /// When it is in force, in the device's own time with UTC beside it, as
    /// the web's tfrTimes: "Tue 6 Oct, 18:00 (2300Z) – 20:00 (0100Z)",
    /// "From Thu 1 Oct, 11:00 (1600Z) until further notice".
    static func times(_ tfr: APITfr) -> String? {
        let from = FieldNotamWords.date(tfr.effective), to = FieldNotamWords.date(tfr.expires)
        let day = Date.FormatStyle().weekday(.abbreviated).day().month(.abbreviated)
        let clock = { (d: Date) in "\(d.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute())) (\(Format.zulu(d)))" }
        switch (from, to) {
        case let (from?, to?):
            let sameDay = Calendar.current.isDate(from, inSameDayAs: to)
            return "\(from.formatted(day)), \(clock(from)) – \(sameDay ? "" : "\(to.formatted(day)), ")\(clock(to))"
        case let (from?, nil): return "From \(from.formatted(day)), \(clock(from)) until further notice"
        case let (nil, to?): return "Until \(to.formatted(day)), \(clock(to))"
        default: return nil
        }
    }
}

extension Planner {
    /// Every TFR tfr.faa.gov lists now and to come (/api/tfrs).
    static func tfrs() async throws -> [APITfr] {
        try await call { try await $0.tfrs(.init()).ok.body.json }.tfrs
    }
}
