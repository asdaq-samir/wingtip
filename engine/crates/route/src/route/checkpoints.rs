//! Which of the chart model's scored candidates become the nav log's
//! checkpoints (the planner's wingtip.checkpoints, #482).
//!
//! The model scores every candidate in the corridor -- 206 of them on
//! C81-KDLH -- and that is a ranking, not a flight plan. A pilot flies a
//! handful of checkpoints, far enough apart to be worth timing between and
//! close enough together to catch a heading error before it compounds.
//! Until 2026-09-10 the nav log zipped all of them into 205 legs.

use crate::json::Value;
use wingtip_core::ask::Ask;
use wingtip_core::sort::StableSort;

/// A VFR pilotage checkpoint every 10-15 nm is the spacing flight training
/// conventionally uses; no regulation or handbook sets one, so it is the
/// planner's own figure: close enough that a heading error shows before it
/// has taken the airplane somewhere unrecognisable, far enough that the
/// pilot is not head-down the whole leg. 10 is the low end, which suits a
/// slow trainer.
pub const MIN_SPACING_NM: f64 = 10.0;

/// Below this the model is saying it would not pick the feature out: a
/// gap in the route is more honest than filling it with something a pilot
/// will look for and fail to see. The planner's own figure, on the
/// training page's 0-5 scale.
pub const MIN_SCORE: f64 = 2.5;

/// How near a stop a hop's checkpoint is no use: the field itself is the
/// fix there, landed at or just taken off from. The planner's own figure
/// (KLSE-KCMY, 2026-10-28: a lake 2.6 nm behind La Crosse first and a
/// landing site 3.1 nm past Camp Douglas last).
pub const NEAR_A_STOP_NM: f64 = 3.0;

/// A scored candidate: how far along the route it is and the model's
/// score, either missing where the planner had none.
#[derive(Clone, Copy, Debug)]
pub struct Candidate {
    pub along_track_nm: Option<f64>,
    pub score: Option<f64>,
}

/// The checkpoints picked from `candidates`, as their indices in route
/// order (by along-track distance): greedy by score, subject to spacing --
/// the highest-scored candidate still at least `min_spacing_nm` from every
/// one already taken, and again. By score alone they cluster (the three
/// best on C81-KDLH are lakes, two of them side by side); by spacing alone
/// the model is ignored. Greedy keeps what matters: the single best
/// feature on the route is never dropped to tidy the spacing elsewhere.
///
/// `min_score` None takes every score; `max_count` None as many as the
/// spacing allows. `length_nm`, a hop's own length, keeps only those
/// NEAR_A_STOP_NM in from both its ends. Ties go to the nearer along the
/// route, so the answer does not hang on the order the candidates came in.
pub fn select(
    candidates: &[Candidate], min_spacing_nm: f64, max_count: Option<usize>, min_score: Option<f64>, length_nm: Option<f64>,
) -> Vec<usize> {
    let mut usable: Vec<(usize, f64, f64)> = candidates
        .iter()
        .enumerate()
        .filter_map(|(i, c)| Some((i, c.along_track_nm?, c.score?)))
        .filter(|&(_, _, score)| min_score.is_none_or(|m| score >= m))
        .filter(|&(_, along, _)| length_nm.is_none_or(|l| NEAR_A_STOP_NM <= along && along <= l - NEAR_A_STOP_NM))
        .collect();
    usable.stable_sort_by(|a, b| b.2.total_cmp(&a.2).then(a.1.total_cmp(&b.1)));
    let mut chosen: Vec<(usize, f64)> = Vec::new();
    for (i, along, _) in usable {
        if max_count.is_some_and(|m| chosen.len() >= m) {
            break;
        }
        if chosen.iter().all(|&(_, t)| (along - t).abs() >= min_spacing_nm) {
            chosen.push((i, along));
        }
    }
    chosen.stable_sort_by(|a, b| a.1.total_cmp(&b.1));
    chosen.into_iter().map(|(i, _)| i).collect()
}

