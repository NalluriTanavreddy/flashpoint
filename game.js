// ── Constants ─────────────────────────────────────────────────────────────────
const CANVAS_W     = 900;
const CANVAS_H     = 600;
const PLAYER_SPEED = 180;   // px/s
const PLAYER_R     = 12;    // body circle radius

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

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; });
window.addEventListener('keyup',   e => { keys[e.code] = false; });

const mouse = { x: CANVAS_W / 2, y: CANVAS_H / 2 };
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left;
  mouse.y = e.clientY - r.top;
});

// ── Player ────────────────────────────────────────────────────────────────────
const player = {
  x:     CANVAS_W / 2,
  y:     CANVAS_H / 2,
  angle: 0,           // radians, faces right by default
};

function updatePlayer(dt) {
  let dx = 0, dy = 0;
  if (keys['KeyW'] || keys['ArrowUp'])    dy -= 1;
  if (keys['KeyS'] || keys['ArrowDown'])  dy += 1;
  if (keys['KeyA'] || keys['ArrowLeft'])  dx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) dx += 1;

  if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; } // normalise diagonal

  player.x += dx * PLAYER_SPEED * dt;
  player.y += dy * PLAYER_SPEED * dt;

  // Keep inside canvas
  player.x = Math.max(PLAYER_R, Math.min(CANVAS_W - PLAYER_R, player.x));
  player.y = Math.max(PLAYER_R, Math.min(CANVAS_H - PLAYER_R, player.y));

  // Face the mouse
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

// ── Draw scene ────────────────────────────────────────────────────────────────
function drawScene() {
  // Floor
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Grid lines (subtle)
  ctx.strokeStyle = '#252525';
  ctx.lineWidth   = 1;
  const GRID = 60;
  for (let gx = 0; gx < CANVAS_W; gx += GRID) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, CANVAS_H); ctx.stroke();
  }
  for (let gy = 0; gy < CANVAS_H; gy += GRID) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(CANVAS_W, gy); ctx.stroke();
  }

  drawPlayer();
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function drawHUD() {
  ctx.fillStyle = '#aaa';
  ctx.font      = '13px Courier New';
  ctx.textAlign = 'left';
  ctx.fillText('WASD: Move   Mouse: Aim', 10, CANVAS_H - 10);
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
  const dt = Math.min((ts - lastTime) / 1000, 0.05); // cap at 50 ms
  lastTime = ts;

  if (gameState === State.PLAYING) {
    updatePlayer(dt);
    drawScene();
    drawHUD();
  }

  requestAnimationFrame(loop);
}

// ── Game init ─────────────────────────────────────────────────────────────────
function startGame() {
  player.x = CANVAS_W / 2;
  player.y = CANVAS_H / 2;
  player.angle = 0;
  hideAllScreens();
  gameState = State.PLAYING;
}

// ── Button wiring ─────────────────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', () => {
  startGame();
});
document.getElementById('btn-restart').addEventListener('click', () => {
  startGame();
});
document.getElementById('btn-next-level').addEventListener('click', () => {
  startGame();
});

// ── Boot ──────────────────────────────────────────────────────────────────────
refreshStartScreen();
showScreen('start-screen');

// Draw a static preview behind the start screen
ctx.fillStyle = '#1a1a1a';
ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

requestAnimationFrame(ts => { lastTime = ts; requestAnimationFrame(loop); });
