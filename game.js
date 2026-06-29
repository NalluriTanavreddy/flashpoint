// ── Constants ─────────────────────────────────────────────────────────────────
const CANVAS_W      = 900;
const CANVAS_H      = 600;
const PLAYER_SPEED  = 180;   // px/s
const PLAYER_R      = 12;
const BULLET_SPEED  = 520;   // px/s
const BULLET_R      = 4;
const START_AMMO    = 7;
const AMMO_PER_KILL = 3;
const ENEMY_SPEED   = 58;    // px/s
const ENEMY_R       = 18;    // collision radius
const ENEMY_MAX_HP  = 2;

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

// ── Persistent stats ──────────────────────────────────────────────────────────
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
let session = { shots: 0, hits: 0, kills: 0 };

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
const player = { x: CANVAS_W / 2, y: CANVAS_H / 2, angle: 0, ammo: START_AMMO };

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
  ctx.beginPath();
  ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2);
  ctx.fillStyle = '#4af'; ctx.strokeStyle = '#8cf'; ctx.lineWidth = 2;
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(PLAYER_R, 0); ctx.lineTo(PLAYER_R + 14, 0);
  ctx.strokeStyle = '#cef'; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath();
  ctx.arc(4, 0, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#8df'; ctx.fill();
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
  if (mouse.fired) { mouse.fired = false; spawnBullet(); }
  for (const b of bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
  bullets = bullets.filter(b =>
    b.x > -BULLET_R && b.x < CANVAS_W + BULLET_R &&
    b.y > -BULLET_R && b.y < CANVAS_H + BULLET_R
  );
}

function drawBullets() {
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, BULLET_R, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe066'; ctx.fill();
    ctx.beginPath();
    ctx.arc(b.x, b.y, BULLET_R + 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,220,80,0.35)'; ctx.lineWidth = 2; ctx.stroke();
  }
}

// ── Enemies ───────────────────────────────────────────────────────────────────
let enemies = [];

function spawnEnemies(positions) {
  enemies = positions.map(([x, y]) => ({ x, y, hp: ENEMY_MAX_HP, angle: 0, flashTimer: 0 }));
}

function updateEnemies(dt) {
  for (const e of enemies) {
    // Walk toward player
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      e.x += (dx / dist) * ENEMY_SPEED * dt;
      e.y += (dy / dist) * ENEMY_SPEED * dt;
    }
    e.angle = Math.atan2(dy, dx);
    if (e.flashTimer > 0) e.flashTimer -= dt;
  }
}

// Bullet ↔ enemy collisions; returns kill count this frame
function resolveBulletEnemyCollisions() {
  let kills = 0;
  const liveBullets  = [];
  const liveEnemies  = [];

  for (const b of bullets) {
    let hit = false;
    for (const e of enemies) {
      if (Math.hypot(b.x - e.x, b.y - e.y) < ENEMY_R + BULLET_R) {
        hit = true;
        e.hp--;
        e.flashTimer = 0.12;
        session.hits++;
        if (e.hp <= 0) {
          kills++;
          session.kills++;
          player.ammo += AMMO_PER_KILL;
        } else {
          liveEnemies.push(e);
        }
        break;
      }
    }
    // Keep enemies that weren't just killed (avoid double-push)
    if (!hit) liveBullets.push(b);
  }

  // Survivors = enemies never hit this frame + enemies hit but still alive
  // (liveEnemies already has the hurt-but-alive ones; add untouched ones)
  const hitSet = new Set(liveEnemies);
  for (const e of enemies) {
    if (e.hp > 0 && !hitSet.has(e)) liveEnemies.push(e);
  }

  bullets = liveBullets;
  enemies = liveEnemies;
  return kills;
}

