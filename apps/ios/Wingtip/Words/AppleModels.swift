import Foundation
import FoundationModels

/// Where Apple's model answers: on this iPhone, or on Apple's Private
/// Cloud Compute (iOS 27's PrivateCloudComputeLanguageModel, WWDC26
/// "Build with the new Apple Foundation Model on Private Cloud Compute").
enum ModelPlace: String, Equatable, Sendable {
    case device, cloud

    /// The model's name on the words it writes (Words.model).
    var model: String { self == .device ? "apple-on-device" : "apple-pcc" }

    static func of(model: String) -> ModelPlace { model == ModelPlace.cloud.model ? .cloud : .device }
}

/// Apple's models in the owner's order (2026-11-09, "Yes to AI cloud"):
/// the on-device model first; Apple's Private Cloud Compute where the
/// phone cannot (the model still downloading, a page it cannot read, an
/// answer it could not give or whose every sentence the guard dropped);
/// the planner's or the assistant's Claude only where a feature has such
/// a path and neither of Apple's could answer. Every answer from either
/// place passes the same guards (Words.checked, NumberGuard), and the
/// figures stay the engine's.
///
/// Private Cloud Compute keeps nothing: Apple's design is that a request's
/// data is used for that request only and never stored, and it needs no
/// account or key of the app's (WWDC26 session 319). It is free to an app
/// in the App Store Small Business Program with under 2 million
/// first-time downloads, within a daily limit per iCloud account, and
/// needs the Private Cloud Compute entitlement Apple assigns to the
/// developer account (developer.apple.com/private-cloud-compute). Until
/// the owner has it, Info.plist's WingtipPrivateCloudCompute is NO and
/// this path is never taken: the model is not even made.
enum AppleModels {
    /// The owner's switch, YES once Apple has assigned the account the
    /// entitlement and project.yml carries it.
    static var cloudEnabled: Bool { Bundle.main.object(forInfoDictionaryKey: "WingtipPrivateCloudCompute") as? Bool ?? false }

    /// Why Private Cloud Compute cannot answer here, else nil.
    static var cloudUnavailableWhy: String? {
        guard cloudEnabled else { return "Apple's Private Cloud Compute is not set up for this app." }
        if #available(iOS 27, *) {
            let model = PrivateCloudComputeLanguageModel()
            switch model.availability {
            case .available:
                return model.quotaUsage.isLimitReached ? "Today's use of Apple's Private Cloud Compute is used up." : nil
            case .unavailable(let reason):
                switch reason {
                case .deviceNotEligible: return "This iPhone cannot use Apple's Private Cloud Compute."
                case .systemNotReady: return "Apple's Private Cloud Compute is not ready on this iPhone."
                @unknown default: return "Apple's Private Cloud Compute is not available."
                }
            }
        }
        return "Apple's Private Cloud Compute needs iOS 27."
    }

    /// Where a model can answer now, in order.
    static var places: [ModelPlace] {
        var out: [ModelPlace] = []
        if OnDeviceWords.unavailableWhy == nil { out.append(.device) }
        if cloudUnavailableWhy == nil { out.append(.cloud) }
        return out
    }

    /// Why neither can answer, else nil: the on-device model's reason
    /// first, as it is the one a pilot can act on (Settings).
    static var unavailableWhy: String? {
        places.isEmpty ? (OnDeviceWords.unavailableWhy ?? cloudUnavailableWhy) : nil
    }

    /// A session on the model at `place`.
    static func session(_ place: ModelPlace, tools: [any Tool] = [], instructions: String) -> LanguageModelSession {
        if place == .cloud, #available(iOS 27, *) {
            return LanguageModelSession(model: PrivateCloudComputeLanguageModel(), tools: tools, instructions: instructions)
        }
        return LanguageModelSession(tools: tools, instructions: instructions)
    }

    /// Whether the model at `place` takes images (iOS 27's `.vision`).
    @available(iOS 27, *)
    static func reads(images place: ModelPlace) -> Bool {
        place == .cloud ? PrivateCloudComputeLanguageModel().capabilities.contains(.vision)
            : SystemLanguageModel.default.capabilities.contains(.vision)
    }

    /// `body` asked at each place in turn, until one answers with what
    /// `usable` keeps; else the last answer had, else the last error.
    static func attempt<T>(_ places: [ModelPlace] = places, usable: (T) -> Bool = { _ in true },
                           _ body: (ModelPlace) async throws -> T) async throws -> (value: T, place: ModelPlace) {
        var last: (value: T, place: ModelPlace)?
        var failure: (any Error)?
        for place in places {
            do {
                let value = try await body(place)
                if usable(value) { return (value, place) }
                last = (value, place)
                Log.words.info("the \(place.rawValue, privacy: .public) model's answer did not pass; next place")
            } catch {
                failure = error
                Log.words.notice("the \(place.rawValue, privacy: .public) model failed: \(error.localizedDescription, privacy: .public)")
            }
        }
        if let last { return last }
        throw failure ?? WordsUnavailable(why: unavailableWhy ?? "Apple's models could not answer.")
    }
}
