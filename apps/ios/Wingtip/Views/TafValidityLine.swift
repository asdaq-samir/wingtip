import SwiftUI

/// A field's TAF's own times under its periods (the web's tafValidity,
/// 1dfd4a55a): when it was issued and to when it is valid, "TAF issued 11
/// 1130Z, valid to 12 1200Z", or once its period has ended, in the caution
/// colour, "TAF expired 12 1200Z: no forecast in force", so a TAF kept
/// from before the signal was lost is never read as today's forecast
/// (14 CFR 91.103). The words are TafValidity's, the state the engine's.
/// Warn, never limit: the periods still show.
struct TafValidityLine: View {
    let taf: String

    var body: some View {
        // No row for words that are not a TAF; read again each minute,
        // so the line turns at the period's end.
        if TafValidity.line(taf, now: .now) != nil {
            TimelineView(.everyMinute) { context in
                let said = TafValidity.line(taf, now: context.date)
                Text(said?.line ?? "")
                    .font(WingtipType.detail)
                    .foregroundStyle(said?.caution == true ? AnyShapeStyle(WingtipInk.caution) : AnyShapeStyle(.secondary))
                    .accessibilityIdentifier("taf-validity")
            }
        }
    }
}
