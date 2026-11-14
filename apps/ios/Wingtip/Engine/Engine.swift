import Foundation
import os
import Synchronization
import WingtipEngine

/// wingtip-engine, the planner's own Rust, through the Swift uniffi-bindgen
/// writes from it (engine/bindings/ffi, the WingtipEngine module): the same
/// figures the planner works out, here with no network. Each pack is
/// handed over by its file's path, and the engine maps it for the call.
enum Engine {
    /// The coders every call shares, made once: a JSONEncoder and a
    /// JSONDecoder were made for each call, and a fix a second asks the
    /// engine several times (underway, the traffic's marks). Keys as
    /// written, as the servers' generated types write theirs; the app's
    /// own camel-case types are Planner.snakeEncoder's and
    /// Planner.snakeCase's.
    static let encoder = JSONEncoder()
    static let decoder = JSONDecoder()
    /// Each call an interval in Instruments ("engine", the rule's name),
    /// under the app's subsystem beside the tiles' ("tile").
    private static let signposter = OSSignposter(subsystem: "app.wingtipmaps.ios", category: "engine")

    /// The planner's AirspaceAt for a point, from the region's phone pack
    /// (nil for a region with no pack: nothing is drawn there), as
    /// /api/airspace/at answers it but for what a pack cannot hold -- the
    /// ground's height, the TFRs, the fix the point is named off. Nil where
    /// the file is not a pack the engine reads.
    static func airspaceAt(pack: URL?, lat: Double, lon: Double, groundFt: Double? = nil) -> AirspaceAt? {
        guard let json = try? WingtipEngine.airspaceAt(pack: pack?.path, lat: lat, lon: lon, groundFt: groundFt) else { return nil }
        return try? Planner.json.decode(AirspaceAt.self, from: Data(json.utf8))
    }

    /// Whether every byte of a pack is as the planner wrote it, the bytes
    /// borrowed for the call, not copied.
    static func verify(_ pack: Data) -> Bool {
        (try? packVerify(pack: pack)) ?? false
    }

    /// The region whose pack holds a point ("n40w088"), the engine's
    /// `region_of` by name, remembered by the whole degree the point is
    /// in: the engine's regions are squares of REGION_DEG (4) whole
    /// degrees from the equator and the meridian (airspace pack_query.rs
    /// region_of), so every point of one degree's cell is in the same
    /// region. A pan asked tens of these a frame (CyclePacks.packs).
    static func region(lat: Double, lon: Double) -> String {
        let cell = RegionCell(lat: Int(lat.rounded(.down)), lon: Int(lon.rounded(.down)))
        if let known = regions.withLock({ $0[cell] }) { return known }
        guard let name = try? call("region_of", json: ["lat": lat, "lon": lon]) as String else { return "" }
        regions.withLock { $0[cell] = name }
        return name
    }

    private struct RegionCell: Hashable { let lat: Int; let lon: Int }
    private static let regions = Mutex<[RegionCell: String]>([:])

    /// What the radio said, all the phone can make of it with no signal
    /// (wingtip_engine::spoken::hear): the clearance read into its items,
    /// whether it was said to `tail`, where its "direct" sends us, the
    /// places it named found in the kept packs, and the route it gives
    /// from the one planned. Its SID and STAR are the planner's to find.
    struct Heard: Decodable {
        struct Route: Decodable, Equatable { let dep: String; let stops: [String]; let dest: String }
        let clearance: Clearance
        let forUs: Bool
        let direct: String?
        let directFound: ClearancePlaces.Place?
        let found: ClearancePlaces
        let route: Route
        let typed: [Clearance.Typed]
    }

    static func hear(_ heard: String, tail: String?, packs: [URL], near: [(Double, Double)],
                     dep: String, stops: [String], dest: String) -> Heard? {
        guard let json = try? clearanceHear(heard: heard, tail: tail, packs: packs.map(\.path), nearLat: near.map(\.0),
                                            nearLon: near.map(\.1), dep: dep, stops: stops, dest: dest) else { return nil }
        return try? decoder.decode(Heard.self, from: Data(json.utf8))
    }

    // MARK: - Any rule by its name

    /// What the engine said was wrong with a call, in its own words (a
    /// name it has no rule for, an input not of the rule's shape).
    struct Refused: Error, LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    /// A rule of the engine by its name, as the web app's callEngine and
    /// the planner's wingtip_native.call ask it (the engine's `call`): one
    /// way in, so a rule moved into the engine needs no new binding. call.rs lists
    /// every name with its input's keys, which are the rule's own --
    /// mostly snake case, camel case where the gateway's are -- so the
    /// input is encoded as written unless the caller says otherwise, and
    /// the answer decoded with the decoder the rule's keys want.
    static func call<Out: Decodable>(_ name: String, _ input: some Encodable, encoder: JSONEncoder = Engine.encoder,
                                     decoder: JSONDecoder = Engine.decoder) throws -> Out {
        let asked = try String(decoding: encoder.encode(input), as: UTF8.self)
        return try decoder.decode(Out.self, from: Data(called(name, asked).utf8))
    }