function drawStickFigure(e) {
  const flash = e.flashTimer > 0;
  const col   = flash ? '#fff' : (e.hp === ENEMY_MAX_HP ? '#e44' : '#f96');

  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.angle);
  ctx.strokeStyle = col;
  ctx.lineWidth   = 2.5;
  ctx.lineCap     = 'round';

  // Head
  ctx.beginPath();
  ctx.arc(0, -14, 7, 0, Math.PI * 2);
  ctx.fillStyle = col; ctx.fill(); ctx.stroke();

  // Body
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(0, 8); ctx.stroke();

  // Arms
  ctx.beginPath();
  ctx.moveTo(-9, -2); ctx.lineTo(9, -2); ctx.stroke();

  // Legs
  ctx.beginPath();
  ctx.moveTo(0, 8); ctx.lineTo(-7, 20);
  ctx.moveTo(0, 8); ctx.lineTo(7,  20);
  ctx.stroke();

  ctx.restore();
}

function drawEnemyHPBar(e) {
  const W = 34, H = 5;
  const bx = e.x - W / 2;
  const by = e.y - 36;

  ctx.fillStyle = '#400';
  ctx.fillRect(bx, by, W, H);

  ctx.fillStyle = e.hp === ENEMY_MAX_HP ? '#4f4' : '#f84';
  ctx.fillRect(bx, by, W * (e.hp / ENEMY_MAX_HP), H);

  ctx.strokeStyle = '#666'; ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, W, H);
}

function drawEnemies() {
  for (const e of enemies) {
    drawStickFigure(e);
    drawEnemyHPBar(e);
  }
}

// ── Draw scene ────────────────────────────────────────────────────────────────
function drawScene() {
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.strokeStyle = '#252525'; ctx.lineWidth = 1;
  const GRID = 60;
  for (let gx = 0; gx < CANVAS_W; gx += GRID) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, CANVAS_H); ctx.stroke();
  }
  for (let gy = 0; gy < CANVAS_H; gy += GRID) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(CANVAS_W, gy); ctx.stroke();
  }
  drawBullets();
  drawEnemies();
  drawPlayer();
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function drawHUD() {
  const PAD = 10;

  // Kills remaining — top centre
  ctx.font = 'bold 15px Courier New'; ctx.textAlign = 'center';
  ctx.fillStyle = '#ccc';
  ctx.fillText(`ENEMIES  ${enemies.length}`, CANVAS_W / 2, 24);

  // Ammo — bottom right
  ctx.font = 'bold 18px Courier New'; ctx.textAlign = 'right';
  ctx.fillStyle = player.ammo > 0 ? '#ffe066' : '#ff4422';
  ctx.fillText(`AMMO  ${player.ammo}`, CANVAS_W - PAD, CANVAS_H - PAD);

  const maxPips = START_AMMO + 12;
  for (let i = 0; i < maxPips; i++) {
    const px = CANVAS_W - PAD - 12 - i * 12;
    const py = CANVAS_H - PAD - 26;
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = i < player.ammo ? '#ffe066' : '#333'; ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.stroke();
  }

  // Accuracy — bottom left
  ctx.font = '13px Courier New'; ctx.textAlign = 'left'; ctx.fillStyle = '#777';
  ctx.fillText(`ACC  ${fmtAccuracy(session.hits, session.shots)}   KILLS  ${session.kills}`, PAD, CANVAS_H - PAD);
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
    updateEnemies(dt);
    resolveBulletEnemyCollisions();
    drawScene();
    drawHUD();
  }

  requestAnimationFrame(loop);
}

// ── Fixed spawn positions for now (randomised in a later commit) ──────────────
const FIXED_SPAWNS = [
  [150, 100], [750, 100], [150, 480], [750, 480], [450, 120],
];

function startGame() {
  player.x = CANVAS_W / 2; player.y = CANVAS_H / 2;
  player.angle = 0; player.ammo = START_AMMO;
  bullets = [];
  session = { shots: 0, hits: 0, kills: 0 };
  spawnEnemies(FIXED_SPAWNS.slice(0, 3));  // 3 enemies for level 1
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
