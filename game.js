// ── Constants ─────────────────────────────────────────────────────────────────
const CANVAS_W      = 900;
const CANVAS_H      = 600;
const PLAYER_SPEED  = 180;
const PLAYER_R      = 12;
const BULLET_SPEED  = 520;
const BULLET_R      = 4;
const START_AMMO    = 7;
const AMMO_PER_KILL = 3;
const ENEMY_SPEED   = 58;
const ENEMY_R       = 18;
const ENEMY_MAX_HP  = 2;
const CRATE_SIZE    = 42;   // square half-extent = 21
const BARREL_R      = 18;

function enemyCountForLevel(level) { return 1 + level * 2; }

// ── Canvas setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
canvas.width  = CANVAS_W;
canvas.height = CANVAS_H;

// ── Game state ────────────────────────────────────────────────────────────────
const State = { START:'START', PLAYING:'PLAYING', DEAD:'DEAD', LEVEL_CLEAR:'LEVEL_CLEAR' };
let gameState = State.START;

// ── Level & run tracking ──────────────────────────────────────────────────────
let currentLevel   = 1;
let runScore       = 0;
let levelStartTime = 0;
let levelActive    = false;

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

// ── Containers ────────────────────────────────────────────────────────────────
let containers = [];

function tooCloseToAny(x, y, clearR, list) {
  for (const c of list) {
    const cr = c.type === 'barrel' ? BARREL_R : CRATE_SIZE / 2;
    if (Math.hypot(x - c.x, y - c.y) < clearR + cr + 14) return true;
  }
  return false;
}

function generateContainers(enemyPositions) {
  const result   = [];
  const MARGIN   = 52;
  const COUNT    = 8;
  const MAX_TRIES = 300;

  for (let i = 0; i < COUNT; i++) {
    for (let t = 0; t < MAX_TRIES; t++) {
      const isBarrel = Math.random() < 0.4;
      const cr = isBarrel ? BARREL_R : CRATE_SIZE / 2;
      const x  = MARGIN + Math.random() * (CANVAS_W - MARGIN * 2);
      const y  = MARGIN + Math.random() * (CANVAS_H - MARGIN * 2);

      // Clear of player spawn (centre)
      if (Math.hypot(x - CANVAS_W / 2, y - CANVAS_H / 2) < 90) continue;

      // Clear of enemy spawns
      let blocked = false;
      for (const [ex, ey] of enemyPositions) {
        if (Math.hypot(x - ex, y - ey) < 64) { blocked = true; break; }
      }
      if (blocked) continue;

      // Clear of existing containers
      if (tooCloseToAny(x, y, cr, result)) continue;

      result.push({ type: isBarrel ? 'barrel' : 'crate', x, y });
      break;
    }
  }
  return result;
}

// ── Container collision helpers ───────────────────────────────────────────────
function bulletHitsContainer(b, c) {
  if (c.type === 'barrel') {
    return Math.hypot(b.x - c.x, b.y - c.y) < BARREL_R + BULLET_R;
  }
  const h = CRATE_SIZE / 2 + BULLET_R;
  return Math.abs(b.x - c.x) < h && Math.abs(b.y - c.y) < h;
}

function pushEntityOutOfContainer(ent, entR, c) {
  if (c.type === 'barrel') {
    const dist = Math.hypot(ent.x - c.x, ent.y - c.y);
    const minD = BARREL_R + entR;
    if (dist < minD && dist > 0.01) {
      const a = Math.atan2(ent.y - c.y, ent.x - c.x);
      ent.x = c.x + Math.cos(a) * minD;
      ent.y = c.y + Math.sin(a) * minD;
    }
    return;
  }
  // Crate AABB
  const h = CRATE_SIZE / 2 + entR;
  const dx = ent.x - c.x, dy = ent.y - c.y;
  if (Math.abs(dx) < h && Math.abs(dy) < h) {
    const ox = h - Math.abs(dx), oy = h - Math.abs(dy);
    if (ox < oy) ent.x += Math.sign(dx) * ox;
    else         ent.y += Math.sign(dy) * oy;
  }
}