/// `checkpoints_select`: the nav log's checkpoints from the chart model's
/// candidates (`{"candidates": [{"along_track_nm", "predicted_score"}],
/// "min_spacing_nm"?, "max_count"?, "min_score"?, "length_nm"?}`), their
/// indices. A missing min_score is MIN_SCORE; null takes every score.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let candidates: Vec<Candidate> = ask
        .list("candidates")?
        .iter()
        .map(|c| Candidate {
            along_track_nm: c.get("along_track_nm").and_then(Value::as_f64),
            score: c.get("predicted_score").and_then(Value::as_f64),
        })
        .collect();
    let min_score = match v.get("min_score") {
        None => Some(MIN_SCORE),
        Some(Value::Null) => None,
        Some(Value::Number(n)) => Some(*n),
        Some(_) => return Err(format!("{name}: \"min_score\" is not a number or null")),
    };
    let picked = select(
        &candidates,
        ask.opt_num("min_spacing_nm")?.unwrap_or(MIN_SPACING_NM),
        ask.opt_num("max_count")?.map(|n| n.max(0.0) as usize),
        min_score,
        ask.opt_num("length_nm")?,
    );
    let mut out = String::from("[");
    for (i, p) in picked.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str(&p.to_string());
    }
    out.push(']');
    Ok(out)
}

#[cfg(test)]
mod tests {
    //! wingtip.checkpoints' own tests (services/planner/tests_wingtip/
    //! test_checkpoints.py), moved with it.
    use super::*;

    fn c(along: f64, score: f64) -> Candidate {
        Candidate { along_track_nm: Some(along), score: Some(score) }
    }

    #[test]
    fn route_order_not_score_order() {
        assert_eq!(select(&[c(0.0, 3.0), c(30.0, 5.0), c(60.0, 4.0)], 10.0, None, Some(MIN_SCORE), None), vec![0, 1, 2]);
    }

    #[test]
    fn spacing_drops_the_lower_of_two_close_ones() {
        assert_eq!(select(&[c(20.0, 4.9), c(22.0, 5.0)], 10.0, None, Some(MIN_SCORE), None), vec![1]);
    }

    #[test]
    fn the_best_is_never_dropped() {
        let mut all: Vec<Candidate> = (0..100).step_by(3).map(|i| c(i as f64, 3.0)).collect();
        all.push(c(50.5, 5.0));
        assert!(select(&all, 10.0, None, Some(MIN_SCORE), None).contains(&(all.len() - 1)));
    }

    #[test]
    fn a_gap_rather_than_something_unusable_and_the_cap() {
        assert_eq!(select(&[c(0.0, 4.0), c(40.0, 1.2), c(80.0, 4.0)], 10.0, None, Some(2.5), None), vec![0, 2]);
        let ten: Vec<Candidate> = (0..10).map(|i| c(i as f64 * 20.0, 3.0 + (i % 3) as f64)).collect();
        assert_eq!(select(&ten, 10.0, Some(4), Some(MIN_SCORE), None).len(), 4);
    }

    #[test]
    fn ties_are_the_nearer_and_missing_scores_are_left_out() {
        assert_eq!(select(&[c(60.0, 4.0), c(10.0, 4.0)], 100.0, None, Some(MIN_SCORE), None), vec![1]);
        let missing = Candidate { along_track_nm: Some(5.0), score: None };
        assert_eq!(select(&[missing, c(50.0, 4.0)], 10.0, None, Some(MIN_SCORE), None), vec![1]);
        assert!(select(&[], 10.0, None, Some(MIN_SCORE), None).is_empty());
    }

    #[test]
    fn none_within_three_miles_of_either_end() {
        assert_eq!(select(&[c(2.6, 5.0), c(12.0, 4.0), c(20.0, 5.0)], 10.0, None, Some(MIN_SCORE), Some(22.9)), vec![1]);
    }
}
