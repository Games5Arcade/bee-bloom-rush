const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const overlay = document.getElementById("overlay");
const actionBtn = document.getElementById("actionBtn");
const timerEl = document.getElementById("timer");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");

const ROUND_TIME = 30;
const STORAGE_KEY = "beeBloomRushHighScore";

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
  lastFrame: 0,
  clouds: [],
  pollen: [],
  player: null,
  currentFlower: null,
  nextFlower: null,
  popup: null,
  shake: 0,
};

function ensureAudio() {
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
  playTone("triangle", 520, 0.12, 0.04, 700);
}

function playLandSound() {
  playTone("sine", 620, 0.10, 0.035, 760);
}

function playPerfectSound() {
  playTone("triangle", 760, 0.12, 0.045, 980);
  setTimeout(() => playTone("triangle", 980, 0.10, 0.035, 1200), 60);
}

function playFailSound() {
  playTone("sawtooth", 240, 0.22, 0.03, 110);
}

function playTimeUpSound() {
  playTone("triangle", 660, 0.12, 0.035, 840);
  setTimeout(() => playTone("triangle", 840, 0.12, 0.03, 1040), 70);
}

function loadBestScore() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = Number(saved || 0);
    game.bestScore = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
  } catch (err) {
    game.bestScore = 0;
  }
  bestEl.textContent = `Best: ${game.bestScore}`;
}

function saveBestScore() {
  try {
    localStorage.setItem(STORAGE_KEY, String(game.bestScore));
  } catch (err) {
    // Ignore storage failure.
  }
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

  if (!game.player) {
    resetGameState();
  }
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
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
  const count = Math.floor((width * height) / 14000);

  for (let i = 0; i < count; i++) {
    game.pollen.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: rand(1.2, 2.4),
      s: rand(10, 24),
      drift: rand(-8, 8),
      a: rand(0.25, 0.65),
    });
  }
}

function getThornSettings(elapsed) {
  if (elapsed < 8) {
    return { count: 0, speed: 0 };
  }
  if (elapsed < 16) {
    return { count: 1, speed: 0.55 };
  }
  if (elapsed < 24) {
    return { count: 1, speed: 0.95 };
  }
  if (elapsed < 25) {
    return { count: 2, speed: 1.3 };
  }
  return { count: 2, speed: 1.85 };
}

function makeFlower(x, y, radius) {
  const palette = [
    { petal: "#ff77b7", center: "#ffd84d" },
    { petal: "#b07cff", center: "#ffd84d" },
    { petal: "#ffb35c", center: "#fff08a" },
    { petal: "#ff6f91", center: "#ffe36b" },
  ];
  const style = palette[Math.floor(Math.random() * palette.length)];

  return {
    x,
    y,
    radius,
    catchRadius: radius * 1.7,
    perfectRadius: radius * 0.5,
    baseAngle: rand(0, Math.PI * 2),
    thornLength: radius * 1.9,
    petal: style.petal,
    center: style.center,
  };
}

function makeStartFlower() {
  return makeFlower(width * 0.28, height * 0.62, 28);
}

function makeNextFlower(fromFlower) {
  const margin = 82;
  const minDistance = Math.min(width, height) * 0.23;
  const maxDistance = Math.min(width, height) * 0.36;

  for (let i = 0; i < 60; i++) {
    const angle = rand(-1.1, 1.1);
    const range = rand(minDistance, maxDistance);

    const x = fromFlower.x + Math.cos(angle) * range;
    const y = fromFlower.y + Math.sin(angle) * range;

    if (x > margin && x < width - margin && y > 115 && y < height - margin) {
      return makeFlower(x, y, rand(23, 32));
    }
  }

  return makeFlower(width * 0.72, height * 0.5, 26);
}

function getSafeAnchorAngle(flower, elapsed) {
  const thornSettings = getThornSettings(elapsed);
  const baseRotationSpeed = 1.1;
  const movingAngle = flower.baseAngle + elapsed * baseRotationSpeed;

  if (thornSettings.count <= 0) {
    return movingAngle + Math.PI;
  }

  if (thornSettings.count === 1) {
    return flower.baseAngle + elapsed * thornSettings.speed + Math.PI;
  }

  return flower.baseAngle + elapsed * thornSettings.speed + Math.PI / 2;
}

function updateAnchoredBeePosition() {
  const p = game.player;
  const f = game.currentFlower;
  p.x = f.x + Math.cos(p.anchorAngle) * p.anchorRadius;
  p.y = f.y + Math.sin(p.anchorAngle) * p.anchorRadius;
}