function drawContainers() {
  for (const c of containers) {
    if (c.type === 'barrel') {
      // Outer ring
      ctx.beginPath();
      ctx.arc(c.x, c.y, BARREL_R, 0, Math.PI * 2);
      ctx.fillStyle   = '#c85a00';
      ctx.strokeStyle = '#7a3800';
      ctx.lineWidth   = 2.5;
      ctx.fill(); ctx.stroke();
      // Inner highlight band
      ctx.beginPath();
      ctx.arc(c.x, c.y, BARREL_R * 0.55, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff8c20';
      ctx.lineWidth   = 2;
      ctx.stroke();
      // Centre dot
      ctx.beginPath();
      ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ff8c20'; ctx.fill();
    } else {
      const h = CRATE_SIZE / 2;
      // Main fill
      ctx.fillStyle = '#2a6b2a';
      ctx.fillRect(c.x - h, c.y - h, CRATE_SIZE, CRATE_SIZE);
      // Border
      ctx.strokeStyle = '#1a4a1a';
      ctx.lineWidth   = 2.5;
      ctx.strokeRect(c.x - h, c.y - h, CRATE_SIZE, CRATE_SIZE);
      // Cross detail
      ctx.strokeStyle = '#3a8a3a';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(c.x - h + 4, c.y); ctx.lineTo(c.x + h - 4, c.y);
      ctx.moveTo(c.x, c.y - h + 4); ctx.lineTo(c.x, c.y + h - 4);
      ctx.stroke();
    }
  }
}

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
  for (const c of containers) pushEntityOutOfContainer(player, PLAYER_R, c);
}

function drawPlayer() {
  const { x, y, angle } = player;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle);
  ctx.beginPath(); ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2);
  ctx.fillStyle = '#4af'; ctx.strokeStyle = '#8cf'; ctx.lineWidth = 2;
  ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(PLAYER_R, 0); ctx.lineTo(PLAYER_R + 14, 0);
  ctx.strokeStyle = '#cef'; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.arc(4, 0, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#8df'; ctx.fill();
  ctx.restore();
}

// ── Bullets ───────────────────────────────────────────────────────────────────
let bullets = [];

function spawnBullet() {
  if (player.ammo <= 0) return;
  player.ammo--; session.shots++;
  const tip = PLAYER_R + 14;
  bullets.push({
    x: player.x + Math.cos(player.angle) * tip,
    y: player.y + Math.sin(player.angle) * tip,
    vx: Math.cos(player.angle) * BULLET_SPEED,
    vy: Math.sin(player.angle) * BULLET_SPEED,
  });
}

function updateBullets(dt) {
  if (mouse.fired) { mouse.fired = false; spawnBullet(); }
  for (const b of bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
  bullets = bullets.filter(b => {
    if (b.x < -BULLET_R || b.x > CANVAS_W + BULLET_R ||
        b.y < -BULLET_R || b.y > CANVAS_H + BULLET_R) return false;
    for (const c of containers) if (bulletHitsContainer(b, c)) return false;
    return true;
  });
}

function drawBullets() {
  for (const b of bullets) {
    ctx.beginPath(); ctx.arc(b.x, b.y, BULLET_R, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe066'; ctx.fill();
    ctx.beginPath(); ctx.arc(b.x, b.y, BULLET_R + 2, 0, Math.PI * 2);
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
    const dx = player.x - e.x, dy = player.y - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      e.x += (dx / dist) * ENEMY_SPEED * dt;
      e.y += (dy / dist) * ENEMY_SPEED * dt;
    }
    e.angle = Math.atan2(dy, dx);
    if (e.flashTimer > 0) e.flashTimer -= dt;
    for (const c of containers) pushEntityOutOfContainer(e, ENEMY_R, c);
  }
}

function resolveBulletEnemyCollisions() {
  const liveBullets = [], liveEnemies = [], hitEnemies = new Set();
  for (const b of bullets) {
    let hit = false;
    for (const e of enemies) {
      if (!hitEnemies.has(e) && Math.hypot(b.x - e.x, b.y - e.y) < ENEMY_R + BULLET_R) {
        hit = true; hitEnemies.add(e);
        e.hp--; e.flashTimer = 0.12; session.hits++;
        if (e.hp <= 0) { session.kills++; runScore += 100; player.ammo += AMMO_PER_KILL; }
        else           { liveEnemies.push(e); }
        break;
      }
    }
    if (!hit) liveBullets.push(b);
  }
  for (const e of enemies) { if (!hitEnemies.has(e)) liveEnemies.push(e); }
  bullets = liveBullets;
  enemies = liveEnemies;
}

function drawStickFigure(e) {
  const flash = e.flashTimer > 0;
  const col   = flash ? '#fff' : (e.hp === ENEMY_MAX_HP ? '#e44' : '#f96');
  ctx.save();
  ctx.translate(e.x, e.y); ctx.rotate(e.angle);
  ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, -14, 7, 0, Math.PI * 2);
  ctx.fillStyle = col; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-9, -2); ctx.lineTo(9, -2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 8); ctx.lineTo(-7, 20);
  ctx.moveTo(0, 8); ctx.lineTo(7,  20);
  ctx.stroke();
  ctx.restore();
}

