let scenes = [];
let chapters = [];
let startTime = null;
let pausedAt = 0;
let raf = null;
let isPlaying = false;
let voiceOn = true;
let lastSceneId = null;
let totalDuration = 1080;
const videoBase = 'assets/videos/';

const els = {
  video: document.getElementById('bgVideo'),
  chapter: document.getElementById('chapter'),
  section: document.getElementById('section'),
  headline: document.getElementById('headline'),
  caption: document.getElementById('caption'),
  agents: document.getElementById('agents'),
  kpis: document.getElementById('kpis'),
  progress: document.getElementById('progress'),
  playBtn: document.getElementById('playBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  muteBtn: document.getElementById('muteBtn'),
  resetBtn: document.getElementById('resetBtn'),
  throughputGraph: document.getElementById('throughputGraph'),
  queueGraph: document.getElementById('queueGraph'),
  telemetryFeed: document.getElementById('telemetryFeed'),
  modelDetails: document.getElementById('modelDetails'),
  chapters: document.getElementById('chapters'),
  clock: document.getElementById('clock'),
  metricALabel: document.getElementById('metricALabel'),
  metricBLabel: document.getElementById('metricBLabel')
};

const profiles = {
  'Airport Ecosystem': ['Airport Flow Confidence','Operational Risk', 66, 42],
  'Commercial Airlines': ['Fleet Availability','Revenue Leakage Risk', 72, 46],
  'Cargo Airlines': ['Shipment Visibility','Exception Pressure', 76, 49],
  'Supply Chain': ['Control Tower Coverage','SLA Risk', 70, 45],
  'Manufacturing': ['Plant Health','Downtime Risk', 74, 43],
  'BFSI': ['Transaction Intelligence','Fraud / Compliance Risk', 78, 52]
};

function fmt(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
function currentScene(t) { return scenes.find(s => t >= s.start && t < s.end) || scenes[scenes.length - 1]; }
function currentChapter(t) { return chapters.find(c => t >= c.start && t < c.end) || chapters[chapters.length - 1]; }

function speak(text) {
  if (!voiceOn || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.88; u.pitch = 0.9; u.volume = 1;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => /Google UK English Male|Microsoft David|Daniel|Google US English|Microsoft Ravi/i.test(v.name));
  if (preferred) u.voice = preferred;
  window.speechSynthesis.speak(u);
}

function buildSpark(svg, baseline, variance, t, queue=false) {
  const width = 260, height = 72, points = 28;
  let values = [];
  for (let i = 0; i < points; i++) {
    const phase = (i / points) * Math.PI * 2 + t * 0.85;
    values.push(Math.max(8, Math.min(95, baseline + Math.sin(phase) * variance + Math.cos(phase * 0.7) * variance * 0.35)));
  }
  const step = width / (points - 1);
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${height - (v / 100) * height}`).join(' ');
  const bars = values.filter((_, i) => i % 2 === 0).map((v, i) => `<rect class="bar" x="${i * 19}" y="${height - (v / 100) * height}" width="12" height="${(v / 100) * height}"></rect>`).join('');
  const dots = values.filter((_, i) => i % 3 === 0).map((v, i) => `<circle class="point" cx="${i * 3 * step}" cy="${height - (v / 100) * height}" r="2.1"></circle>`).join('');
  svg.setAttribute('class', `spark ${queue ? 'queue' : ''}`);
  svg.innerHTML = `<line class="grid" x1="0" y1="18" x2="260" y2="18"></line><line class="grid" x1="0" y1="54" x2="260" y2="54"></line>${bars}<path class="line" d="${path}"></path>${dots}`;
}

function renderTelemetry(scene, elapsed) {
  const p = profiles[scene.chapter] || profiles['Airport Ecosystem'];
  els.metricALabel.textContent = p[0];
  els.metricBLabel.textContent = p[1];
  const local = elapsed - scene.start;
  buildSpark(els.throughputGraph, p[2], 10, elapsed, false);
  buildSpark(els.queueGraph, p[3], 12, elapsed + 2, true);
  const kpis = Object.entries(scene.kpis || {});
  els.modelDetails.innerHTML = `
    <div class="detail-row"><span class="detail-title">Chapter</span> ${scene.chapter}</div>
    <div class="detail-row"><span class="detail-title">Model Layer</span> UniStack AgentOps + UniWeave workflows + Smart connectivity signals</div>
    <div class="detail-row"><span class="detail-title">KPI Focus</span> ${kpis.map(([k,v]) => `${k}: ${v}`).join(' | ')}</div>`;
  els.telemetryFeed.innerHTML = [
    `${scene.section} signal fused`,
    `${scene.agents?.[0] || 'Primary agent'} active`,
    `Recommendation loop refreshed at T+${fmt(elapsed)}`
  ].map((line, i) => `<div class="feed-row"><span class="feed-tag">${i+1}</span><span class="feed-value">${line}</span></div>`).join('');
}

function renderChapters(elapsed) {
  els.chapters.innerHTML = chapters.map(c => {
    const active = elapsed >= c.start && elapsed < c.end ? 'active' : '';
    return `<button class="chapter-pill ${active}" data-start="${c.start}"><span>${c.name}</span><small>${fmt(c.start)}–${fmt(c.end)}</small></button>`;
  }).join('');
  document.querySelectorAll('.chapter-pill').forEach(btn => {
    btn.onclick = () => seekTo(Number(btn.dataset.start));
  });
}

function renderScene(scene, elapsed) {
  if (!scene) return;
  if (lastSceneId !== scene.id) {
    els.video.src = videoBase + scene.video;
    els.video.play().catch(()=>{});
    els.chapter.textContent = scene.chapter || '';
    els.section.textContent = scene.section;
    els.headline.textContent = scene.headline;
    els.caption.textContent = scene.caption;
    els.agents.innerHTML = scene.agents.map(a => `<div class="agent">${a}</div>`).join('');
    els.kpis.innerHTML = Object.entries(scene.kpis).map(([k,v]) => `<div class="kpi"><div class="label">${k}</div><div class="value">${v}</div></div>`).join('');
    if (isPlaying) speak(scene.voice || `${scene.headline}. ${scene.caption}`);
    lastSceneId = scene.id;
  }
  els.progress.style.width = `${Math.min(100, elapsed / totalDuration * 100)}%`;
  els.clock.textContent = `${fmt(elapsed)} / ${fmt(totalDuration)}`;
  renderTelemetry(scene, elapsed);
  renderChapters(elapsed);
}

function tick(now) {
  if (!startTime) startTime = now - pausedAt * 1000;
  const elapsed = Math.min(totalDuration, (now - startTime) / 1000);
  pausedAt = elapsed;
  renderScene(currentScene(elapsed), elapsed);
  if (elapsed < totalDuration && isPlaying) raf = requestAnimationFrame(tick);
  else { isPlaying = false; els.playBtn.textContent = '▶ Start narrated demo'; }
}

function startDemo() {
  if (isPlaying) return;
  isPlaying = true;
  startTime = null;
  els.playBtn.textContent = '▶ Playing';
  raf = requestAnimationFrame(tick);
}
function pauseDemo() {
  if (!isPlaying) return;
  cancelAnimationFrame(raf);
  window.speechSynthesis?.pause();
  isPlaying = false;
  startTime = null;
  els.playBtn.textContent = '▶ Resume';
}
function resetDemo() {
  cancelAnimationFrame(raf);
  window.speechSynthesis?.cancel();
  isPlaying = false;
  startTime = null;
  pausedAt = 0;
  lastSceneId = null;
  els.playBtn.textContent = '▶ Start narrated demo';
  renderScene(scenes[0], 0);
}
function seekTo(seconds) {
  cancelAnimationFrame(raf);
  window.speechSynthesis?.cancel();
  pausedAt = Math.max(0, Math.min(totalDuration, seconds));
  startTime = null;
  lastSceneId = null;
  renderScene(currentScene(pausedAt), pausedAt);
  if (isPlaying) raf = requestAnimationFrame(tick);
}

Promise.all([fetch('data/scenes.json').then(r => r.json()), fetch('data/chapters.json').then(r => r.json())]).then(([sceneJson, chapterJson]) => {
  scenes = sceneJson;
  chapters = chapterJson;
  totalDuration = scenes[scenes.length - 1].end;
  renderScene(scenes[0], 0);
});

els.playBtn.addEventListener('click', () => {
  if ('speechSynthesis' in window) window.speechSynthesis.resume();
  startDemo();
});
els.pauseBtn.addEventListener('click', pauseDemo);
els.resetBtn.addEventListener('click', resetDemo);
els.muteBtn.addEventListener('click', () => {
  voiceOn = !voiceOn;
  els.muteBtn.textContent = `Voice: ${voiceOn ? 'On' : 'Off'}`;
  if (!voiceOn) window.speechSynthesis?.cancel();
});
