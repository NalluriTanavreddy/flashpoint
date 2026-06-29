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
const CRATE_SIZE    = 42;
const BARREL_R      = 18;

function enemyCountForLevel(level) { return 1 + level * 2; }

// ── Canvas ────────────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
canvas.width  = CANVAS_W;
canvas.height = CANVAS_H;

// ── State machine ─────────────────────────────────────────────────────────────
const State = { START:'START', PLAYING:'PLAYING', DEAD:'DEAD', LEVEL_CLEAR:'LEVEL_CLEAR' };
let gameState = State.START;

// ── Level / run tracking ──────────────────────────────────────────────────────
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

function tooCloseToAny(x, y, r, list) {
  for (const c of list) {
    const cr = c.type === 'barrel' ? BARREL_R : CRATE_SIZE / 2;
    if (Math.hypot(x - c.x, y - c.y) < r + cr + 14) return true;
  }
  return false;
}

function generateContainers(enemyPositions) {
  const result = [];
  const MARGIN = 52, COUNT = 8, MAX_TRIES = 300;
  for (let i = 0; i < COUNT; i++) {
    for (let t = 0; t < MAX_TRIES; t++) {
      const isBarrel = Math.random() < 0.4;
      const cr = isBarrel ? BARREL_R : CRATE_SIZE / 2;
      const x  = MARGIN + Math.random() * (CANVAS_W - MARGIN * 2);
      const y  = MARGIN + Math.random() * (CANVAS_H - MARGIN * 2);
      if (Math.hypot(x - CANVAS_W / 2, y - CANVAS_H / 2) < 90) continue;
      let blocked = false;
      for (const [ex, ey] of enemyPositions) {
        if (Math.hypot(x - ex, y - ey) < 64) { blocked = true; break; }
      }
      if (blocked || tooCloseToAny(x, y, cr, result)) continue;
      result.push({ type: isBarrel ? 'barrel' : 'crate', x, y });
      break;
    }
  }
  return result;
}

function bulletHitsContainer(b, c) {
  if (c.type === 'barrel') return Math.hypot(b.x - c.x, b.y - c.y) < BARREL_R + BULLET_R;
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
      ctx.beginPath(); ctx.arc(c.x, c.y, BARREL_R, 0, Math.PI * 2);
      ctx.fillStyle = '#c85a00'; ctx.strokeStyle = '#7a3800'; ctx.lineWidth = 2.5;
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(c.x, c.y, BARREL_R * 0.55, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff8c20'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ff8c20'; ctx.fill();
    } else {
      const h = CRATE_SIZE / 2;
      ctx.fillStyle = '#2a6b2a';
      ctx.fillRect(c.x - h, c.y - h, CRATE_SIZE, CRATE_SIZE);
      ctx.strokeStyle = '#1a4a1a'; ctx.lineWidth = 2.5;
      ctx.strokeRect(c.x - h, c.y - h, CRATE_SIZE, CRATE_SIZE);
      ctx.strokeStyle = '#3a8a3a'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c.x - h + 4, c.y); ctx.lineTo(c.x + h - 4, c.y);
      ctx.moveTo(c.x, c.y - h + 4); ctx.lineTo(c.x, c.y + h - 4);
      ctx.stroke();
    }
  }
}

