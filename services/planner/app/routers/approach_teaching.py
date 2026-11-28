"""An approach taught and an approach debriefed, worked out here rather
than in the browser: the web's WebAssembly is downloaded by every phone
as the planner opens, and these two, read only on their own pages, were a
twentieth of it (scripts/ci/wasm_size.py). The rules are the engine's
(engine/crates/route/src/approach/lesson and debrief), asked by name with
the drawings the web already holds, so the answers are the ones its own
module gave; the phones ask the same rules on the device."""

from fastapi import APIRouter

from wingtip.engine import ask as engine

from ..gateway import PUBLIC_READ_BY_POST
from ..schemas.approach_teaching import ApproachFindAsk, ApproachTaught, ApproachTransitionAsk, LessonAsk

router = APIRouter()


def _place(p: dict) -> dict:
    return {"lat": p["lat"], "lon": p["lon"]}


def _ways(path: list[dict], steps: list[dict]) -> list[dict]:
    """Each step with `way`, the line the airplane flies to it: from the
    step before's place along the procedure's line to its own, each end
    the very place given; only its own place at the first; none where the
    step has no place."""
    out, before = [], None
    for step in steps:
        to = step.get("at")
        if not to:
            way = []
        elif before is None:
            way = [to]
        else:
            between = engine("approach_path_between", path=path, a=_place(before), b=_place(to))
            way = [before, *between[1:-1], to]
        out.append({**step, "way": way})
        before = to
    return out


@router.post("/api/approach/lesson", openapi_extra=PUBLIC_READ_BY_POST)
def approach_lesson(ask: LessonAsk) -> ApproachTaught:
    """An approach taught as an instructor teaches it, from the FAA's coded
    procedure (FAA-H-8083-16B, chapter 4): the briefing, the steps flown
    fix by fix at `gs_kt` with the way to each, the quiz, and the side
    view. What the coded data does not hold, the minimums above all, is
    "See the plate", never a figure made up. A POST for the drawing; it
    changes nothing."""
    drawing = ask.drawing.model_dump(mode="json")
    path = engine("approach_lesson_path", drawing=drawing)
    steps = engine("approach_coaching", drawing=drawing, gs_kt=ask.gs_kt)
    return ApproachTaught(
        brief=engine(
            "approach_brief",
            drawing=drawing,
            frequencies=[f.model_dump(mode="json") for f in ask.frequencies],
            vref_kt=ask.vref_kt,
            vso_kt=ask.vso_kt,
        ),
        # The places alike at any speed, so the airplane stays put as it changes.
        steps=_ways([_place(p) for p in path], steps),
        quiz=engine("approach_quiz", drawing=drawing, gs_kt=ask.gs_kt),
        profile=engine("approach_profile", drawing=drawing),
    )


@router.post("/api/approach/debriefs", openapi_extra=PUBLIC_READ_BY_POST)
def approach_debriefs(ask: ApproachFindAsk) -> list[dict]:
    """The approaches a track flew, one for each time it came down a final:
    of the field's approaches drawn, the one whose final it fitted best,
    the one picked where it fits as well, each fix by fix against the
    procedure (AIM 1-1-9, 1-1-17, 5-4-5; 14 CFR 91.175) in the engine's
    ApproachDebrief. A POST for the drawings and the track; it changes
    nothing."""
    return engine(
        "approach_find",
        drawings=[d.model_dump(mode="json") for d in ask.drawings],
        points=[p.model_dump() for p in ask.points],
        picked=ask.picked,
        minimums_ft=ask.minimums_ft,
    )


@router.post("/api/approach/debriefs/transition", openapi_extra=PUBLIC_READ_BY_POST)
def approach_transition(ask: ApproachTransitionAsk) -> dict | None:
    """Of an approach's transitions drawn, the one the track came in by:
    every fix of it before the final passed, the closest to it on the way;
    null where none was flown, so the approach stays from vectors."""
    return engine(
        "approach_transition",
        faf_at=ask.faf_at,
        passed=ask.passed,
        drawings=[d.model_dump(mode="json") for d in ask.drawings],
        points=[p.model_dump() for p in ask.points],
        minimums_ft=ask.minimums_ft,
    )
