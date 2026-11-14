"""wingtip.procedure_legs: a leg flown along a procedure's path keeps the
highest floor over its own line and the path's pieces (the engine's
floor_along_path; the aviation audit's AV-2)."""

from wingtip import procedure_legs


def test_an_ifr_leg_over_an_approachs_high_piece_keeps_its_floor():
    # 91.177(a)(2)'s floors: the leg's own 3,000 ft, the approach's pieces
    # 3,000 and 7,100 ft (a ridge within 4 nm of the second): 7,100 kept.
    own = [{"floor_ft": 3000.0, "highest_ft": 1900.0, "highest_is_obstacle": False, "mountainous": False}] * 2
    ridge = {"floor_ft": 7100.0, "highest_ft": 6100.0, "highest_is_obstacle": False, "mountainous": False}

    def read(points):
        return [own[0], ridge][: len(points) - 1]

    floors = procedure_legs.floors_along(own, ((1, ((41.0, -88.0), (41.2, -88.1), (41.3, -88.0))),), read)
    assert floors == [own[0], ridge]


def test_no_paths_leave_the_floors_as_they_are():
    floors = [{"floor_ft": 2000.0, "lowest_ground_ft": 900.0}]
    assert procedure_legs.floors_along(floors, (), lambda points: []) == floors
    # A VFR leg over a lower path keeps its own floor, the path's lower ground.
    low = {"floor_ft": 1500.0, "lowest_ground_ft": 300.0}
    assert procedure_legs.floors_along(floors, ((0, ((45.0, -90.0), (45.1, -90.0))),), lambda points: [low]) == [
        {"floor_ft": 2000.0, "lowest_ground_ft": 300.0}
    ]
