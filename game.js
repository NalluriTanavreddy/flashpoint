// ── Constants ────────────────────────────────────────────────────────────────
const CANVAS_W = 900;
const CANVAS_H = 600;

// ── Canvas setup ─────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
canvas.width  = CANVAS_W;
canvas.height = CANVAS_H;

// ── Game state ────────────────────────────────────────────────────────────────
const State = {
  START:      'START',
  PLAYING:    'PLAYING',
  DEAD:       'DEAD',
  LEVEL_CLEAR:'LEVEL_CLEAR',
};

let gameState = State.START;

// ── Persistent stats (localStorage) ──────────────────────────────────────────
function loadStats() {
  return {
    hiScore:    parseInt(localStorage.getItem('fp_hiScore')    || '0', 10),
    bestLevel:  parseInt(localStorage.getItem('fp_bestLevel')  || '0', 10),
    totalKills: parseInt(localStorage.getItem('fp_totalKills') || '0', 10),
    totalShots: parseInt(localStorage.getItem('fp_totalShots') || '0', 10),
    totalHits:  parseInt(localStorage.getItem('fp_totalHits')  || '0', 10),
  };
}

function saveStats(stats) {
  localStorage.setItem('fp_hiScore',    stats.hiScore);
  localStorage.setItem('fp_bestLevel',  stats.bestLevel);
  localStorage.setItem('fp_totalKills', stats.totalKills);
  localStorage.setItem('fp_totalShots', stats.totalShots);
  localStorage.setItem('fp_totalHits',  stats.totalHits);
}

function fmtAccuracy(hits, shots) {
  if (shots === 0) return '—';
  return Math.round((hits / shots) * 100) + '%';
}

// ── Start screen stat population ──────────────────────────────────────────────
function refreshStartScreen() {
  const s = loadStats();
  document.getElementById('stat-hiscore').textContent  = s.hiScore;
  document.getElementById('stat-bestlevel').textContent = s.bestLevel > 0 ? s.bestLevel : '—';
  document.getElementById('stat-kills').textContent    = s.totalKills;
  document.getElementById('stat-accuracy').textContent = fmtAccuracy(s.totalHits, s.totalShots);
}

// ── Screen helpers ────────────────────────────────────────────────────────────
function showScreen(id) {
  ['start-screen', 'death-screen', 'level-screen'].forEach(s => {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
}

function hideAllScreens() {
  ['start-screen', 'death-screen', 'level-screen'].forEach(s => {
    document.getElementById(s).classList.add('hidden');
  });
}

// ── Placeholder game loop (draws a "COMING SOON" canvas) ─────────────────────
function drawPlaceholder() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.fillStyle = '#333';
  ctx.font = 'bold 24px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('FLASHPOINT — engine loading…', CANVAS_W / 2, CANVAS_H / 2);
}

// ── Button wiring ─────────────────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', () => {
  hideAllScreens();
  gameState = State.PLAYING;
  // Full game init will be wired in later commits
  drawPlaceholder();
});

document.getElementById('btn-restart').addEventListener('click', () => {
  hideAllScreens();
  gameState = State.PLAYING;
  drawPlaceholder();
});

document.getElementById('btn-next-level').addEventListener('click', () => {
  hideAllScreens();
  gameState = State.PLAYING;
  drawPlaceholder();
});

// ── Boot ──────────────────────────────────────────────────────────────────────
refreshStartScreen();
drawPlaceholder();
showScreen('start-screen');
