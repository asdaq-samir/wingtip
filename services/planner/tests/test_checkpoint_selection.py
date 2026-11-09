"""The nav log's checkpoints as the planner asks for them: the engine's
checkpoints_select (route/checkpoints.rs, whose own tests and the shared
fixture planning.json hold the rule) picks, and the planner's candidates
come back whole, in route order."""

from app.checkpoint_scoring import select_checkpoints


def _c(along, score, name="x"):
    return {"along_track_nm": along, "predicted_score": score, "name": name}


def test_the_candidates_come_back_whole_in_route_order():
    picked = select_checkpoints([_c(0, 3.0, "a"), _c(30, 5.0, "b"), _c(60, 4.0, "c")], min_spacing_nm=10)
    assert [c["name"] for c in picked] == ["a", "b", "c"]


def test_none_within_three_miles_of_a_hops_ends():
    picked = select_checkpoints([_c(2.6, 5.0, "behind"), _c(12, 4.0, "ok"), _c(20, 5.0, "past")], length_nm=22.9)
    assert [c["name"] for c in picked] == ["ok"]


def test_a_row_with_no_score_is_left_out():
    picked = select_checkpoints([{"along_track_nm": 5.0, "name": "no score"}, _c(50, 4.0, "ok")], min_spacing_nm=10)
    assert [c["name"] for c in picked] == ["ok"]
