const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const overlay = document.getElementById("overlay");
const actionBtn = document.getElementById("actionBtn");
const timerEl = document.getElementById("timer");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const soundToggleBtn = document.getElementById("soundToggle");
const startSoundToggleBtn = document.getElementById("startSoundToggle");

const ROUND_TIME = 30;
const BEST_KEY = "beeBloomRushBest";
const SOUND_KEY = "game5ArcadeSoundEnabled";

let width = 0;
let height = 0;
let dpr = 1;
let audioContext = null;

const game = {
  running: false,
  roundOver: false,
  score: 0,
  bestScore: 0,
  timeLeft: ROUND_TIME,
  soundEnabled: true,
  lastFrame: 0,
  clouds: [],
  pollen: [],
  popup: null,
  particles: [],
  cameraShake: 0,

  currentFlower: null,
  nextFlower: null,
  player: null,
  flowerIndex: 0,
};

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function angleWrap(a) {
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}

function angleDistance(a, b) {
  return Math.abs(angleWrap(a - b));
}

function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

function isMobileViewport() {
  return width <= 700 || height <= 900;
}

function resizeCanvas() {
  dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  width = window.innerWidth;
  height = window.innerHeight;

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  createClouds();
  createPollen();
}

function getPlayArea() {
  const sideMargin = isMobileViewport() ? 34 : 70;
  const topMargin = isMobileViewport() ? 112 : 95;
  const bottomMargin = isMobileViewport() ? 165 : 125;

  return {
    left: sideMargin,
    right: width - sideMargin,
    top: topMargin,
    bottom: height - bottomMargin,
  };
}

function getMinFlowerDistance() {
  const minDimension = Math.min(width, height);
  return isMobileViewport() ? minDimension * 0.21 : minDimension * 0.23;
}

function getIdealFlowerDistance() {
  const minDimension = Math.min(width, height);
  return isMobileViewport() ? minDimension * 0.31 : minDimension * 0.35;
}

function createClouds() {
  game.clouds = [];
  const count = Math.max(3, Math.floor(width / 220));

  for (let i = 0; i < count; i++) {
    game.clouds.push({
      x: Math.random() * width,
      y: Math.random() * (height * 0.35),
      w: rand(70, 150),
      h: rand(28, 52),
      s: rand(4, 10),
      a: rand(0.35, 0.65),
    });
  }
}

function createPollen() {
  game.pollen = [];
  const count = Math.floor((width * height) / 15000);

  for (let i = 0; i < count; i++) {
    game.pollen.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: rand(1.2, 2.4),
      s: rand(10, 24),
      drift: rand(-8, 8),
      a: rand(0.22, 0.6),
    });
  }
}

function loadPrefs() {
  try {
    const best = Number(localStorage.getItem(BEST_KEY) || 0);
    game.bestScore = Number.isFinite(best) ? Math.max(0, Math.floor(best)) : 0;
  } catch (err) {
    game.bestScore = 0;
  }

  try {
    const soundSaved = localStorage.getItem(SOUND_KEY);
    if (soundSaved !== null) {
      game.soundEnabled = soundSaved === "true";
    }
  } catch (err) {
    game.soundEnabled = true;
  }

  bestEl.textContent = `Best: ${game.bestScore}`;
  updateSoundButtons();
}

function saveBestScore() {
  try {
    localStorage.setItem(BEST_KEY, String(game.bestScore));
  } catch (err) {
    // ignore
  }
}

function saveSoundPref() {
  try {
    localStorage.setItem(SOUND_KEY, String(game.soundEnabled));
  } catch (err) {
    // ignore
  }
}

function updateSoundButtons() {
  soundToggleBtn.textContent = game.soundEnabled ? "🔊" : "🔇";
  startSoundToggleBtn.textContent = game.soundEnabled ? "Sound: ON" : "Sound: OFF";
}

function toggleSound() {
  game.soundEnabled = !game.soundEnabled;
  saveSoundPref();
  updateSoundButtons();
}

function toggleSoundFromOverlay() {
  toggleSound();
  const btn = document.getElementById("startSoundToggle");
  if (btn) {
    btn.textContent = game.soundEnabled ? "Sound: ON" : "Sound: OFF";
  }
}

function ensureAudio() {
  if (!game.soundEnabled) return;

  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      audioContext = new AudioCtx();
    }
  }

  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
}

