import Foundation
import Network
import Synchronization

/// The cockpit's ADS-B receiver heard on the Wi-Fi: GDL 90 sent to UDP
/// port 4000 (Garmin's GDL 90 Data Interface Specification, as Stratux,
/// Sentry, uAvionix's SkyEcho and a Stratus in open mode send it to the
/// phones that join them). The bytes are only gathered here; the engine
/// reads them (`receiver_delta`, Receiver). A receiver that sends to the
/// network's broadcast address, not to the phone, is heard only with
/// Apple's multicast entitlement, which this app does not yet hold.
///
/// Everything that changes is in one `State` behind one mutex, so the
/// compiler refuses a read or write that does not take it (the listener's
/// handlers run on its own queue, the reads on the main actor), and the
/// class is nonisolated: Network.framework calls it on that queue.
final nonisolated class ReceiverListener: Sendable {
    /// GDL 90's port over Wi-Fi, as the receivers and ForeFlight use it.
    static let port: NWEndpoint.Port = 4000

    private nonisolated struct State {
        var listener: NWListener?
        /// Every sender accepted, cancelled with the listener.
        var connections: [ObjectIdentifier: NWConnection] = [:]
        var gathered = Data()
        /// What stopped the listener, for the setting's row; nil while it runs.
        var problem: String?
        /// Watches the network once the listener has failed: it is tried
        /// again when the path changes (or the setting does, `stop`), not
        /// every second against a port that is still refused.
        var path: NWPathMonitor?
        var failedOn: NWPath?
    }

    private let queue = DispatchQueue(label: "app.wingtipmaps.receiver")
    private let state = Mutex(State())

    /// No more than this is kept between two reads (a second's worth of a
    /// busy receiver is some tens of kilobytes): a stalled app drops the
    /// oldest, which are stale by the time it reads them.
    private static let most = 512 * 1024

    /// Why the receiver is not being listened to, nil while it is.
    var problem: String? { state.withLock { $0.problem } }

    /// Listens, unless it is already or it failed on this network.
    func start() {
        state.withLock { s in
            guard s.listener == nil, s.problem == nil else { return }
            do {
                let params = NWParameters.udp
                params.allowLocalEndpointReuse = true
                let listener = try NWListener(using: params, on: Self.port)
                listener.newConnectionHandler = { [weak self] connection in self?.take(connection) }
                listener.stateUpdateHandler = { [weak self] state in
                    if case .failed(let error) = state { self?.failed(Problems.say("The receiver could not be listened to", error)) }
                }
                listener.start(queue: queue)
                s.listener = listener
            } catch {
                s.problem = Problems.say("The receiver could not be listened to", error)
                watchPath(&s)
            }
        }
    }

    /// Stops listening and lets every sender go; the next `start` tries
    /// afresh (the setting turned off and on again).
    func stop() {
        state.withLock { s in
            s.listener?.cancel()
            for connection in s.connections.values { connection.cancel() }
            s.path?.cancel()
            s = State()
        }
    }

    /// The bytes gathered since the last call.
    func drain() -> Data {
        state.withLock { s in
            defer { s.gathered.removeAll(keepingCapacity: true) }
            return s.gathered
        }
    }

    private func failed(_ why: String) {
        state.withLock { s in
            s.listener?.cancel()
            for connection in s.connections.values { connection.cancel() }
            s.listener = nil
            s.connections = [:]
            s.problem = why
            watchPath(&s)
        }
    }

    /// Clears the problem once the network path differs from the one the
    /// listener failed on, so the next read listens again.
    private func watchPath(_ s: inout State) {
        guard s.path == nil else { return }
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in self?.pathChanged(path) }
        monitor.start(queue: queue)
        s.path = monitor
    }

    private func pathChanged(_ path: NWPath) {
        state.withLock { s in
            // The first update is the path it failed on.
            guard let failedOn = s.failedOn else { s.failedOn = path; return }
            guard path != failedOn else { return }
            s.path?.cancel()
            (s.path, s.failedOn, s.problem) = (nil, nil, nil)
        }
    }

    /// Each sender is a "connection" to Network.framework: every datagram it
    /// sends is gathered whole.
    private func take(_ connection: NWConnection) {
        let kept = state.withLock { s in
            guard s.listener != nil else { return false }
            s.connections[ObjectIdentifier(connection)] = connection
            return true
        }
        guard kept else { connection.cancel(); return }
        connection.start(queue: queue)
        receive(on: connection)
    }

    private func receive(on connection: NWConnection) {
        connection.receiveMessage { [weak self] data, _, _, error in
            guard let self else { return }
            let open = self.state.withLock { s in
                guard s.connections[ObjectIdentifier(connection)] != nil else { return false }
                if let data, !data.isEmpty {
                    s.gathered.append(data)
                    if s.gathered.count > Self.most { s.gathered.removeFirst(s.gathered.count - Self.most) }
                }
                if error != nil { s.connections[ObjectIdentifier(connection)] = nil }
                return error == nil
            }
            if open { self.receive(on: connection) } else { connection.cancel() }
        }
    }
}
