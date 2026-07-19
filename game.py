from dataclasses import dataclass

PLAYER_COLORS = [
    "#f5b545",
    "#57d98f",
    "#4fb6e8",
    "#e5748f",
    "#b48ef0",
    "#e8925a",
    "#6ee0d0",
    "#d9d957",
]


@dataclass
class Review:
    username: str
    film: str
    year: str | None
    rating: float | None
    text: str
