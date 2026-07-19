/* Blind Screening client — mirrors the server state machine. */

const $ = (id) => document.getElementById(id);
const screens = ["home", "lobby", "loading", "round", "reveal", "over"];

let ws = null;
let me = { id: null, room: null, isHost: false };
let playersById = {};
let timerHandle = null;

// ---------------------------------------------------------------- helpers

function show(name) {
  screens.forEach((s) => $("screen-" + s).classList.toggle("hidden", s !== name));
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.add("hidden"), 4000);
}

function stars(rating) {
  if (rating == null) return "unrated";
  const full = Math.floor(rating);
  return "★".repeat(full) + (rating % 1 ? "½" : "");
}

function playerChip(p, extraClass = "") {
  const li = document.createElement("li");
  li.className = extraClass;
  const dot = document.createElement("span");
  dot.className = "dot";
  dot.style.background = p.color;
  const name = document.createElement("span");
  name.textContent = p.name;
  li.append(dot, name);
  return li;
}

function indexPlayers(list) {
  playersById = {};
  list.forEach((p) => (playersById[p.id] = p));
}

// ---------------------------------------------------------------- websocket

function connect(onOpen) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.onopen = onOpen;
  ws.onmessage = (ev) => handle(JSON.parse(ev.data));
  ws.onclose = () => {
    // try to rejoin once the socket drops (mobile lock screens etc.)
    if (me.room && me.id) {
      setTimeout(() => connect(() => send({ type: "rejoin", room: me.room, player_id: me.id })), 1000);
    }
  };
}

