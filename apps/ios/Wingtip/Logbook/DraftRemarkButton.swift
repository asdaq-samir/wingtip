import SwiftUI

/// Draft a Remark, under a logbook entry's Remarks field (Android's
/// AiDraftButton): a tap writes a remark from the entry's facts
/// (RemarkDraft) into the field, for the pilot to keep, change or clear;
/// nothing is saved until they Save. Shown only where Apple's on-device
/// model can run; why a draft could not be had is said in place.
struct DraftRemarkButton: View {
    let figures: () -> [WordsSource]
    let draft: (String) -> Void
    var device: any WordsProvider = OnDeviceWords()
    @State private var working = false
    @State private var problem: String?

    var body: some View {
        if AppleModels.unavailableWhy == nil {
            Button {
                working = true
                problem = nil
                Task {
                    switch await RemarkDraft.draft(figures(), device: device) {
                    case .success(let remark): draft(remark)
                    case .failure(let why): problem = why.why
                    }
                    working = false
                }
            } label: {
                HStack(spacing: WingtipSpace.sm) {
                    if working { ProgressView() } else { Image(systemName: "sparkles").accessibilityHidden(true) }
                    Text(working ? "Drafting a Remark…" : "Draft a Remark")
                }
            }
            .disabled(working)
            ProblemLine(problem)
        }
    }
}
