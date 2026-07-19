from dataclasses import dataclass
from collections import defaultdict
import random

POINTS_CORRECT_GUESS = 100  # you guessed the author
POINTS_PER_FOOLED = 25  # author bonus per player who guessed wrong
MAX_REVIEW_CHARS = 3000

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


@dataclass
class Question:
    review: Review
    shared: bool
    author_pid: str | None = None  # resolved player id (set by the server)


def build_deck(
    reviews_by_user: dict[str, list[Review]],
    max_rounds: int = 10,
    rng: random.Random | None = None,
) -> list[Question]:
    rng = rng or random.Random()

    pool = [r for reviews in reviews_by_user.values() for r in reviews]

    authors_by_film: dict[str, set[str]] = defaultdict(set)
    for r in pool:
        authors_by_film[r.film.lower()].add(r.username)
    shared_films = {f for f, users in authors_by_film.items() if len(users) >= 2}

    shared = [r for r in pool if r.film.lower() in shared_films]
    solo = [r for r in pool if r.film.lower() not in shared_films]

    ordered = (_rotate_authors(shared, rng), _rotate_authors(solo, rng))
    deck: list[Question] = []
    for group, is_shared in zip(ordered, (True, False)):
        for r in group:
            if len(deck) >= max_rounds:
                return deck
            deck.append(Question(review=_trim(r), shared=is_shared))
    return deck


def _rotate_authors(reviews: list[Review], rng: random.Random) -> list[Review]:
    by_author: dict[str, list[Review]] = defaultdict(list)
    for r in reviews:
        by_author[r.username].append(r)
    for lst in by_author.values():
        rng.shuffle(lst)
    authors = list(by_author)
    rng.shuffle(authors)

    out: list[Review] = []
    while any(by_author[a] for a in authors):
        for a in authors:
            if by_author[a]:
                out.append(by_author[a].pop())
    return out


def _trim(r: Review) -> Review:
    if len(r.text) <= MAX_REVIEW_CHARS:
        return r
    cut = r.text[:MAX_REVIEW_CHARS].rsplit(" ", 1)[0] + " […]"
    return Review(
        username=r.username, film=r.film, year=r.year, rating=r.rating, text=cut
    )


def score_round(votes: dict[str, str], author_pid: str) -> dict[str, int]:
    """votes: voter player id -> guessed player id. Returns score deltas.

    - Correct guess (and you're not the author): +POINTS_CORRECT_GUESS
    - Author: +POINTS_PER_FOOLED per *other* player who guessed wrong
    - The author's own vote never scores.
    """
    deltas: dict[str, int] = defaultdict(int)
    for voter, guess in votes.items():
        if voter == author_pid:
            continue
        if guess == author_pid:
            deltas[voter] += POINTS_CORRECT_GUESS
        else:
            deltas[author_pid] += POINTS_PER_FOOLED
    return dict(deltas)