function playTone(type, frequency, duration, volume, slideTo = null) {
  if (!game.soundEnabled) return;
  ensureAudio();
  if (!audioContext) return;

  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);

  if (slideTo !== null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), now + duration);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playTapSound() {
  playTone("triangle", 440, 0.08, 0.03, 520);
}

function playJumpSound() {
  playTone("triangle", 520, 0.1, 0.04, 700);
}

function playLandSound() {
  playTone("sine", 640, 0.1, 0.04, 820);
}

function playPerfectSound() {
  playTone("triangle", 760, 0.11, 0.045, 980);
  setTimeout(() => playTone("triangle", 980, 0.08, 0.035, 1200), 55);
}

function playFailSound() {
  playTone("sawtooth", 220, 0.22, 0.03, 100);
}

function getThornCount() {
  if (game.score < 6) return 1;
  if (game.score < 14) return 2;
  return 3;
}

function getRotationSpeed() {
  if (game.score < 6) return 1.15;
  if (game.score < 14) return 1.4;
  return 1.7;
}

function getPerfectWindowAngle() {
  return Math.PI / 18; // 10°
}

function getFlowerRadiusByIndex(index) {
  const mobile = isMobileViewport();
  const pattern = ["standard", "standard", "small", "standard", "standard", "big"];
  const type = pattern[index % pattern.length];

  if (mobile) {
    if (type === "small") return 22;
    if (type === "big") return 30;
    return 26;
  }

  if (type === "small") return 24;
  if (type === "big") return 34;
  return 29;
}

function makeFlower(x, y, radius, index) {
  const palette = [
    { petal: "#ff77b7", center: "#ffd84d" },
    { petal: "#b07cff", center: "#ffd84d" },
    { petal: "#ffb35c", center: "#fff08a" },
    { petal: "#ff6f91", center: "#ffe36b" },
  ];
  const style = palette[Math.floor(Math.random() * palette.length)];
  const direction = index % 2 === 0 ? 1 : -1;

  return {
    x,
    y,
    radius,
    catchRadius: radius * 1.78,
    petal: style.petal,
    center: style.center,
    direction,
    thornLength: radius * 2.05,
    landingAngle: 0,
    thorns: [],
  };
}

function clampFlowerToScreen(flower) {
  const playArea = getPlayArea();
  const pad = flower.catchRadius + 8;

  flower.x = clamp(flower.x, playArea.left + pad, playArea.right - pad);
  flower.y = clamp(flower.y, playArea.top + pad, playArea.bottom - pad);

  return flower;
}

function getFlowerSlots() {
  const playArea = getPlayArea();
  const w = playArea.right - playArea.left;
  const h = playArea.bottom - playArea.top;

  const xs = isMobileViewport()
    ? [0.06, 0.28, 0.50, 0.72, 0.94]
    : [0.06, 0.26, 0.50, 0.74, 0.94];

  const ys = [0.08, 0.28, 0.48, 0.68, 0.84];

  const slots = [];
  for (const y of ys) {
    for (const x of xs) {
      slots.push({
        x: playArea.left + w * x,
        y: playArea.top + h * y,
      });
    }
  }
  return slots;
}

function makeStartFlower() {
  const slots = getFlowerSlots();
  const slot = slots[20];
  const radius = getFlowerRadiusByIndex(0);
  return clampFlowerToScreen(makeFlower(slot.x, slot.y, radius, 0));
}

function chooseNextSlot(fromFlower) {
  const slots = getFlowerSlots();
  const minDistance = getMinFlowerDistance();
  const idealDistance = getIdealFlowerDistance();

  const candidates = slots
    .map((slot) => ({ slot, d: distance(fromFlower.x, fromFlower.y, slot.x, slot.y) }))
    .filter((item) => item.d >= minDistance);

  if (candidates.length === 0) {
    return slots
      .map((slot) => ({ slot, d: distance(fromFlower.x, fromFlower.y, slot.x, slot.y) }))
      .sort((a, b) => b.d - a.d)[0].slot;
  }

  candidates.sort((a, b) => {
    const aScore = Math.abs(a.d - idealDistance);
    const bScore = Math.abs(b.d - idealDistance);
    return aScore - bScore;
  });

  const pool = candidates.slice(0, Math.min(6, candidates.length)).sort((a, b) => b.d - a.d);
  return pool[Math.floor(Math.random() * pool.length)].slot;
}

