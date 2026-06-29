// ── Constants ─────────────────────────────────────────────────────────────────
const CANVAS_W      = 900;
const CANVAS_H      = 600;
const PLAYER_SPEED  = 180;   // px/s
const PLAYER_R      = 12;    // body circle radius
const BULLET_SPEED  = 520;   // px/s
const BULLET_R      = 4;
const START_AMMO    = 7;
const AMMO_PER_KILL = 3;

// ── Canvas setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
canvas.width  = CANVAS_W;
canvas.height = CANVAS_H;

// ── Game state ────────────────────────────────────────────────────────────────
const State = {
  START:       'START',
  PLAYING:     'PLAYING',
  DEAD:        'DEAD',
  LEVEL_CLEAR: 'LEVEL_CLEAR',
};
let gameState = State.START;

// ── Persistent stats (localStorage) ───────────────────────────────────────────
function loadStats() {
  return {
    hiScore:    parseInt(localStorage.getItem('fp_hiScore')    || '0', 10),
    bestLevel:  parseInt(localStorage.getItem('fp_bestLevel')  || '0', 10),
    totalKills: parseInt(localStorage.getItem('fp_totalKills') || '0', 10),
    totalShots: parseInt(localStorage.getItem('fp_totalShots') || '0', 10),
    totalHits:  parseInt(localStorage.getItem('fp_totalHits')  || '0', 10),
  };
}
function saveStats(s) {
  localStorage.setItem('fp_hiScore',    s.hiScore);
  localStorage.setItem('fp_bestLevel',  s.bestLevel);
  localStorage.setItem('fp_totalKills', s.totalKills);
  localStorage.setItem('fp_totalShots', s.totalShots);
  localStorage.setItem('fp_totalHits',  s.totalHits);
}
function fmtAccuracy(hits, shots) {
  return shots === 0 ? '—' : Math.round((hits / shots) * 100) + '%';
}

// ── Run session stats ──────────────────────────────────────────────────────────
let session = { shots: 0, hits: 0 };

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; });
window.addEventListener('keyup',   e => { keys[e.code] = false; });

const mouse = { x: CANVAS_W / 2, y: CANVAS_H / 2, fired: false };
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left;
  mouse.y = e.clientY - r.top;
});
canvas.addEventListener('mousedown', e => {
  if (e.button === 0 && gameState === State.PLAYING) mouse.fired = true;
});

// ── Player ────────────────────────────────────────────────────────────────────
const player = {
  x: CANVAS_W / 2,
  y: CANVAS_H / 2,
  angle: 0,
  ammo: START_AMMO,
};

function updatePlayer(dt) {
  let dx = 0, dy = 0;
  if (keys['KeyW'] || keys['ArrowUp'])    dy -= 1;
  if (keys['KeyS'] || keys['ArrowDown'])  dy += 1;
  if (keys['KeyA'] || keys['ArrowLeft'])  dx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) dx += 1;

  if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }

  player.x += dx * PLAYER_SPEED * dt;
  player.y += dy * PLAYER_SPEED * dt;
  player.x = Math.max(PLAYER_R, Math.min(CANVAS_W - PLAYER_R, player.x));
  player.y = Math.max(PLAYER_R, Math.min(CANVAS_H - PLAYER_R, player.y));
  player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
}

function drawPlayer() {
  const { x, y, angle } = player;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Body circle
  ctx.beginPath();
  ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2);
  ctx.fillStyle   = '#4af';
  ctx.strokeStyle = '#8cf';
  ctx.lineWidth   = 2;
  ctx.fill();
  ctx.stroke();

  // Gun barrel
  ctx.beginPath();
  ctx.moveTo(PLAYER_R, 0);
  ctx.lineTo(PLAYER_R + 14, 0);
  ctx.strokeStyle = '#cef';
  ctx.lineWidth   = 3;
  ctx.stroke();

  // Head dot
  ctx.beginPath();
  ctx.arc(4, 0, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#8df';
  ctx.fill();

  ctx.restore();
}

// ── Bullets ───────────────────────────────────────────────────────────────────
let bullets = [];

function spawnBullet() {
  if (player.ammo <= 0) return;
  player.ammo--;
  session.shots++;

  const tip = PLAYER_R + 14;
  bullets.push({
    x:  player.x + Math.cos(player.angle) * tip,
    y:  player.y + Math.sin(player.angle) * tip,
    vx: Math.cos(player.angle) * BULLET_SPEED,
    vy: Math.sin(player.angle) * BULLET_SPEED,
  });
}