function showPopup(text, x, y, color) {
  game.popup = {
    text,
    x,
    y,
    color,
    life: 1.0,
  };
}

function resetGameState() {
  game.score = 0;
  game.timeLeft = ROUND_TIME;
  game.roundOver = false;
  game.popup = null;
  game.shake = 0;

  scoreEl.textContent = "Score: 0";
  timerEl.textContent = `${ROUND_TIME.toFixed(1)}s`;
  bestEl.textContent = `Best: ${game.bestScore}`;

  game.currentFlower = makeStartFlower();
  game.nextFlower = makeNextFlower(game.currentFlower);

  const initialElapsed = 0;
  const initialAnchor = getSafeAnchorAngle(game.currentFlower, initialElapsed);

  game.player = {
    mode: "anchor",
    x: 0,
    y: 0,
    radius: 11,
    anchorRadius: game.currentFlower.radius + 16,
    anchorAngle: initialAnchor,
    vx: 0,
    vy: 0,
    trail: [],
    wingPhase: 0,
  };

  updateAnchoredBeePosition();
}

function beginRound() {
  ensureAudio();
  playTapSound();
  resetGameState();
  game.running = true;
  overlay.classList.remove("show");
}

async function shareScore() {
  const isHosted = window.location.protocol.startsWith("http");
  const url = isHosted ? window.location.href : "Play Bee Bloom Rush once it is hosted online.";
  const text = `I scored ${game.score} in Bee Bloom Rush! Can you beat me?`;
  const fullMessage = `${text}\n${url}`;

  try {
    if (navigator.share && isHosted) {
      await navigator.share({
        title: "Bee Bloom Rush",
        text,
        url: window.location.href
      });
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(fullMessage);
      alert("Score message copied. Paste it into social media or messages.");
      return;
    }

    alert(fullMessage);
  } catch (err) {
    // user cancelled or browser blocked; ignore quietly
  }
}

function finishRound(message, soundType = "fail") {
  game.running = false;
  game.roundOver = true;

  if (soundType === "timeup") {
    playTimeUpSound();
  } else {
    playFailSound();
  }

  if (game.score > game.bestScore) {
    game.bestScore = game.score;
    saveBestScore();
  }

  bestEl.textContent = `Best: ${game.bestScore}`;

  overlay.innerHTML = `
    <div class="panel">
      <h1>${message.title}</h1>
      <p class="lead">${message.text}</p>
      <div class="rules">
        <div><strong>Round score:</strong> ${game.score}</div>
        <div><strong>High score:</strong> ${game.bestScore}</div>
        <div><strong>Round length:</strong> ${ROUND_TIME} seconds</div>
        <div><strong>Tip:</strong> Perfect centre landings score more, and the last 5 seconds are the hardest.</div>
      </div>
      <div class="button-row">
        <button id="restartBtn" class="primary-btn">Play Again</button>
        <button id="shareBtn" class="secondary-btn">Share Score</button>
      </div>
    </div>
  `;

  overlay.classList.add("show");

  document.getElementById("restartBtn").addEventListener("click", beginRound);
  document.getElementById("shareBtn").addEventListener("click", shareScore);
}

function launchBee() {
  ensureAudio();

  if (!game.running) {
    beginRound();
    return;
  }

  const p = game.player;
  if (p.mode !== "anchor") return;

  playJumpSound();

  const dx = game.nextFlower.x - p.x;
  const dy = game.nextFlower.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const jumpSpeed = 400;

  p.mode = "jump";
  p.vx = (dx / len) * jumpSpeed;
  p.vy = (dy / len) * jumpSpeed;
}

function pointSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy || 1;

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = clamp(t, 0, 1);

  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return distance(px, py, cx, cy);
}

function flowerThornHit(flower, settings, px, py, pr, elapsed) {
  if (settings.count <= 0) return false;

  for (let i = 0; i < settings.count; i++) {
    const angle = flower.baseAngle + elapsed * settings.speed + (Math.PI * 2 * i) / settings.count;
    const tx = flower.x + Math.cos(angle) * flower.thornLength;
    const ty = flower.y + Math.sin(angle) * flower.thornLength;
    const d = pointSegmentDistance(px, py, flower.x, flower.y, tx, ty);

    if (d <= pr + 4) {
      return true;
    }
  }

  return false;
}