function makeNextFlower(fromFlower, index) {
  const slot = chooseNextSlot(fromFlower);
  const radius = getFlowerRadiusByIndex(index);
  return clampFlowerToScreen(makeFlower(slot.x, slot.y, radius, index));
}

function configureNextFlower(currentFlower, nextFlower) {
  const landingAngle = Math.atan2(
    currentFlower.y - nextFlower.y,
    currentFlower.x - nextFlower.x
  );

  nextFlower.landingAngle = landingAngle;
  nextFlower.thorns = [];

  const thornCount = getThornCount();
  const gap = (Math.PI * 2) / thornCount;
  const halfGap = gap / 2;

  for (let i = 0; i < thornCount; i++) {
    nextFlower.thorns.push(landingAngle + halfGap + i * gap);
  }
}

function getLaunchAngle() {
  return Math.atan2(
    game.nextFlower.y - game.currentFlower.y,
    game.nextFlower.x - game.currentFlower.x
  );
}

function updatePlayerAnchorPosition() {
  const f = game.currentFlower;
  const p = game.player;
  p.x = f.x + Math.cos(p.angle) * p.orbitRadius;
  p.y = f.y + Math.sin(p.angle) * p.orbitRadius;
}

function showPopup(text, x, y, color) {
  game.popup = {
    text,
    x,
    y,
    color,
    life: 1,
  };
}

function addParticles(x, y, color) {
  for (let i = 0; i < 14; i++) {
    game.particles.push({
      x,
      y,
      vx: rand(-90, 90),
      vy: rand(-110, -35),
      r: rand(2, 4),
      life: rand(0.4, 0.85),
      color,
    });
  }
}

function resetRound() {
  game.score = 0;
  game.timeLeft = ROUND_TIME;
  game.roundOver = false;
  game.popup = null;
  game.particles = [];
  game.cameraShake = 0;
  game.flowerIndex = 1;

  scoreEl.textContent = "Score: 0";
  timerEl.textContent = `${ROUND_TIME.toFixed(1)}s`;
  bestEl.textContent = `Best: ${game.bestScore}`;

  game.currentFlower = makeStartFlower();
  game.nextFlower = makeNextFlower(game.currentFlower, game.flowerIndex);
  configureNextFlower(game.currentFlower, game.nextFlower);

  const initialLaunchAngle = getLaunchAngle();

  game.player = {
    state: "orbit",
    x: 0,
    y: 0,
    r: isMobileViewport() ? 10 : 11,
    orbitRadius: game.currentFlower.radius + 16,
    angle: initialLaunchAngle - Math.PI / 2,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    flightProgress: 0,
    flightDuration: 0.22,
    awardedPoints: 0,
    landedAngle: 0,
    trail: [],
    wingPhase: 0,
  };

  updatePlayerAnchorPosition();
}

function beginRound() {
  ensureAudio();
  playTapSound();
  resetRound();
  game.running = true;
  overlay.classList.remove("show");
}

function finishRound(title, text) {
  game.running = false;
  game.roundOver = true;
  playFailSound();

  if (game.score > game.bestScore) {
    game.bestScore = game.score;
    saveBestScore();
  }

  bestEl.textContent = `Best: ${game.bestScore}`;

  overlay.innerHTML = `
    <div class="panel">
      <h1>${title}</h1>
      <p class="lead">${text}</p>

      <div class="rules">
        <div><strong>Round score:</strong> ${game.score}</div>
        <div><strong>High score:</strong> ${game.bestScore}</div>
        <div><strong>Scoring:</strong> Gold zone = +2, any other safe landing = +1</div>
        <div><strong>Rule:</strong> Hit the next flower and avoid the thorns.</div>
      </div>

      <div class="button-row">
        <button id="actionBtn" class="primary-btn">Play Again</button>
        <button id="startSoundToggle" class="secondary-btn">${game.soundEnabled ? "Sound: ON" : "Sound: OFF"}</button>
      </div>
    </div>
  `;

  overlay.classList.add("show");
  document.getElementById("actionBtn").addEventListener("click", beginRound);
  document.getElementById("startSoundToggle").addEventListener("click", toggleSoundFromOverlay);
}

