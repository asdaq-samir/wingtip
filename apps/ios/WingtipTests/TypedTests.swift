import Testing
@testable import Wingtip

/// A figure typed on a phone set to a region that writes a decimal comma.
struct TypedTests {
    @Test func aDecimalCommaIsTheDecimalPoint() {
        #expect(Typed.number("8,5") == 8.5)
        #expect(Typed.number(" 113,90 ") == 113.9)
        #expect(Typed.number("29,92") == 29.92)
    }

    @Test func aCommaGroupingThousandsIsNot() {
        #expect(Typed.number("4,500") == 4500)
        #expect(Typed.number("1,234.5") == 1234.5)
        #expect(Typed.number("1.234,5") == 1234.5)
        #expect(Typed.number("12,500,000") == 12_500_000)
    }

    @Test func aPlainFigureAndNoFigure() {
        #expect(Typed.number("8.5") == 8.5)
        #expect(Typed.number("120") == 120)
        #expect(Typed.number("") == nil)
        #expect(Typed.number("abc") == nil)
    }
}