function updateBullets(dt) {
  // Handle click-to-fire
  if (mouse.fired) {
    mouse.fired = false;
    spawnBullet();
  }

  bullets = bullets.filter(b => {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    return b.x > -BULLET_R && b.x < CANVAS_W + BULLET_R &&
           b.y > -BULLET_R && b.y < CANVAS_H + BULLET_R;
  });
}

function drawBullets() {
  bullets.forEach(b => {
    // Glowing core
    ctx.beginPath();
    ctx.arc(b.x, b.y, BULLET_R, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe066';
    ctx.fill();

    // Outer glow
    ctx.beginPath();
    ctx.arc(b.x, b.y, BULLET_R + 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,220,80,0.35)';
    ctx.lineWidth   = 2;
    ctx.stroke();
  });
}

// ── Draw scene ────────────────────────────────────────────────────────────────
function drawScene() {
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.strokeStyle = '#252525';
  ctx.lineWidth   = 1;
  const GRID = 60;
  for (let gx = 0; gx < CANVAS_W; gx += GRID) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, CANVAS_H); ctx.stroke();
  }
  for (let gy = 0; gy < CANVAS_H; gy += GRID) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(CANVAS_W, gy); ctx.stroke();
  }

  drawBullets();
  drawPlayer();
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function drawHUD() {
  const PAD = 10;

  // Ammo counter — bottom right
  const ammoText = `AMMO  ${player.ammo}`;
  ctx.font      = 'bold 18px Courier New';
  ctx.textAlign = 'right';
  ctx.fillStyle = player.ammo > 0 ? '#ffe066' : '#ff4422';
  ctx.fillText(ammoText, CANVAS_W - PAD, CANVAS_H - PAD);

  // Ammo pips
  for (let i = 0; i < START_AMMO + 12; i++) {
    const px = CANVAS_W - PAD - 12 - i * 12;
    const py = CANVAS_H - PAD - 26;
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = i < player.ammo ? '#ffe066' : '#333';
    ctx.fill();
    ctx.strokeStyle = '#555';
    ctx.lineWidth   = 1;
    ctx.stroke();
  }

  // Session accuracy — bottom left
  ctx.font      = '13px Courier New';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#777';
  ctx.fillText(`ACC  ${fmtAccuracy(session.hits, session.shots)}   SHOTS  ${session.shots}`, PAD, CANVAS_H - PAD);
}

// ── Screen helpers ─────────────────────────────────────────────────────────────
function showScreen(id) {
  ['start-screen', 'death-screen', 'level-screen'].forEach(s =>
    document.getElementById(s).classList.toggle('hidden', s !== id));
}
function hideAllScreens() {
  ['start-screen', 'death-screen', 'level-screen'].forEach(s =>
    document.getElementById(s).classList.add('hidden'));
}

// ── Start screen stats ────────────────────────────────────────────────────────
function refreshStartScreen() {
  const s = loadStats();
  document.getElementById('stat-hiscore').textContent   = s.hiScore;
  document.getElementById('stat-bestlevel').textContent = s.bestLevel > 0 ? s.bestLevel : '—';
  document.getElementById('stat-kills').textContent     = s.totalKills;
  document.getElementById('stat-accuracy').textContent  = fmtAccuracy(s.totalHits, s.totalShots);
}

// ── Game loop ─────────────────────────────────────────────────────────────────
let lastTime = 0;
function loop(ts) {
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  if (gameState === State.PLAYING) {
    updatePlayer(dt);
    updateBullets(dt);
    drawScene();
    drawHUD();
  }

  requestAnimationFrame(loop);
}

// ── Game init ─────────────────────────────────────────────────────────────────
function startGame() {
  player.x     = CANVAS_W / 2;
  player.y     = CANVAS_H / 2;
  player.angle = 0;
  player.ammo  = START_AMMO;
  bullets      = [];
  session      = { shots: 0, hits: 0 };
  hideAllScreens();
  gameState = State.PLAYING;
}

// ── Button wiring ─────────────────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click',      () => startGame());
document.getElementById('btn-restart').addEventListener('click',    () => startGame());
document.getElementById('btn-next-level').addEventListener('click', () => startGame());

// ── Boot ──────────────────────────────────────────────────────────────────────
refreshStartScreen();
showScreen('start-screen');
ctx.fillStyle = '#1a1a1a';
ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
requestAnimationFrame(ts => { lastTime = ts; requestAnimationFrame(loop); });
