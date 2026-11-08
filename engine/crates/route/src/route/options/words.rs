//! Numbers in route options' words as the planner wrote them.

/// Python's f"{x:g}": six significant figures, no trailing zeros, a whole
/// number with no point ("10", "1.5", "0.25").
pub fn g(x: f64) -> String {
    if !x.is_finite() {
        return format!("{x}");
    }
    if x == x.trunc() && x.abs() < 1e16 {
        return format!("{}", x as i64);
    }
    let magnitude = x.abs().log10().floor() as i64;
    let decimals = (5 - magnitude).max(0) as usize;
    let s = format!("{x:.decimals$}");
    let s = s.trim_end_matches('0').trim_end_matches('.');
    s.to_owned()
}

/// Python's round(x, 1) for the figures written out.
pub fn r1(x: f64) -> f64 {
    (x * 10.0).round_ties_even() / 10.0
}

/// round(x, 5), a path's points.
pub fn r5(x: f64) -> f64 {
    (x * 1e5).round_ties_even() / 1e5
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn as_python_writes_g() {
        assert_eq!(g(10.0), "10");
        assert_eq!(g(1.5), "1.5");
        assert_eq!(g(0.25), "0.25");
        assert_eq!(g(14.2), "14.2");
        assert_eq!(g(0.125), "0.125");
    }
}
