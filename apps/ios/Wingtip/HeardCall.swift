import Foundation

/// A transmission heard, and whether it was said to us, by the engine
/// (`our_call` and `direct_of`, the web app's lib/heardCall), both held to
/// the same fixture (heardCalls.json): our call sign at its start in the
/// forms AIM 4-2-4 lets it take, never a longer call sign that ends the
/// same (AIM 4-2-4 a.1); and where a "direct" sends us.
/// Each throws where the engine cannot answer; the listener says so.
enum HeardCall {
    static func ourCall(_ text: String, tail: String) throws -> Bool {
        try Engine.ourCall(text: text, tail: tail)
    }

    /// The place a "direct" sends us to, as words to find, or nil.
    static func directOf(_ text: String) throws -> String? {
        try Engine.directOf(text: text)
    }
}
