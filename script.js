// ===== Game settings =====
const START_TIME = 45;        // seconds in the dry season
const START_BUDGET = 1800;     // still tight, but winnable with smart allocation
const SAFE_QUALITY = 60;       // wells at 60+ are safe
const MAX_PER_WELL = 1;        // each well can only serve one village in this prototype
const SICK_PENALTY = 90;      // points lost for using an unsafe well

const PRIORITY_VALUES = {
  low: 60,
  medium: 110,
  high: 170
};

const PRIORITY_LABELS = {
  low: "Low priority",
  medium: "Priority",
  high: "Critical need"
};

// Map positions are percentages of the map (x = left, y = top)
const VILLAGE_SPOTS = [
  { name: "Village A", x: 15, y: 15, priority: "high" },
  { name: "Village B", x: 85, y: 15, priority: "medium" },
  { name: "Village C", x: 50, y: 62, priority: "high" },
  { name: "Village D", x: 15, y: 85, priority: "low" },
  { name: "Village E", x: 85, y: 85, priority: "medium" }
];

const WELL_SPOTS = [
  { x: 50, y: 15 },
  { x: 30, y: 38 },
  { x: 72, y: 38 },
  { x: 12, y: 58 },
  { x: 50, y: 88 },
  { x: 88, y: 58 }
];

// ===== Grab elements from the page =====
const mapEl = document.getElementById("map");
const pipesEl = document.getElementById("pipes");
const scoreEl = document.getElementById("score");
const timeEl = document.getElementById("time");
const budgetEl = document.getElementById("budget");
const servedEl = document.getElementById("served");
const messageEl = document.getElementById("message");
const startBtn = document.getElementById("start-btn");
const resetBtn = document.getElementById("reset-btn");
const overlayEl = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const playAgainBtn = document.getElementById("play-again-btn");

// ===== Game state (changes while you play) =====
let score, timeLeft, budget, running, timerId, selectedVillage;
let villages = [];
let wells = [];

// ===== Helpers =====

// Random whole number between min and max (inclusive)
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Shuffle an array (so the good and bad wells land in random places)
function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Pipe cost climbs sharply with distance and unsafe water.
// This makes spending choices matter much more than in the original prototype.
function pipeCost(village, well) {
  const distance = Math.hypot(village.x - well.x, village.y - well.y);
  const distanceCost = Math.round(distance * 10);
  const qualityPenalty = well.quality < SAFE_QUALITY ? (SAFE_QUALITY - well.quality) * 4 : 0;
  return distanceCost + qualityPenalty;
}

// Show a message under the buttons. type is "good", "bad" or ""
function showMessage(text, type = "") {
  messageEl.textContent = text;
  messageEl.className = "message " + type;
}

// Replay a CSS animation class on an element
function animate(el, className) {
  el.classList.remove(className);
  void el.offsetWidth; // forces the browser to restart the animation
  el.classList.add(className);
}

// Floating "+150" / "-50" text above a spot on the map
function floatText(x, y, text, type) {
  const span = document.createElement("span");
  span.className = "float-text " + type;
  span.textContent = text;
  span.style.left = x + "%";
  span.style.top = y + "%";
  mapEl.appendChild(span);
  setTimeout(() => span.remove(), 1200);
}

// Update the numbers in the stats bar
function updateHud() {
  scoreEl.textContent = score;
  timeEl.textContent = timeLeft;
  budgetEl.textContent = "$" + budget;
  const servedCount = villages.filter(v => v.served).length;
  servedEl.textContent = servedCount + "/" + villages.length;
}

