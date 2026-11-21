import Foundation

/// A figure the pilot typed, read whatever the phone's region. On a phone
/// set to Germany or France the decimal keypad's key is a comma, so a fuel
/// burn typed "8,5" was nil to Double(_:) (the field silently dropped) or,
/// where a field kept only digits and points, 85. A comma is read as the
/// decimal point unless it groups thousands ("4,500" ft, three figures
/// after it and no point); with both, the later one is the decimal point
/// ("1.234,5" and "1,234.5" are both 1234.5).
enum Typed {
    static func number(_ text: String) -> Double? {
        var t = text.trimmingCharacters(in: .whitespaces)
        let comma = t.lastIndex(of: ","), point = t.lastIndex(of: ".")
        switch (comma, point) {
        case let (c?, p?):
            t = c > p ? t.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".") : t.replacingOccurrences(of: ",", with: "")
        case let (c?, nil):
            let after = t[t.index(after: c)...]
            let grouping = t.filter { $0 == "," }.count > 1 || (after.count == 3 && after.allSatisfy(\.isNumber))
            t = grouping ? t.replacingOccurrences(of: ",", with: "") : t.replacingOccurrences(of: ",", with: ".")
        default: break
        }
        return Double(t)
    }
}
