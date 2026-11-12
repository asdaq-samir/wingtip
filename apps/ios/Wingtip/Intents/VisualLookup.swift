import AppIntents
import Foundation
import Vision
#if canImport(VisualIntelligence)
import VisualIntelligence
#endif

/// The fields a camera look-up shows (Siri's camera mode, Visual
/// Intelligence's SemanticContentDescriptor answered by an
/// IntentValueQuery): a sectional's or a plate's ident, a METAR printout,
/// a field's sign. The picture is read on the phone (Vision's text
/// recognition) and every ident it holds found as Siri's own query finds
/// one (AirportEntityQuery), so a tap on a result opens the field's card
/// (OpenAirportIntent). The picture never leaves the phone; only the
/// idents read from it are looked up. The simulator's SDK has no
/// VisualIntelligence, so it is built for the phone only.
#if canImport(VisualIntelligence)
struct AirportVisualQuery: IntentValueQuery {
    /// At most this many idents read from one picture are looked up.
    static let most = 6

    func values(for input: SemanticContentDescriptor) async throws -> [AirportEntity] {
        guard let buffer = input.pixelBuffer else { return [] }
        let text = buffer.withUnsafeBuffer { pixels -> [String] in VisualRead.lines(pixels) }
        let idents = VisualRead.idents(in: text).prefix(Self.most)
        var found: [AirportEntity] = []
        for ident in idents {
            if let entity = try? await AirportEntityQuery().entities(for: [ident]).first, !entity.name.isEmpty || entity.city != nil {
                found.append(entity)
            }
        }
        return found
    }
}
#endif

/// The words in a picture and the idents among them, on the phone.
enum VisualRead {
    /// The picture's lines of text, as Vision reads them, most likely first.
    static func lines(_ pixels: CVPixelBuffer) -> [String] {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        let handler = VNImageRequestHandler(cvPixelBuffer: pixels)
        guard (try? handler.perform([request])) != nil else { return [] }
        return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    }

    /// The idents a picture's words hold, each once in the order read: a
    /// four-letter ICAO ident in the US's own regions (K, the lower 48;
    /// P, Alaska, Hawaii and the Pacific; FAA Order 7350.9, Location
    /// Identifiers), or a three-character FAA one with a figure in it
    /// (C81, 3CK) -- not a runway's "27", which has no letter.
    static func idents(in lines: [String]) -> [String] {
        var seen: Set<String> = []
        var out: [String] = []
        for line in lines {
            for word in line.uppercased().split(whereSeparator: { !$0.isLetter && !$0.isNumber }) {
                let w = String(word)
                guard isIdent(w), seen.insert(w).inserted else { continue }
                out.append(w)
            }
        }
        return out
    }

    static func isIdent(_ w: String) -> Bool {
        guard w.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) }) else { return false }
        if w.count == 4, let first = w.first, "KP".contains(first), w.dropFirst().allSatisfy(\.isLetter) { return true }
        return w.count == 3 && w.contains(where: \.isLetter) && w.contains(where: \.isNumber)
    }
}