// ── Top-down person renderer ───────────────────────────────────────────────────
// angle=0 faces RIGHT. We rotate so local -Y (head) points in facing direction.
// walkTimer accumulates over time; isMoving controls whether legs swing.
function drawTopDownPerson(x, y, angle, walkTimer, isMoving, bodyCol, headCol) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const sw = isMoving ? Math.sin(walkTimer * 9) : 0;  // swing −1..1

  // Foot positions (local: head at -Y, feet at +Y)
  const lFx = -2 - sw * 1.5, lFy = 15 - sw * 6;
  const rFx =  2 + sw * 1.5, rFy = 15 + sw * 6;
  // Hand positions (arms swing opposite phase)
  const lHx = -14 + sw * 2, lHy = sw * 5;
  const rHx =  14 - sw * 2, rHy = -sw * 5;

  // ── Shadow ──────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.ellipse(0, 3, 13, 9, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill();

  // ── Legs (drawn behind torso) ────────────────────────────────────
  ctx.lineWidth = 4;
  ctx.strokeStyle = bodyCol;
  ctx.beginPath(); ctx.moveTo(-4, 8); ctx.lineTo(lFx, lFy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo( 4, 8); ctx.lineTo(rFx, rFy); ctx.stroke();
  // Feet — small dark ovals
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.ellipse(lFx, lFy, 4, 3, sw * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(rFx, rFy, 4, 3, -sw * 0.3, 0, Math.PI * 2); ctx.fill();

  // ── Torso ────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.ellipse(0, 1, 8, 11, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyCol;
  ctx.fill();

  // ── Arms ─────────────────────────────────────────────────────────
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = bodyCol;
  ctx.beginPath(); ctx.moveTo(-8, -2); ctx.lineTo(lHx, lHy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo( 8, -2); ctx.lineTo(rHx, rHy); ctx.stroke();
  // Hands
  ctx.fillStyle = headCol;
  ctx.beginPath(); ctx.arc(lHx, lHy, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(rHx, rHy, 3, 0, Math.PI * 2); ctx.fill();

  // ── Head ─────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.arc(0, -11, 8, 0, Math.PI * 2);
  ctx.fillStyle = headCol;
  ctx.fill();
  // Direction nub (crown of head, visible as a dark dot from above)
  ctx.beginPath();
  ctx.arc(0, -18, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fill();

  ctx.restore();
}

// ── Player ────────────────────────────────────────────────────────────────────
const player = {
  x: CANVAS_W / 2, y: CANVAS_H / 2,
  angle: 0, ammo: START_AMMO,
  walkTimer: 0, isMoving: false,
};

function updatePlayer(dt) {
  let dx = 0, dy = 0;
  if (keys['KeyW'] || keys['ArrowUp'])    dy -= 1;
  if (keys['KeyS'] || keys['ArrowDown'])  dy += 1;
  if (keys['KeyA'] || keys['ArrowLeft'])  dx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) dx += 1;
  if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }
  player.isMoving = dx !== 0 || dy !== 0;
  if (player.isMoving) player.walkTimer += dt * 5;
  player.x += dx * PLAYER_SPEED * dt;
  player.y += dy * PLAYER_SPEED * dt;
  player.x = Math.max(PLAYER_R, Math.min(CANVAS_W - PLAYER_R, player.x));
  player.y = Math.max(PLAYER_R, Math.min(CANVAS_H - PLAYER_R, player.y));
  player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
  for (const c of containers) pushEntityOutOfContainer(player, PLAYER_R, c);
}

function drawPlayer() {
  drawTopDownPerson(
    player.x, player.y, player.angle,
    player.walkTimer, player.isMoving,
    '#2255cc', '#d4a97a'
  );
  // Gun barrel (world-space, always aims at mouse)
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  ctx.translate(6, 3); // offset to right-hand side
  ctx.fillStyle = '#aaa';
  ctx.fillRect(2, -2.5, 18, 5);   // barrel
  ctx.fillStyle = '#777';
  ctx.fillRect(2, -4,    9, 8);   // slide / grip block
  ctx.restore();
}

// ── Bullets ───────────────────────────────────────────────────────────────────
let bullets = [];

function spawnBullet() {
  if (player.ammo <= 0) return;
  player.ammo--; session.shots++;
  const tip = PLAYER_R + 22;
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
  enemies = positions.map(([x, y]) => ({
    x, y, hp: ENEMY_MAX_HP, angle: 0, flashTimer: 0, walkTimer: 0,
  }));
}

function updateEnemies(dt) {
  for (const e of enemies) {
    const dx = player.x - e.x, dy = player.y - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      e.x += (dx / dist) * ENEMY_SPEED * dt;
      e.y += (dy / dist) * ENEMY_SPEED * dt;
      e.walkTimer += dt * 5;
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

function drawEnemies() {
  for (const e of enemies) {
    const flash = e.flashTimer > 0;
    const bodyCol = flash ? '#fff' : (e.hp === ENEMY_MAX_HP ? '#991111' : '#cc6622');
    const headCol = flash ? '#fff' : '#d4a97a';
    drawTopDownPerson(e.x, e.y, e.angle, e.walkTimer, true, bodyCol, headCol);

    // HP bar (world-space, above figure)
    const W = 34, H = 5, bx = e.x - W / 2, by = e.y - 42;
    ctx.fillStyle = '#400'; ctx.fillRect(bx, by, W, H);
    ctx.fillStyle = e.hp === ENEMY_MAX_HP ? '#4f4' : '#f84';
    ctx.fillRect(bx, by, W * (e.hp / ENEMY_MAX_HP), H);
    ctx.strokeStyle = '#666'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, W, H);
  }
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

// ── Floor (building top-down view) ────────────────────────────────────────────
const TILE = 60;
function drawFloor() {
  // Concrete base
  ctx.fillStyle = '#27272b';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Alternating tile fill
  for (let tx = 0; tx * TILE < CANVAS_W; tx++) {
    for (let ty = 0; ty * TILE < CANVAS_H; ty++) {
      if ((tx + ty) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.028)';
        ctx.fillRect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2);
      }
    }
  }

  // Grout lines
  ctx.strokeStyle = '#1c1c1f';
  ctx.lineWidth   = 1;
  for (let x = 0; x <= CANVAS_W; x += TILE) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
  }
  for (let y = 0; y <= CANVAS_H; y += TILE) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
  }

  // Room border wall
  ctx.strokeStyle = '#444448';
  ctx.lineWidth   = 10;
  ctx.strokeRect(5, 5, CANVAS_W - 10, CANVAS_H - 10);
  // Inner wall highlight
  ctx.strokeStyle = '#5a5a60';
  ctx.lineWidth   = 2;
  ctx.strokeRect(10, 10, CANVAS_W - 20, CANVAS_H - 20);
}

// ── Draw scene ────────────────────────────────────────────────────────────────
function drawScene() {
  drawFloor();
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
  currentLevel      = level;
  bullets           = [];
  player.x          = CANVAS_W / 2;
  player.y          = CANVAS_H / 2;
  player.angle      = 0;
  player.walkTimer  = 0;
  player.isMoving   = false;
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
ctx.fillStyle = '#27272b';
ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
requestAnimationFrame(ts => { lastTime = ts; requestAnimationFrame(loop); });