function drawEnemyHPBar(e) {
  const W = 34, H = 5, bx = e.x - W / 2, by = e.y - 36;
  ctx.fillStyle = '#400'; ctx.fillRect(bx, by, W, H);
  ctx.fillStyle = e.hp === ENEMY_MAX_HP ? '#4f4' : '#f84';
  ctx.fillRect(bx, by, W * (e.hp / ENEMY_MAX_HP), H);
  ctx.strokeStyle = '#666'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, W, H);
}

function drawEnemies() {
  for (const e of enemies) { drawStickFigure(e); drawEnemyHPBar(e); }
}

// ── Level clear ───────────────────────────────────────────────────────────────
function checkLevelClear() {
  if (!levelActive || enemies.length > 0) return;
  levelActive = false;
  gameState   = State.LEVEL_CLEAR;
  const elapsed   = (performance.now() - levelStartTime) / 1000;
  const timeBonus = Math.max(0, Math.round(500 - elapsed * 20));
  const accBonus  = session.shots > 0 ? Math.round((session.hits / session.shots) * 200) : 0;
  runScore += timeBonus + accBonus;
  const saved = loadStats();
  if (currentLevel > saved.bestLevel) { saved.bestLevel = currentLevel; saveStats(saved); }
  document.getElementById('level-score').textContent     = runScore;
  document.getElementById('level-timebonus').textContent = `+${timeBonus}`;
  document.getElementById('level-acc').textContent       = fmtAccuracy(session.hits, session.shots);
  showScreen('level-screen');
}

// ── Draw scene ────────────────────────────────────────────────────────────────
function drawScene() {
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.strokeStyle = '#252525'; ctx.lineWidth = 1;
  const GRID = 60;
  for (let gx = 0; gx < CANVAS_W; gx += GRID) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, CANVAS_H); ctx.stroke();
  }
  for (let gy = 0; gy < CANVAS_H; gy += GRID) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(CANVAS_W, gy); ctx.stroke();
  }
  drawContainers();
  drawBullets();
  drawEnemies();
  drawPlayer();
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function drawHUD() {
  const PAD = 10;
  ctx.font = 'bold 15px Courier New'; ctx.textAlign = 'center'; ctx.fillStyle = '#ccc';
  ctx.fillText(`LEVEL ${currentLevel}   ·   ENEMIES  ${enemies.length}`, CANVAS_W / 2, 24);
  ctx.font = '13px Courier New'; ctx.textAlign = 'left'; ctx.fillStyle = '#ff9955';
  ctx.fillText(`SCORE  ${runScore}`, PAD, 24);
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

// ── Fixed enemy spawn pool (randomised in a later commit) ─────────────────────
const FIXED_SPAWNS = [
  [150, 100], [750, 100], [150, 480],
  [750, 480], [450,  80], [200, 300],
  [700, 300], [450, 500], [100, 500],
];
function spawnPositionsForLevel(level) {
  return FIXED_SPAWNS.slice(0, enemyCountForLevel(level));
}

// ── Begin level ───────────────────────────────────────────────────────────────
function beginLevel(level) {
  currentLevel = level;
  bullets      = [];
  player.x     = CANVAS_W / 2;
  player.y     = CANVAS_H / 2;
  player.angle = 0;
  if (level === 1) player.ammo = START_AMMO;

  const enemyPos = spawnPositionsForLevel(level);
  containers     = generateContainers(enemyPos);
  spawnEnemies(enemyPos);

  levelStartTime = performance.now();
  levelActive    = true;
  hideAllScreens();
  gameState = State.PLAYING;
}

function startGame() {
  runScore    = 0;
  session     = { shots: 0, hits: 0, kills: 0 };
  player.ammo = START_AMMO;
  beginLevel(1);
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
    checkLevelClear();
    drawScene();
    drawHUD();
  }
  requestAnimationFrame(loop);
}

// ── Button wiring ─────────────────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click',      () => startGame());
document.getElementById('btn-restart').addEventListener('click',    () => startGame());
document.getElementById('btn-next-level').addEventListener('click', () => beginLevel(currentLevel + 1));

// ── Boot ──────────────────────────────────────────────────────────────────────
refreshStartScreen();
showScreen('start-screen');
ctx.fillStyle = '#1a1a1a';
ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
requestAnimationFrame(ts => { lastTime = ts; requestAnimationFrame(loop); });
