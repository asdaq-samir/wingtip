import Foundation
import Network

/// The cockpit's ADS-B receiver heard on the Wi-Fi: GDL 90 sent to UDP
/// port 4000 (Garmin's GDL 90 Data Interface Specification, as Stratux,
/// Sentry, Garmin's GDL 39 and 52 and uAvionix's receivers send it to the
/// phones that join them). The bytes are only gathered here; the engine
/// reads them (`receiver_read`, Receiver). A receiver that sends to the
/// network's broadcast address, not to the phone, is heard only with
/// Apple's multicast entitlement, which this app does not yet hold.
final class ReceiverListener: @unchecked Sendable {
    /// GDL 90's port over Wi-Fi, as the receivers and ForeFlight use it.
    static let port: NWEndpoint.Port = 4000

    private let queue = DispatchQueue(label: "app.wingtipmaps.receiver")
    private let lock = NSLock()
    private var gathered = Data()
    private var listener: NWListener?
    /// What stopped the listener, for the setting's row; nil while it runs.
    private(set) var problem: String?

    /// No more than this is kept between two reads (a second's worth of a
    /// busy receiver is some tens of kilobytes): a stalled app drops the
    /// oldest, which are stale by the time it reads them.
    private static let most = 512 * 1024

    func start() {
        lock.withLock {
            guard listener == nil else { return }
            do {
                let params = NWParameters.udp
                params.allowLocalEndpointReuse = true
                let listener = try NWListener(using: params, on: Self.port)
                listener.newConnectionHandler = { [weak self] connection in self?.take(connection) }
                listener.stateUpdateHandler = { [weak self] state in
                    if case .failed(let error) = state { self?.stopped("\(error)") }
                }
                listener.start(queue: queue)
                self.listener = listener
                problem = nil
            } catch {
                problem = "\(error)"
            }
        }
    }

    func stop() {
        lock.withLock {
            listener?.cancel()
            listener = nil
            gathered.removeAll()
        }
    }

    /// The bytes gathered since the last call.
    func drain() -> Data {
        lock.withLock {
            defer { gathered.removeAll(keepingCapacity: true) }
            return gathered
        }
    }

    private func stopped(_ why: String) {
        lock.withLock {
            listener?.cancel()
            listener = nil
            problem = why
        }
    }

    /// Each sender is a "connection" to Network.framework: every datagram it
    /// sends is gathered whole.
    private func take(_ connection: NWConnection) {
        connection.start(queue: queue)
        receive(on: connection)
    }

    private func receive(on connection: NWConnection) {
        connection.receiveMessage { [weak self] data, _, _, error in
            guard let self else { return }
            if let data, !data.isEmpty {
                self.lock.withLock {
                    self.gathered.append(data)
                    if self.gathered.count > Self.most { self.gathered.removeFirst(self.gathered.count - Self.most) }
                }
            }
            if error == nil { self.receive(on: connection) } else { connection.cancel() }
        }
    }
}
