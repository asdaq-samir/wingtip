"""The assistant's knobs from the environment, each by its own name (case
aside), typed once here: where the planner is, which model each feature
asks, and where the reference texts are kept. ANTHROPIC_API_KEY is not
here: the anthropic SDK reads it itself, and this service is the only one
given it (docker-compose.yml, infra/docker-compose.prod.yml)."""
from __future__ import annotations

import functools
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

#: The repository's data folder, as the planner's wingtip.config has it:
#: the stacks mount theirs at /workspace/data.
PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")

    #: The planner, whose HTTP API is every figure the assistant states:
    #: the plan, the briefing, the Go / No-Go, a field's card, the words'
    #: sources, the checkpoints to describe.
    planner_url: str = "http://planner:8000"
    #: How long a call to the planner may take, seconds: a cold corridor's
    #: plan is tens of seconds.
    planner_timeout_s: float = 300.0
    #: The assistant's model, its effort, and whether the server-side
    #: fallback is asked for (1 only).
    assistant_model: str = "claude-opus-5-5"
    assistant_effort: str = "medium"
    assistant_fallbacks: bool = False
    #: The mock oral's model.
    oral_model: str = "claude-opus-5-5"
    #: The plain-words readings' model.
    words_model: str = "claude-haiku-5-5"
    #: The checkpoint notes' model.
    checkpoint_note_model: str = "claude-haiku-5-5"
    #: The Brief's narrative's model.
    narrative_model: str = "claude-haiku-5-5"
    #: The model that reads a photographed page (app.documents), and its
    #: effort: Opus at high, as a misread figure in a table costs a pilot
    #: more than the call (every figure is still checked and confirmed).
    documents_model: str = "claude-opus-5-5"
    documents_effort: str = "high"
    #: Where the regulations and the AIM are kept once fetched (app.references).
    data_dir: Path = PROJECT_ROOT / "data"

    @field_validator("assistant_fallbacks", mode="before")
    @classmethod
    def read_opt_in(cls, value):
        """The fallback is opt-in: "1" turns it on, anything else leaves it off."""
        return value == "1" if isinstance(value, str) else value

    @field_validator("planner_url", mode="before")
    @classmethod
    def read_base_url(cls, value):
        return value.strip().rstrip("/") if isinstance(value, str) else value


@functools.cache
def get_settings() -> Settings:
    return Settings()