// ===== Build the map =====
function buildMap() {
  // Remove old villages, wells and pipes
  mapEl.querySelectorAll(".spot, .float-text").forEach(el => el.remove());
  pipesEl.innerHTML = "";

  // 5 safe wells and 1 tempting-but-risky well keeps the game winnable.
  const qualities = shuffle([
    randomBetween(72, 98),
    randomBetween(68, 92),
    randomBetween(66, 90),
    randomBetween(60, 88),
    randomBetween(62, 86),
    randomBetween(20, 45)
  ]);

  wells = WELL_SPOTS.map((spot, i) => ({
    x: spot.x,
    y: spot.y,
    quality: qualities[i],
    uses: 0,
    el: null
  }));

  villages = VILLAGE_SPOTS.map(spot => ({
    name: spot.name,
    x: spot.x,
    y: spot.y,
    priority: spot.priority,
    value: PRIORITY_VALUES[spot.priority],
    served: false,
    el: null
  }));

  // Create a button for each well
  wells.forEach((well, i) => {
    const btn = document.createElement("button");
    btn.className = "spot well";
    btn.style.left = well.x + "%";
    btn.style.top = well.y + "%";
    btn.setAttribute("aria-label", "Well " + (i + 1) + ", water quality " + well.quality);
    btn.innerHTML = `
      <span class="well-circle">${well.quality}</span>
      <span class="well-label">Well ${i + 1}</span>
      <span class="well-cost"></span>`;
    btn.addEventListener("click", () => clickWell(well));
    mapEl.appendChild(btn);
    well.el = btn;
  });

  // Create a button for each village
  villages.forEach(village => {
    const btn = document.createElement("button");
    btn.className = "spot village";
    btn.style.left = village.x + "%";
    btn.style.top = village.y + "%";
    btn.setAttribute("aria-label", village.name + ", needs water");
    btn.innerHTML = `
      <span class="house">
        <svg viewBox="0 0 52 46" aria-hidden="true">
          <path d="M4 22 L26 3 L48 22 L42 22 L42 43 L10 43 L10 22 Z"></path>
        </svg>
        <span class="check">&#10003;</span>
      </span>
      <span class="village-name">${village.name}</span>
      <span class="village-status">${PRIORITY_LABELS[village.priority]}</span>`;
    btn.addEventListener("click", () => clickVillage(village));
    mapEl.appendChild(btn);
    village.el = btn;
  });
}

// ===== Player actions =====

function clickVillage(village) {
  if (!running) {
    showMessage("Press Start to begin!");
    return;
  }
  if (village.served) {
    showMessage(village.name + " already has clean water. Pick another village.");
    return;
  }

  // Tapping the selected village again un-selects it
  if (selectedVillage === village) {
    clearSelection();
    showMessage("Tap a village that needs water.");
    return;
  }

  clearSelection();
  selectedVillage = village;
  village.el.classList.add("selected");
  mapEl.classList.add("choosing");

  // Show what a pipe to each well would cost
  wells.forEach(well => {
    well.el.querySelector(".well-cost").textContent = "$" + pipeCost(village, well);
  });

  showMessage(village.name + " is " + PRIORITY_LABELS[village.priority] + ". Choose the cheapest safe route you can afford.");
}

function clickWell(well) {
  if (!running) {
    showMessage("Press Start to begin!");
    return;
  }
  if (!selectedVillage) {
    showMessage("Tap a village first, then a well.");
    animate(well.el, "shake");
    return;
  }
  if (well.uses >= MAX_PER_WELL) {
    showMessage("That well already supplies " + MAX_PER_WELL + " villages. Choose another.", "bad");
    animate(well.el, "shake");
    return;
  }

  const cost = pipeCost(selectedVillage, well);
  if (cost > budget) {
    showMessage("Not enough budget for that pipe ($" + cost + "). Try a closer well.", "bad");
    animate(well.el, "shake");
    animate(budgetEl.parentElement, "flash-bad");
    return;
  }

  // Pay for the pipe
  budget -= cost;
  well.uses++;
  if (well.uses >= MAX_PER_WELL) well.el.classList.add("full");

  const village = selectedVillage;
  clearSelection();

  if (well.quality >= SAFE_QUALITY) {
    // Success: clean water, with bigger rewards for higher-priority villages.
    const points = 110 + well.quality + village.value;
    score += points;
    village.served = true;
    village.el.classList.remove("sick");
    village.el.classList.add("served");
    village.el.querySelector(".village-status").textContent = "Clean water!";
    village.el.setAttribute("aria-label", village.name + ", has clean water");
    drawPipe(village, well, false);
    floatText(village.x, village.y, "+" + points, "good");
    showMessage("Clean water reached " + village.name + "! +" + points + " points.", "good");
    animate(scoreEl, "pop");
  } else {
    // Challenge: unsafe water costs more and creates a serious penalty.
    const penalty = SICK_PENALTY + Math.round(village.value / 2);
    score -= penalty;
    village.el.classList.add("sick");
    village.el.querySelector(".village-status").textContent = "Got sick!";
    const badPipe = drawPipe(village, well, true);
    setTimeout(() => badPipe.remove(), 1500);
    floatText(village.x, village.y, "-" + penalty, "bad");
    showMessage("Unsafe water! " + village.name + " got sick. -" + penalty + " points. Find a well rated 60+.", "bad");
    animate(scoreEl.parentElement, "flash-bad");
  }

  updateHud();
  checkGameOver();
}