function applyLandingScore(flower, landingDistance) {
  let gained = 1;

  if (landingDistance <= flower.perfectRadius) {
    gained = 2;
    showPopup("PERFECT +2", flower.x, flower.y - flower.radius - 18, "#d08b00");
    playPerfectSound();
  } else {
    showPopup("+1", flower.x, flower.y - flower.radius - 14, "#2f9348");
    playLandSound();
  }

  game.score += gained;
  scoreEl.textContent = `Score: ${game.score}`;
}

function tryLanding(elapsed) {
  const p = game.player;
  const d = distance(p.x, p.y, game.nextFlower.x, game.nextFlower.y);

  if (d <= game.nextFlower.catchRadius) {
    const landedFlower = game.nextFlower;
    const landingDistance = d;

    game.currentFlower = landedFlower;
    game.nextFlower = makeNextFlower(game.currentFlower);

    p.mode = "anchor";
    p.anchorRadius = game.currentFlower.radius + 16;
    p.anchorAngle = getSafeAnchorAngle(game.currentFlower, elapsed);

    updateAnchoredBeePosition();
    applyLandingScore(landedFlower, landingDistance);
    return;
  }

  if (p.x < -60 || p.x > width + 60 || p.y < -60 || p.y > height + 60) {
    finishRound(
      {
        title: "ROUND OVER",
        text: "Your bee missed the next flower.",
      },
      "fail"
    );
  }
}

