import SwiftUI

/// The receiver's chip on the map: "Stratux · 12 targets · GPS", while one
/// has been heard; amber once it has gone quiet. Under it, whose position
/// own ship is when it is the receiver's ("Your position from Stratux"),
/// or why the receiver's is not used, and how old its NEXRAD is, so the
/// pilot can tell what on the map came from the receiver and when.
struct ReceiverChip: View {
    @Environment(Receiver.self) private var receiver
    @Environment(OwnShip.self) private var ownShip

    var body: some View {
        if Receiver.enabled, receiver.mode == .auto, let summary = receiver.summary {
            let name = receiver.picture?.receiver.name ?? "the receiver"
            let position = OwnShipSource.words(ownShip.weighed, name: name)
            let radar = ReceiverWords.radarAge(receiver.nexrad)
            let line = [summary, position, radar].compactMap(\.self).joined(separator: " · ")
            MapChip(line, systemImage: "dot.radiowaves.left.and.right", colour: receiver.live ? nil : WingtipInk.caution)
                .accessibilityLabel("ADS-B receiver: \(line)")
        }
    }
}

/// How the receiver's products are written on this phone.
enum ReceiverWords {
    /// "Radar from receiver 4 min": the newest NEXRAD block's age, by when
    /// it was heard; nil with none drawn.
    static func radarAge(_ nexrad: EngineContract.ReceiverNexradAnswer?, now: Date = Date()) -> String? {
        guard let at = nexrad?.at, nexrad?.levels.contains(where: { !$0.rects.isEmpty }) == true else { return nil }
        let minutes = max(0, Int(now.timeIntervalSince1970 - at) / 60)
        return "Radar from receiver \(minutes) min"
    }

    /// "Heard by Stratux 3 s ago" for an airplane the receiver hears.
    static func heard(_ hex: String, picture: EngineContract.ReceiverPicture?, now: Date = Date()) -> String? {
        guard let picture, let target = picture.targets.first(where: { $0.hex == hex.lowercased() }) else { return nil }
        let name = picture.receiver.name ?? "your receiver"
        return "Heard by \(name) \(max(0, Int(now.timeIntervalSince1970 - target.at))) s ago"
    }
}

/// The setting, in Setup's Map section: listen for a receiver on the
/// cockpit's Wi-Fi, or not; a menu, as a discrete setting is
/// (docs/decisions/0017).
struct ReceiverModePicker: View {
    @Environment(Receiver.self) private var receiver
    @Environment(OwnShip.self) private var ownShip

    var body: some View {
        if Receiver.enabled { rows }
    }

    @ViewBuilder private var rows: some View {
        Picker("ADS-B Receiver", selection: Bindable(receiver).mode) {
            ForEach(Receiver.Mode.allCases) { Text($0.label).tag($0) }
        }
        if receiver.mode == .auto, let summary = receiver.summary {
            LabeledContent("Heard", value: summary)
            LabeledContent("Position", value: ownShip.weighed?.source == .receiver ? "From \(receiver.picture?.receiver.name ?? "the receiver")" : "From this device")
        }
        ProblemLine(receiver.problem)
    }
}

/// The airport card's weather with no report from the weather service
/// (no signal, or none at the field): the METAR and TAF a receiver was
/// sent over FIS-B, as sent, with when each was heard; else `otherwise`.
struct ReceiverReportRows: View {
    @Environment(Receiver.self) private var receiver
    let ident: String
    let otherwise: String

    init(ident: String, otherwise: String) {
        self.ident = ident
        self.otherwise = otherwise
    }

    var body: some View {
        let reports = receiver.reports(ident)
        if reports?.metar == nil, reports?.taf == nil {
            Text(otherwise).foregroundStyle(.secondary)
        }
        if let metar = reports?.metar { Self.row(metar) }
        if let taf = reports?.taf { Self.row(taf) }
    }

    static func row(_ report: EngineContract.ReceiverReport) -> some View {
        let heard = AirportWords.observed(Date(timeIntervalSince1970: report.at))
        return VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            LabeledContent("\(report.kind) over FIS-B", value: heard)
            // The report as sent, never reworded.
            Text(report.text).font(.footnote.monospaced()).textSelection(.enabled)
        }
    }
}

/// The Brief's reports from the cockpit's receiver: each of the route's
/// fields' METAR and TAF that FIS-B sent, as sent, with when each was
/// heard, so the Brief has weather in the air with no internet. FIS-B is
/// not the only source of weather (AIM 4-5-9); the planner's briefing
/// stays the Brief.
struct ReceiverBriefSection: View {
    @Environment(Receiver.self) private var receiver
    let idents: [String]

    var body: some View {
        let heard = Receiver.enabled ? idents.compactMap { ident in receiver.reports(ident).map { (ident, $0) } } : []
        if heard.contains(where: { $0.1.metar != nil || $0.1.taf != nil }) {
            Section("From Your Receiver") {
                ForEach(Array(heard.enumerated()), id: \.offset) { _, field in
                    let reports = field.1
                    if let metar = reports.metar { ReceiverReportRows.row(metar) }
                    if let taf = reports.taf { ReceiverReportRows.row(taf) }
                }
            }
        }
    }
}