    /// The way in for the generated functions (Engine/Generated/EngineCalls.swift,
    /// one per rule of engine/contract/engine.schema.json): the input and
    /// answer are the contract's types, so their keys are the rule's own
    /// and no strategy is applied. A refusal is logged by `called`; an
    /// answer that is not the contract's shape is logged here, so neither
    /// reaches a screen as a default value unseen.
    static func rule<In: Encodable, Out: Decodable>(_ name: String, _ input: In) throws -> Out {
        let asked = try String(decoding: encoder.encode(input), as: UTF8.self)
        let text = try called(name, asked)
        do {
            return try decoder.decode(Out.self, from: Data(text.utf8))
        } catch {
            Log.engine.error("\(name, privacy: .public) answered outside its contract: \(String(describing: error), privacy: .public)")
            throw error
        }
    }

    /// One type read as another of the same members by name, through the
    /// JSON both write: for a rule whose contract types a member the app
    /// already has a model of (the gateway's logbook entry) only loosely.
    static func recoded<Out: Decodable>(_ value: some Encodable, encoder: JSONEncoder = Engine.encoder,
                                        decoder: JSONDecoder = Engine.decoder) throws -> Out {
        try decoder.decode(Out.self, from: encoder.encode(value))
    }

    /// The same with the input as a JSON object written out in place, for
    /// an input with members of several types; nil is JSON's null, which
    /// the engine reads as a member left out.
    static func call<Out: Decodable>(_ name: String, json input: [String: Any?], decoder: JSONDecoder = Engine.decoder) throws -> Out {
        try decoder.decode(Out.self, from: Data(called(name, written(input)).utf8))
    }

    /// The answer as JSONSerialization reads it, for an answer with no
    /// fixed shape worth a type.
    static func callJSON(_ name: String, _ input: [String: Any?]) throws -> Any {
        try JSONSerialization.jsonObject(with: Data(called(name, written(input)).utf8), options: .fragmentsAllowed)
    }

    /// The engine's answer as the text it wrote, the input written as
    /// every call here writes it: for BridgeFixturesTests, which hold this
    /// bridge's text to the shared fixtures before any decoder reads it.
    static func callText(_ name: String, _ input: [String: Any?]) throws -> String {
        try called(name, written(input))
    }

    /// The engine's answer as text, or its complaint thrown.
    private static func called(_ name: String, _ input: String) throws -> String {
        let interval = signposter.beginInterval("engine", id: signposter.makeSignpostID(), "\(name, privacy: .public)")
        defer { signposter.endInterval("engine", interval) }
        do {
            return try WingtipEngine.call(name: name, input: input)
        } catch let EngineError.Refused(text) {
            // The rule's name is the engine's own; its input may hold a
            // position, so only the complaint is logged.
            Log.engine.error("\(name, privacy: .public) refused: \(text, privacy: .private)")
            throw Refused(message: text)
        }
    }

    /// An object of Swift values as JSON text. JSONSerialization raises an
    /// Objective-C exception, which Swift cannot catch, on what JSON cannot
    /// hold (a NaN), so the object is checked first.
    private static func written(_ input: [String: Any?]) throws -> String {
        let object = plain(input)
        guard JSONSerialization.isValidJSONObject(object) else { throw Refused(message: "The engine's input is not JSON: \(input)") }
        return try String(decoding: JSONSerialization.data(withJSONObject: object), as: UTF8.self)
    }

    /// A value with every nil inside it, at any depth, made NSNull.
    private static func plain(_ value: Any?) -> Any {
        guard let value else { return NSNull() }
        if let optional = value as? AnyOptional { return plain(optional.unwrapped) }
        if let object = value as? [String: Any?] { return object.mapValues { plain($0) } }
        if let object = value as? [String: Any] { return object.mapValues { plain($0) } }
        if let list = value as? [Any?] { return list.map { plain($0) } }
        if let list = value as? [Any] { return list.map { plain($0) } }
        return value
    }
}

/// An Optional seen through Any, so Engine.plain can unwrap one nested
/// in an array or an object.
private protocol AnyOptional {
    var unwrapped: Any? { get }
}

extension Optional: AnyOptional {
    fileprivate var unwrapped: Any? { map { $0 as Any } }
}