function updateGame(dt) {
  for (const cloud of game.clouds) {
    cloud.x += cloud.s * dt;
    if (cloud.x - cloud.w > width + 40) {
      cloud.x = -cloud.w - 40;
      cloud.y = Math.random() * (height * 0.35);
    }
  }

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

  if (game.popup) {
    game.popup.life -= dt * 1.4;
    game.popup.y -= dt * 26;
    if (game.popup.life <= 0) {
      game.popup = null;
    }
  }

  if (game.shake > 0) {
    game.shake -= dt * 2.5;
    if (game.shake < 0) game.shake = 0;
  }

  if (!game.running) return;

  game.timeLeft -= dt;
  if (game.timeLeft <= 0) {
    game.timeLeft = 0;
    timerEl.textContent = `0.0s`;
    finishRound(
      {
        title: "TIME UP",
        text: "Your bee survived the full round.",
      },
      "timeup"
    );
    return;
  }

  timerEl.textContent = `${game.timeLeft.toFixed(1)}s`;

  const elapsed = ROUND_TIME - game.timeLeft;
  const thornSettings = getThornSettings(elapsed);
  const p = game.player;
  p.wingPhase += dt * 25;

  if (game.timeLeft <= 5) {
    game.shake = Math.max(game.shake, 0.35);
  }

  if (p.mode === "anchor") {
    p.anchorAngle = getSafeAnchorAngle(game.currentFlower, elapsed);
    updateAnchoredBeePosition();
  } else {
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (flowerThornHit(game.nextFlower, thornSettings, p.x, p.y, p.radius, elapsed)) {
      finishRound(
        {
          title: "ROUND OVER",
          text: "Your bee flew into a thorn stem.",
        },
        "fail"
      );
      return;
    }

    tryLanding(elapsed);
  }

  p.trail.push({ x: p.x, y: p.y, life: 1 });
  if (p.trail.length > 18) {
    p.trail.shift();
  }

  for (const trail of p.trail) {
    trail.life -= dt * 2.4;
  }

  p.trail = p.trail.filter((t) => t.life > 0);
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

function drawFlower(flower, isTarget, elapsed) {
  const pulse = 1 + Math.sin(elapsed * 3 + flower.x * 0.015) * 0.04;
  const petalCount = 6;
  const petalRadius = flower.radius * 0.62;
  const petalDistance = flower.radius * 0.65;
  const panic = game.timeLeft <= 5;

  ctx.save();

  if (isTarget) {
    const targetGlow = panic ? "rgba(200, 60, 79, 0.30)" : "rgba(255, 214, 90, 0.32)";
    ctx.fillStyle = targetGlow;
    ctx.beginPath();
    ctx.arc(flower.x, flower.y, flower.catchRadius + 10 + Math.sin(elapsed * 5) * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < petalCount; i++) {
    const angle = (Math.PI * 2 * i) / petalCount + elapsed * 0.2;
    const px = flower.x + Math.cos(angle) * petalDistance;
    const py = flower.y + Math.sin(angle) * petalDistance;

    ctx.fillStyle = panic && isTarget ? "#ff8a9a" : flower.petal;
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

  ctx.strokeStyle = isTarget
    ? (panic ? "rgba(200,60,79,0.95)" : "rgba(255, 214, 90, 0.95)")
    : "rgba(255,255,255,0.22)";
  ctx.lineWidth = isTarget ? 3.5 : 2;
  ctx.setLineDash(isTarget ? [] : [6, 8]);
  ctx.beginPath();
  ctx.arc(flower.x, flower.y, flower.catchRadius, 0, Math.PI * 2);
  ctx.stroke();

  if (isTarget) {
    ctx.setLineDash([3, 7]);
    ctx.strokeStyle = panic ? "rgba(200,60,79,0.7)" : "rgba(255,214,90,0.65)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(flower.x, flower.y, flower.perfectRadius, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();

  const thornSettings = getThornSettings(elapsed);
  if (thornSettings.count <= 0) return;

  for (let i = 0; i < thornSettings.count; i++) {
    const angle =
      flower.baseAngle +
      elapsed * thornSettings.speed +
      (Math.PI * 2 * i) / thornSettings.count;

    const tx = flower.x + Math.cos(angle) * flower.thornLength;
    const ty = flower.y + Math.sin(angle) * flower.thornLength;

    ctx.save();
    ctx.strokeStyle = panic ? "#c83c4f" : "#7c2f39";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(flower.x, flower.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    const thornCount = 3;
    for (let t = 1; t <= thornCount; t++) {
      const k = t / (thornCount + 1);
      const sx = flower.x + (tx - flower.x) * k;
      const sy = flower.y + (ty - flower.y) * k;
      const side = (t % 2 === 0 ? 1 : -1) * 0.75;
      const ta = angle + side;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(ta) * 9, sy + Math.sin(ta) * 9);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawGuideLine() {
  const p = game.player;
  if (!p || p.mode !== "anchor") return;

  const panic = game.timeLeft <= 5;

  ctx.save();
  ctx.setLineDash([7, 10]);
  ctx.strokeStyle = panic ? "rgba(200,60,79,0.36)" : "rgba(75, 96, 40, 0.3)";
  ctx.lineWidth = panic ? 2.5 : 2;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
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
  if (p.mode === "jump") {
    angle = Math.atan2(p.vy, p.vx);
  } else {
    angle = p.anchorAngle + Math.PI / 2;
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

  ctx.strokeStyle = "#1f1f1f";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(11, -3);
  ctx.quadraticCurveTo(15, -9, 18, -10);
  ctx.moveTo(11, 3);
  ctx.quadraticCurveTo(15, 9, 18, 10);
  ctx.stroke();

  ctx.restore();
}

function drawPhaseHint(elapsed) {
  let text = "BUZZING";
  let color = "#2f9348";

  if (elapsed >= 8 && elapsed < 16) {
    text = "THORNS ACTIVE";
    color = "#a46f00";
  } else if (elapsed >= 16 && elapsed < 24) {
    text = "FASTER THORNS";
    color = "#c26b00";
  } else if (elapsed >= 24 && elapsed < 25) {
    text = "WILD GARDEN";
    color = "#a12b3a";
  } else if (elapsed >= 25) {
    text = "PANIC MODE";
    color = "#c83c4f";
  }

  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "bold 14px Arial";
  ctx.fillStyle = color;
  ctx.fillText(text, width / 2, 36);
  ctx.restore();
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

function drawPanicOverlay() {
  if (game.timeLeft > 5 || !game.running) return;

  const strength = (5 - game.timeLeft) / 5;
  ctx.save();
  ctx.fillStyle = `rgba(200,60,79,${0.05 + strength * 0.08})`;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawScene() {
  ctx.clearRect(0, 0, width, height);

  const shakeX = game.shake > 0 ? rand(-4, 4) * game.shake : 0;
  const shakeY = game.shake > 0 ? rand(-3, 3) * game.shake : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);

  drawBackground();

  const elapsed = ROUND_TIME - game.timeLeft;

  if (game.currentFlower) {
    drawGuideLine();
    drawFlower(game.currentFlower, false, elapsed);
    drawFlower(game.nextFlower, true, elapsed);
    drawBee();
    drawPhaseHint(elapsed);
    drawPopup();
  }

  drawPanicOverlay();

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

window.addEventListener("resize", resizeCanvas);

canvas.addEventListener("pointerdown", launchBee);

document.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "Enter" || event.code === "ArrowUp") {
    event.preventDefault();
    launchBee();
  }
});

actionBtn.addEventListener("click", beginRound);

loadBestScore();
resizeCanvas();
requestAnimationFrame(gameLoop);