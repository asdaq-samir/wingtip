import SwiftUI

/// "Why This Altitude?" under the profile's altitude wheel: a tap has
/// Apple's on-device model explain the altitude flown from the engine's
/// own reasons (AltitudeWhy), each sentence with the chips of the reasons
/// it rests on; the engine's own sentences where the model's did not
/// pass. Asked again when the altitude changes. Hidden where Apple
/// Intelligence cannot run, and with no altitude.
struct AltitudeWhySection: View {
    let line: NavLogAltitude?
    let flownFt: Double?
    let choice: String?
    var model: any AltitudeWhyModel = AppleAltitudeWhy()
    @State private var answer: OnDeviceAnswer?
    @State private var writing = false

    private var key: String { "\(flownFt ?? line?.altitudeFt ?? 0)|\(choice ?? "")|\(line?.cautions?.count ?? 0)" }

    var body: some View {
        if AppleModels.unavailableWhy == nil, let line, let reasons = AltitudeWhy.reasons(line, flownFt: flownFt, choice: choice) {
            Group {
                if answer != nil || writing {
                    WordsSection(title: "Why This Altitude", said: answer.map { SaidWords(words: $0.words, origin: $0.origin == .device ? .device : $0.origin == .cloud ? .cloud : .none) },
                                 writing: writing)
                    if let why = answer?.why { Section { Text(why).font(WingtipType.note).foregroundStyle(.secondary) } }
                } else {
                    Section {
                        Button {
                            Task { await explain(reasons) }
                        } label: {
                            Label("Why This Altitude?", systemImage: "sparkles")
                        }
                    }
                }
            }
            .onChange(of: key) { _, _ in answer = nil }
        }
    }

    private func explain(_ reasons: AltitudeWhy.Reasons) async {
        writing = true
        defer { writing = false }
        answer = await AltitudeWhy.said(reasons, model: model)
    }
}
