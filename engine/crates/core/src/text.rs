//! Figures as text: a whole number with its thousands set off by commas,
//! "12,500", as the FAA writes altitudes and the apps write figures (the
//! web's lib/format grouped). One copy for every crate that writes one;
//! each caller rounds its number its own way first, as its words always
//! have, and hands the whole number's digits here.

/// The digits of a whole number, with a leading '-' where it has one,
/// with a comma before each three from the right: "12500" to "12,500",
/// "-4000" to "-4,000". Anything but ASCII digits after the sign is left
/// as it is given.
pub fn grouped(whole: &str) -> String {
    let (sign, digits) = whole.strip_prefix('-').map_or(("", whole), |d| ("-", d));
    if !digits.bytes().all(|b| b.is_ascii_digit()) {
        return whole.to_owned();
    }
    let mut out = String::with_capacity(whole.len() + digits.len() / 3);
    out.push_str(sign);
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    out
}

/// A whole number with its thousands grouped: `grouped` of its digits.
pub fn grouped_int(n: i64) -> String {
    grouped(&n.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thousands_are_set_off_from_the_right() {
        assert_eq!(grouped("0"), "0");
        assert_eq!(grouped("999"), "999");
        assert_eq!(grouped("1000"), "1,000");
        assert_eq!(grouped("12500"), "12,500");
        assert_eq!(grouped("1000000000000000000000"), "1,000,000,000,000,000,000,000");
        assert_eq!(grouped("-4000"), "-4,000");
        assert_eq!(grouped("-500"), "-500");
        assert_eq!(grouped_int(i64::MIN), "-9,223,372,036,854,775,808");
        assert_eq!(grouped("12.5"), "12.5");
    }
}