function tryJump() {
  if (!game.running) {
    beginRound();
    return;
  }

  if (!game.player || game.player.state !== "orbit") return;

  playJumpSound();

  const landingRadius = game.nextFlower.radius + 16;
  const endX = game.nextFlower.x + Math.cos(game.nextFlower.landingAngle) * landingRadius;
  const endY = game.nextFlower.y + Math.sin(game.nextFlower.landingAngle) * landingRadius;

  const launchAngle = getLaunchAngle();
  const diff = angleDistance(game.player.angle, launchAngle);
  const perfectWindow = getPerfectWindowAngle();

  game.player.state = "flight";
  game.player.flightProgress = 0;
  game.player.flightDuration = clamp(
    distance(game.player.x, game.player.y, endX, endY) / 720,
    0.16,
    0.34
  );
  game.player.startX = game.player.x;
  game.player.startY = game.player.y;
  game.player.endX = endX;
  game.player.endY = endY;
  game.player.awardedPoints = diff <= perfectWindow ? 2 : 1;
  game.player.landedAngle = game.nextFlower.landingAngle;
}

function completeJump() {
  const landedFlower = game.nextFlower;
  const points = game.player.awardedPoints;

  game.score += points;
  scoreEl.textContent = `Score: ${game.score}`;

  if (points === 2) {
    playPerfectSound();
  } else {
    playLandSound();
  }

  showPopup(
    points === 2 ? "PERFECT +2" : "+1",
    landedFlower.x,
    landedFlower.y - landedFlower.radius - 18,
    points === 2 ? "#d08b00" : "#2f9348"
  );

  addParticles(landedFlower.x, landedFlower.y, landedFlower.petal);

  game.currentFlower = landedFlower;
  game.flowerIndex += 1;
  game.nextFlower = makeNextFlower(game.currentFlower, game.flowerIndex);
  configureNextFlower(game.currentFlower, game.nextFlower);

  game.player.state = "orbit";
  game.player.orbitRadius = game.currentFlower.radius + 16;
  game.player.angle = game.player.landedAngle;
  updatePlayerAnchorPosition();
}

function updateClouds(dt) {
  for (const cloud of game.clouds) {
    cloud.x += cloud.s * dt;
    if (cloud.x - cloud.w > width + 40) {
      cloud.x = -cloud.w - 40;
      cloud.y = Math.random() * (height * 0.35);
    }
  }
}

function updatePollen(dt) {
  for (const p of game.pollen) {
    p.y += p.s * dt;
    p.x += p.drift * dt;

    if (p.y > height + 4) {
      p.y = -4;
      p.x = Math.random() * width;
    }
    if (p.x < -4) p.x = width + 4;
    if (p.x > width + 4) p.x = -4;
  }
}

function updateEffects(dt) {
  if (game.popup) {
    game.popup.life -= dt * 1.4;
    game.popup.y -= dt * 28;
    if (game.popup.life <= 0) {
      game.popup = null;
    }
  }

  if (game.cameraShake > 0) {
    game.cameraShake -= dt * 2.6;
    if (game.cameraShake < 0) game.cameraShake = 0;
  }

  for (const p of game.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 220 * dt;
    p.life -= dt;
  }
  game.particles = game.particles.filter((p) => p.life > 0);
}

function updatePlayer(dt) {
  const p = game.player;
  if (!p) return;

  p.wingPhase += dt * 24;

  if (p.state === "orbit") {
    p.angle += getRotationSpeed() * game.currentFlower.direction * dt;
    updatePlayerAnchorPosition();
  } else if (p.state === "flight") {
    p.flightProgress += dt / p.flightDuration;
    const t = clamp(p.flightProgress, 0, 1);
    const arc = Math.sin(t * Math.PI) * 34;

    p.x = p.startX + (p.endX - p.startX) * t;
    p.y = p.startY + (p.endY - p.startY) * t - arc;

    if (t >= 1) {
      completeJump();
    }
  }

  p.trail.push({ x: p.x, y: p.y, life: 1 });
  if (p.trail.length > 16) {
    p.trail.shift();
  }
  for (const tr of p.trail) {
    tr.life -= dt * 2.4;
  }
  p.trail = p.trail.filter((tr) => tr.life > 0);
}

function updateGame(dt) {
  updateClouds(dt);
  updatePollen(dt);
  updateEffects(dt);
  updatePlayer(dt);

  if (!game.running) return;

  game.timeLeft -= dt;
  if (game.timeLeft <= 0) {
    game.timeLeft = 0;
    timerEl.textContent = "0.0s";
    finishRound("TIME UP", "Your round is over.");
    return;
  }

  timerEl.textContent = `${game.timeLeft.toFixed(1)}s`;

  if (game.timeLeft <= 5) {
    game.cameraShake = Math.max(game.cameraShake, 0.18);
  }
}

