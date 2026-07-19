"""
Run:  uvicorn server:app --reload --host 0.0.0.0 --port 8000
"""

from __future__ import annotations
from fastapi import WebSocket

# --------------------------------------------------------------------------
# Room / player state
# --------------------------------------------------------------------------


class Player:
    def __init__(self, pid: str, name: str, letterboxd: str, color: str):
        self.id = pid
        self.name = name
        self.letterboxd = letterboxd.strip().lower()
        self.color = color
        self.score = 0
        self.ws: WebSocket | None = None

    @property
    def connected(self) -> bool:
        return self.ws is not None

    def public(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "letterboxd": self.letterboxd,
            "color": self.color,
            "score": self.score,
            "connected": self.connected,
        }