function clearSelection() {
  if (selectedVillage) selectedVillage.el.classList.remove("selected");
  selectedVillage = null;
  mapEl.classList.remove("choosing");
}

// Draw a pipe (SVG line) between a village and a well
function drawPipe(village, well, isBad) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", village.x);
  line.setAttribute("y1", village.y);
  line.setAttribute("x2", well.x);
  line.setAttribute("y2", well.y);
  line.setAttribute("vector-effect", "non-scaling-stroke");
  line.setAttribute("class", isBad ? "pipe pipe-bad" : "pipe");
  pipesEl.appendChild(line);
  return line;
}

// ===== Win / lose =====

function checkGameOver() {
  const unserved = villages.filter(v => !v.served);

  if (unserved.length === 0) {
    endGame(true);
    return;
  }

  // Can any village still afford a pipe to a well with room?
  const canStillConnect = unserved.some(village =>
    wells.some(well => well.uses < MAX_PER_WELL && pipeCost(village, well) <= budget)
  );
  if (!canStillConnect) {
    endGame(false, "You ran out of budget before every village had water.");
  }
}

function endGame(won, reason) {
  running = false;
  clearInterval(timerId);
  clearSelection();
  mapEl.classList.add("locked");
  startBtn.disabled = true;

  if (won) {
    const timeBonus = timeLeft * 5;
    score += timeBonus;
    updateHud();
    overlayTitle.textContent = "Every village has clean water!";
    overlayText.textContent = "Time bonus: +" + timeBonus + ". Final score: " + score + ".";
    launchConfetti();
  } else {
    overlayTitle.textContent = "The dry season is over";
    overlayText.textContent = reason + " Final score: " + score + ".";
  }

  // Short pause so the player sees the last pipe before the popup
  setTimeout(() => overlayEl.classList.remove("hidden"), 600);
}

// ===== Celebrate wins =====
function launchConfetti() {
  const colors = ["#FFC907", "#2E9DF7", "#4FCB53", "#FF902A", "#F5402C"];
  for (let i = 0; i < 120; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = 2.5 + Math.random() * 2 + "s";
    piece.style.animationDelay = Math.random() * 0.6 + "s";
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 5500);
  }
}

// ===== Start, timer and reset =====

function startGame() {
  if (running) return;
  running = true;
  startBtn.disabled = true;
  mapEl.classList.remove("locked");
  showMessage("Go! Prioritize the highest-need villages, and keep the budget under control.");

  timerId = setInterval(() => {
    timeLeft--;
    updateHud();
    if (timeLeft <= 10) animate(timeEl, "pop");
    if (timeLeft <= 0) {
      endGame(false, "Time ran out before every village had water.");
    }
  }, 1000);
}

function resetGame() {
  clearInterval(timerId);
  running = false;
  score = 0;
  timeLeft = START_TIME;
  budget = START_BUDGET;
  selectedVillage = null;
  overlayEl.classList.add("hidden");
  mapEl.classList.add("locked");
  mapEl.classList.remove("choosing");
  startBtn.disabled = false;
  document.querySelectorAll(".confetti").forEach(el => el.remove());
  buildMap();
  updateHud();
  showMessage("Press Start. Then tap a village, and tap a well to lay a pipe.");
}

startBtn.addEventListener("click", startGame);
resetBtn.addEventListener("click", resetGame);
playAgainBtn.addEventListener("click", resetGame);

// Set up the first game when the page loads
resetGame();
