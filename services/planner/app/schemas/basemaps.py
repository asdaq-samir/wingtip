"""The shapes app.routers.basemaps sends and takes, as Pydantic models."""

from pydantic import BaseModel


class GoogleMaps(BaseModel):
    """The browser key for Google's Map Tiles API (routers/basemaps)."""

    key: str