function send(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

// ---------------------------------------------------------------- handlers

function handle(msg) {
  switch (msg.type) {
    case "error":
      $("home-error").textContent = msg.message;
      toast(msg.message);
      break;

    case "joined":
      me.id = msg.player_id;
      me.room = msg.room;
      me.isHost = msg.is_host;
      sessionStorage.setItem("bs", JSON.stringify(me));
      break;

    case "room_update": {
      indexPlayers(msg.players);
      me.isHost = msg.host === me.id;
      if (msg.state === "LOBBY") renderLobby(msg);
      if (msg.state === "LOADING") show("loading");
      break;
    }

    case "loading": {
      show("loading");
      $("loading-status").textContent = `Fetched ${msg.done}/${msg.total} profiles… (${msg.user})`;
      if (msg.error) {
        const p = document.createElement("p");
        p.textContent = msg.error;
        $("loading-log").append(p);
      }
      break;
    }

    case "round_start":
      renderRound(msg);
      break;

    case "votes_update": {
      const n = msg.voted.length;
      $("vote-status").textContent = `${n} vote${n === 1 ? "" : "s"} in…`;
      break;
    }

    case "reveal":
      renderReveal(msg);
      break;

    case "game_over":
      renderGameOver(msg);
      break;
  }
}

// ---------------------------------------------------------------- renderers

function renderLobby(msg) {
  show("lobby");
  $("lobby-code").textContent = msg.room;
  const ul = $("lobby-players");
  ul.replaceChildren();
  msg.players.forEach((p) => {
    const li = playerChip(p, p.connected ? "" : "off");
    const lb = document.createElement("span");
    lb.className = "lb";
    lb.textContent = "@" + p.letterboxd;
    li.append(lb);
    ul.append(li);
  });
  const warn = $("lobby-warnings");
  warn.replaceChildren();
  (msg.warnings || []).forEach((w) => {
    const p = document.createElement("p");
    p.textContent = w;
    warn.append(p);
  });
  $("btn-start").classList.toggle("hidden", !me.isHost);
  $("lobby-wait").classList.toggle("hidden", me.isHost);
}

function renderRound(msg) {
  show("round");
  indexPlayers(msg.players);
  $("round-counter").textContent = `round ${msg.round} / ${msg.total}`;
  $("round-film").textContent = msg.film;
  $("round-year").textContent = msg.year ? `(${msg.year})` : "";
  $("round-shared").textContent = msg.shared
    ? "Multiple people in this room reviewed this film"
    : "";
  $("round-review").textContent = msg.text;
  $("vote-status").textContent = "";

  // hint button
  const hint = $("hint-rating");
  hint.classList.add("hidden");
  hint.textContent = stars(msg.rating);
  $("btn-hint").disabled = false;

  // vote buttons
  const grid = $("vote-buttons");
  grid.replaceChildren();
  msg.players.forEach((p) => {
    const b = document.createElement("button");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = p.color;
    b.append(dot, document.createTextNode(p.name));
    b.onclick = () => {
      send({ type: "vote", guess: p.id });
      [...grid.children].forEach((c) => c.classList.remove("selected"));
      b.classList.add("selected");
    };
    grid.append(b);
  });

  startTimer(msg.seconds);
}

function startTimer(seconds) {
  clearInterval(timerHandle);
  const el = $("round-timer");
  let left = seconds;
  const tick = () => {
    el.textContent = `0:${String(left).padStart(2, "0")}`;
    el.classList.toggle("low", left <= 10);
    if (left-- <= 0) clearInterval(timerHandle);
  };
  tick();
  timerHandle = setInterval(tick, 1000);
}

function renderReveal(msg) {
  clearInterval(timerHandle);
  show("reveal");
  indexPlayers(msg.players);
  const author = playersById[msg.author];
  $("reveal-author").textContent = author ? author.name : "???";
  if (author) $("reveal-author").style.color = author.color;

  const ul = $("reveal-votes");
  ul.replaceChildren();
  Object.entries(msg.votes).forEach(([voter, guess]) => {
    if (voter === msg.author) return; // author's vote never counts
    const v = playersById[voter], g = playersById[guess];
    if (!v || !g) return;
    const li = document.createElement("li");
    const right = guess === msg.author;
    li.className = right ? "right" : "wrong";
    li.textContent = `${v.name} guessed ${g.name} ${right ? "✓" : "✗"}`;
    ul.append(li);
  });

  renderScoreboard($("reveal-scores"), msg.players, msg.deltas);
  $("btn-next").classList.toggle("hidden", !me.isHost);
  $("btn-next").textContent = msg.last_round ? "Final scores" : "Next review";
  $("reveal-wait").classList.toggle("hidden", me.isHost);
}

function renderScoreboard(ul, players, deltas = {}) {
  ul.replaceChildren();
  [...players]
    .sort((a, b) => b.score - a.score)
    .forEach((p) => {
      const li = playerChip(p);
      if (deltas[p.id]) {
        const d = document.createElement("span");
        d.className = "delta";
        d.textContent = `+${deltas[p.id]}`;
        li.append(d);
      }
      const pts = document.createElement("span");
      pts.className = "pts";
      pts.textContent = p.score;
      li.append(pts);
      ul.append(li);
    });
}

function renderGameOver(msg) {
  show("over");
  indexPlayers(msg.players);
  const winner = msg.players[0];
  $("winner-line").textContent = winner ? `${winner.name} takes the palme d'or` : "Fin";
  renderScoreboard($("final-scores"), msg.players);
  $("btn-again").classList.toggle("hidden", !me.isHost);
}

// ---------------------------------------------------------------- wiring

$("btn-create").onclick = () => {
  const payload = { type: "create", name: $("in-name").value, letterboxd: $("in-lb").value };
  if (!payload.letterboxd.trim()) return ($("home-error").textContent = "Letterboxd username required.");
  connect(() => send(payload));
};

$("btn-join").onclick = () => {
  const payload = {
    type: "join",
    room: $("in-code").value,
    name: $("in-name").value,
    letterboxd: $("in-lb").value,
  };
  if (!payload.room.trim()) return ($("home-error").textContent = "Enter a room code.");
  if (!payload.letterboxd.trim()) return ($("home-error").textContent = "Letterboxd username required.");
  connect(() => send(payload));
};

$("btn-start").onclick = () => send({ type: "start" });
$("btn-next").onclick = () => send({ type: "next" });
$("btn-again").onclick = () => send({ type: "again" });
$("btn-hint").onclick = () => {
  $("hint-rating").classList.remove("hidden");
  $("btn-hint").disabled = true;
};

// resume a session after a refresh
const saved = sessionStorage.getItem("bs");
if (saved) {
  try {
    const prev = JSON.parse(saved);
    if (prev.room && prev.id) {
      me = prev;
      connect(() => send({ type: "rejoin", room: me.room, player_id: me.id }));
    }
  } catch {}
}
