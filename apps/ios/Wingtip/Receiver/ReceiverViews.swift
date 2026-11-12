import SwiftUI

/// The receiver's chip on the map: "Stratux · 12 targets · GPS", while one
/// has been heard; amber once it has gone quiet.
struct ReceiverChip: View {
    @Environment(Receiver.self) private var receiver

    var body: some View {
        if receiver.mode == .auto, let summary = receiver.summary {
            MapChip(summary, systemImage: "dot.radiowaves.left.and.right", colour: receiver.live ? nil : WingtipInk.caution)
                .accessibilityLabel("ADS-B receiver: \(summary)")
        }
    }
}

/// The setting, in Setup's Map section: listen for a receiver on the
/// cockpit's Wi-Fi, or not; a menu, as a discrete setting is
/// (docs/decisions/0017).
struct ReceiverModePicker: View {
    @Environment(Receiver.self) private var receiver

    var body: some View {
        Picker("ADS-B Receiver", selection: Bindable(receiver).mode) {
            ForEach(Receiver.Mode.allCases) { Text($0.label).tag($0) }
        }
        if receiver.mode == .auto, let summary = receiver.summary {
            LabeledContent("Heard", value: summary)
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
        if let metar = reports?.metar { row(metar) }
        if let taf = reports?.taf { row(taf) }
    }

    private func row(_ report: EngineContract.ReceiverReport) -> some View {
        let heard = AirportWords.observed(ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: report.at))) ?? ""
        return VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            LabeledContent("\(report.kind) over FIS-B", value: heard)
            // The report as sent, never reworded.
            Text(report.text).font(.footnote.monospaced()).textSelection(.enabled)
        }
    }
}