function drawCloud(x, y, w, h, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#ffffff";

  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.25, h * 0.35, 0, 0, Math.PI * 2);
  ctx.ellipse(x + w * 0.18, y - h * 0.12, w * 0.24, h * 0.4, 0, 0, Math.PI * 2);
  ctx.ellipse(x + w * 0.4, y, w * 0.28, h * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBackground() {
  ctx.fillStyle = "#77ce68";
  ctx.fillRect(0, height * 0.84, width, height * 0.16);

  ctx.fillStyle = "#5db856";
  ctx.beginPath();
  ctx.moveTo(0, height * 0.88);
  for (let x = 0; x <= width; x += 24) {
    const y = height * 0.88 + Math.sin(x * 0.03) * 8;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  for (const cloud of game.clouds) {
    drawCloud(cloud.x, cloud.y, cloud.w, cloud.h, cloud.a);
  }

  for (const p of game.pollen) {
    ctx.save();
    ctx.globalAlpha = p.a;
    ctx.fillStyle = "#ffe57a";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawFlowerBase(flower, isTarget, nowSec) {
  const pulse = 1 + Math.sin(nowSec * 3 + flower.x * 0.015) * 0.04;
  const petalCount = 6;
  const petalRadius = flower.radius * 0.62;
  const petalDistance = flower.radius * 0.65;

  ctx.save();

  if (isTarget) {
    ctx.fillStyle = "rgba(255, 214, 90, 0.22)";
    ctx.beginPath();
    ctx.arc(
      flower.x,
      flower.y,
      flower.catchRadius + 10 + Math.sin(nowSec * 5) * 3,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  for (let i = 0; i < petalCount; i++) {
    const angle = (Math.PI * 2 * i) / petalCount + nowSec * 0.18 * flower.direction;
    const px = flower.x + Math.cos(angle) * petalDistance;
    const py = flower.y + Math.sin(angle) * petalDistance;

    ctx.fillStyle = flower.petal;
    ctx.beginPath();
    ctx.arc(px, py, petalRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = flower.center;
  ctx.beginPath();
  ctx.arc(flower.x, flower.y, flower.radius * 0.72, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(flower.x, flower.y, flower.radius * pulse, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawPerfectZoneOnNextFlower(flower, nowSec) {
  const spinAngle = nowSec * getRotationSpeed() * flower.direction;
  const perfect = flower.landingAngle + spinAngle;
  const perfectWindow = getPerfectWindowAngle();

  ctx.save();
  ctx.strokeStyle = "rgba(255, 214, 90, 0.98)";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(
    flower.x,
    flower.y,
    flower.catchRadius - 2,
    perfect - perfectWindow,
    perfect + perfectWindow
  );
  ctx.stroke();
  ctx.restore();
}

function drawThornsOnNextFlower(flower, nowSec) {
  const spinAngle = nowSec * getRotationSpeed() * flower.direction;

  for (const thornBase of flower.thorns) {
    const angle = thornBase + spinAngle;

    const tx = flower.x + Math.cos(angle) * flower.thornLength;
    const ty = flower.y + Math.sin(angle) * flower.thornLength;

    ctx.save();
    ctx.strokeStyle = "#8b2f3c";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.shadowBlur = 8;
    ctx.shadowColor = "#b43c4f";

    ctx.beginPath();
    ctx.moveTo(flower.x, flower.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    const hookCount = 4;
    for (let t = 1; t <= hookCount; t++) {
      const k = t / (hookCount + 1);
      const sx = flower.x + (tx - flower.x) * k;
      const sy = flower.y + (ty - flower.y) * k;

      const hookBaseAngle = angle + (t % 2 === 0 ? 1.2 : -1.2);
      const hookTipAngle = hookBaseAngle + (t % 2 === 0 ? 0.8 : -0.8);

      const hx1 = sx + Math.cos(hookBaseAngle) * 9;
      const hy1 = sy + Math.sin(hookBaseAngle) * 9;
      const hx2 = hx1 + Math.cos(hookTipAngle) * 5;
      const hy2 = hy1 + Math.sin(hookTipAngle) * 5;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(hx1, hy1);
      ctx.lineTo(hx2, hy2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawDirectionHint(flower) {
  const text = flower.direction === 1 ? "↻" : "↺";
  ctx.save();
  ctx.font = "bold 18px Arial";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(25,49,38,0.55)";
  ctx.fillText(text, flower.x, flower.y - flower.catchRadius - 16);
  ctx.restore();
}

function drawGuideLine() {
  if (!game.player || game.player.state !== "orbit") return;

  ctx.save();
  ctx.setLineDash([7, 10]);
  ctx.strokeStyle = "rgba(75, 96, 40, 0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(game.player.x, game.player.y);
  ctx.lineTo(game.nextFlower.x, game.nextFlower.y);
  ctx.stroke();
  ctx.restore();
}

function drawBee() {
  const p = game.player;
  if (!p) return;

  for (const t of p.trail) {
    ctx.save();
    ctx.globalAlpha = t.life * 0.45;
    ctx.fillStyle = "#ffe57a";
    ctx.beginPath();
    ctx.arc(t.x, t.y, 3.5 * t.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(p.x, p.y);

  let angle = 0;
  if (p.state === "flight") {
    angle = Math.atan2(p.endY - p.startY, p.endX - p.startX);
  } else {
    angle = p.angle + Math.PI / 2;
  }
  ctx.rotate(angle);

  const flap = Math.sin(p.wingPhase) * 0.5;

  ctx.save();
  ctx.rotate(-0.7 + flap * 0.3);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.beginPath();
  ctx.ellipse(-2, -8, 8, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.rotate(0.7 - flap * 0.3);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.beginPath();
  ctx.ellipse(-2, 8, 8, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#ffd447";
  ctx.beginPath();
  ctx.ellipse(0, 0, 12, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#1f1f1f";
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  ctx.moveTo(-5, -7);
  ctx.lineTo(-5, 7);
  ctx.moveTo(0, -8);
  ctx.lineTo(0, 8);
  ctx.moveTo(5, -7);
  ctx.lineTo(5, 7);
  ctx.stroke();

  ctx.fillStyle = "#1f1f1f";
  ctx.beginPath();
  ctx.arc(10, 0, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawParticles() {
  for (const p of game.particles) {
    ctx.save();
    ctx.globalAlpha = clamp(p.life, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawPopup() {
  if (!game.popup) return;

  ctx.save();
  ctx.globalAlpha = clamp(game.popup.life, 0, 1);
  ctx.textAlign = "center";
  ctx.font = "bold 18px Arial";
  ctx.fillStyle = game.popup.color;
  ctx.fillText(game.popup.text, game.popup.x, game.popup.y);
  ctx.restore();
}

function drawScene() {
  ctx.clearRect(0, 0, width, height);

  const shakeX = game.cameraShake > 0 ? rand(-4, 4) * game.cameraShake : 0;
  const shakeY = game.cameraShake > 0 ? rand(-3, 3) * game.cameraShake : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);

  drawBackground();

  const nowSec = performance.now() / 1000;

  if (game.currentFlower && game.nextFlower) {
    drawGuideLine();

    drawFlowerBase(game.currentFlower, false, nowSec);
    drawDirectionHint(game.currentFlower);

    drawFlowerBase(game.nextFlower, true, nowSec);
    drawPerfectZoneOnNextFlower(game.nextFlower, nowSec);
    drawThornsOnNextFlower(game.nextFlower, nowSec);
    drawDirectionHint(game.nextFlower);

    drawParticles();
    drawBee();
    drawPopup();
  }

  if (!game.running && !game.roundOver) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "16px Arial";
    ctx.fillStyle = "rgba(25,49,38,0.28)";
    ctx.fillText("Tap to begin", width / 2, height * 0.82);
    ctx.restore();
  }

  ctx.restore();
}

function gameLoop(timestamp) {
  if (!game.lastFrame) {
    game.lastFrame = timestamp;
  }

  const dt = Math.min((timestamp - game.lastFrame) / 1000, 0.03);
  game.lastFrame = timestamp;

  updateGame(dt);
  drawScene();
  requestAnimationFrame(gameLoop);
}

window.addEventListener("resize", () => {
  resizeCanvas();
  if (!game.running) {
    resetRound();
  }
});

canvas.addEventListener("pointerdown", tryJump);

document.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "Enter" || event.code === "ArrowUp") {
    event.preventDefault();
    tryJump();
  }
});

actionBtn.addEventListener("click", beginRound);
soundToggleBtn.addEventListener("click", toggleSound);
startSoundToggleBtn.addEventListener("click", toggleSound);

loadPrefs();
resizeCanvas();
resetRound();
requestAnimationFrame(gameLoop);
