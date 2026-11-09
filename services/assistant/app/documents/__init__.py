"""A photographed page read into figures the engine checks before the pilot
confirms them (POST /api/read-document): a handbook's performance or
weight and balance page into the airplane's profile, a paper logbook
page into entries, a clearance note into the controller's words for the
app's clearance reader. schemas.py has the shapes, prompts.py what the
model is told, reader.py the model's call, router.py the route."""
from .router import router

__all__ = ["router"]
