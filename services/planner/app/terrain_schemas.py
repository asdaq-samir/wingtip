"""The answers of app.routers.terrain, kept beside it rather than in
app.schemas: the obstacles the 3D map stands up."""

from pydantic import BaseModel


class Obstacle(BaseModel):
    """One obstacle of the FAA's Digital Obstacle File (DOF.DAT): where it
    stands, its height above the ground and its top above the sea in feet,
    the FAA's word for what it is (TOWER, BLDG, WINDMILL ...) and whether
    it is lit."""

    lat: float
    lon: float
    agl_ft: int
    amsl_ft: int
    type: str
    lit: bool


class Obstacles(BaseModel):
    """The obstacles in a box, tallest first; `more` where some were left
    out past the most a map is given at once."""

    obstacles: list[Obstacle]
    more: bool
