import MapKit
import Testing
@testable import Wingtip

/// The Dimmer over the map's marks at night (MarkDim), as the web's mapDim.
struct MarkDimTests {
    @Test func atNightTheMarksTakeTheChartsBrightness() {
        #expect(MarkDim.alpha(shade: 0.5, night: true) == 0.5)
        #expect(MarkDim.alpha(shade: ChartLook.dimMax, night: true) == 1 - ChartLook.dimMax)
        #expect(MarkDim.alpha(shade: 0, night: true) == 1)
    }

    @Test func byDayTheMarksStayAtFullLight() {
        #expect(MarkDim.alpha(shade: 0.4, night: false) == 1)
    }

    @Test func ownShipIsNeverDimmed() {
        #expect(!MarkDim.dims(PlaneAnnotation()))
        #expect(MarkDim.dims(MKPointAnnotation()))
    }

    @Test func thePlatesTakeTheMapsShade() {
        #expect(MapExtrasInput().shaded(0.3).plateLook.shade == 0.3)
    }
}
