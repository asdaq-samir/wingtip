import Testing
@testable import Wingtip

/// Own ship's altitude is Core Location's sea-level one, and none when the
/// vertical accuracy is unknown (negative) or zero.
struct OwnShipAltitudeTests {
    @Test func metresAboveSeaLevelInFeet() {
        // 1,000 m is 3,280.839895 ft (1 ft = 0.3048 m exactly).
        let ft = OwnShip.seaLevelFeet(altitudeM: 1000, verticalAccuracyM: 8)
        #expect(abs((ft ?? 0) - 3280.839895) < 1e-5)
    }

    @Test func unknownAccuracyIsNone() {
        #expect(OwnShip.seaLevelFeet(altitudeM: 1000, verticalAccuracyM: -1) == nil)
        #expect(OwnShip.seaLevelFeet(altitudeM: 1000, verticalAccuracyM: 0) == nil)
    }
}
