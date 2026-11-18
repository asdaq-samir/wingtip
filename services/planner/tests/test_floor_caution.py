"""A pilot's own altitude under 14 CFR 91.119's minimum safe altitudes,
flown with a caution naming the rule, what the floor rests on and how far
under it (the engine's cautions::floor, held to the shared fixture
cautions.json's "floor" cases), never refused -- at the owner's
"make the pilot aware but not restrict them". The figures are the rule's
own: 1,000 ft above the highest obstacle within 2,000 ft over a congested
area (91.119(b)), 500 ft above the surface or any structure elsewhere
(91.119(c))."""

from wingtip.planning import own_altitude_caution


# A leg over a town with a 1,500 ft tower; one over fields with ground at
# 1,200 ft. Floors as wingtip.terrain rounds them.
TOWN = {
    "floor_ft": 2500.0,
    "highest_ft": 1500.0,
    "highest_is_obstacle": True,
    "obstacle_type": "TOWER",
    "obstacle_clearance_ft": 1000.0,
    "congested": True,
    "hemispheric_rule_from_ft": 4000.0,
    "eastbound": True,
}
FIELDS = {
    "floor_ft": 1700.0,
    "highest_ft": 1200.0,
    "highest_is_obstacle": False,
    "obstacle_type": None,
    "obstacle_clearance_ft": 500.0,
    "congested": False,
    "hemispheric_rule_from_ft": 4000.0,
    "eastbound": True,
}


def test_the_pilots_own_altitude_is_flown_with_the_caution():
    selection = {"segments": [FIELDS, TOWN]}
    legs = [{"altitude_ft": 2000.0}, {"altitude_ft": 2000.0}]
    caution = own_altitude_caution(selection, legs, ("KRZL", "KLAF"))
    assert caution["altitude_ft"] == 2000.0
    assert caution["reasons"] == [
        "500 ft under the 2,500 ft 14 CFR 91.119(b) asks over a congested area: "
        "1,000 ft over the highest obstacle within 2,000 ft, here a 1,500 ft tower"
    ]
