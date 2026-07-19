"""
Run:  uvicorn server:app --reload --host 0.0.0.0 --port 8000
"""

from __future__ import annotations
from fastapi import WebSocket
from game import Question
import asyncio

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


class Room:
    def __init__(self, code: str):
        self.code = code
        self.host_id: str | None = None
        self.players: dict[str, Player] = {}
        self.state = "LOBBY"
        self.deck: list[Question] = []
        self.round_i = -1
        self.votes: dict[str, str] = {}
        self.timer: asyncio.Task | None = None
        self.reaper: asyncio.Task | None = None
        self.lock = asyncio.Lock()
        self.warnings: list[str] = []

    async def send(self, player: Player, msg: dict):
        if player.ws is not None:
            try:
                await player.ws.send_json(msg)
            except Exception:
                player.ws = None

    async def broadcast(self, msg: dict):
        await asyncio.gather(*(self.send(p, msg) for p in self.players.values()))

    def snapshot(self) -> dict:
        return {
            "type": "room_update",
            "room": self.code,
            "state": self.state,
            "host": self.host_id,
            "players": [p.public() for p in self.players.values()],
            "warnings": self.warnings,
        }
