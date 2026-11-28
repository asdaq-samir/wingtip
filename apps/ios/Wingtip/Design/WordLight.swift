import os
import Synchronization

/// The share of their night inks the map's words take after dark, the
/// engine's map_dim_words (the web's mapDimWords and Android's MapDim, one
/// copy of the maths, its cases apps/web/src/lib/fixtures/mapDim.json): the
/// paper's light under the Dimmer against the towered blue's, floored under
/// the night's own contrast, in hundredths, so a word is as light as the
/// chart under it and no lighter (AIM 8-1-6). Every word on the map takes
/// the same share, so one brightness is asked once.
nonisolated enum WordLight {
    /// The last brightness and contrast asked, and the share the engine gave.
    private static let last = Mutex<(SIMD2<Double>, Double)?>(nil)

    static func share(brightness: Double, contrast: Double) -> Double {
        let key = SIMD2(brightness, contrast)
        if let kept = last.withLock({ $0 }), kept.0 == key { return kept.1 }
        let share: Double
        do {
            share = try Engine.mapDimWords(night: true, brightness: brightness, contrast: contrast).words
        } catch {
            // Numbers in, so only a broken engine fails here: said in the
            // log, and the words kept at their floor, never at full light.
            Log.engine.error("map_dim_words: \(error.localizedDescription, privacy: .public)")
            return WingtipDimmer.wordFloor
        }
        last.withLock { $0 = (key, share) }
        return share
    }
}
