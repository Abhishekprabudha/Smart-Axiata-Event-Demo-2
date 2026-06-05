let scenes = [];
let startTime = null;
let pausedAt = 0;
let raf = null;
let isPlaying = false;
let voiceOn = true;
let lastSceneId = null;
let totalDuration = 1080;
let activeSceneIndex = 0;
let currentVideoName = null;
let sceneAdvanceTimer = null;
let narrationToken = 0;
const videoPositions = {};
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
  telemetryGrid: document.getElementById('telemetryGrid'),
  telemetryFeed: document.getElementById('telemetryFeed'),
  modelDetails: document.getElementById('modelDetails'),
};


const preferredNarrationVoice = 'en-HK-SamNeural';

function normalizeVoiceName(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function selectNarrationVoice(voices = []) {
  const preferred = normalizeVoiceName(preferredNarrationVoice);
  return voices.find(v => [v.name, v.voiceURI, v.lang].some(value => normalizeVoiceName(value).includes(preferred)))
    || voices.find(v => /sam|yan/i.test(`${v.name} ${v.voiceURI}`) && /^en-?hk/i.test(v.lang))
    || voices.find(v => /^en-?hk/i.test(v.lang))
    || voices.find(v => /xiaoxiao|xiaoyi|yunxi|hanyu|tracy|sinji|Google 普通话|Google 國語/i.test(v.name))
    || voices.find(v => /^zh-?(cn|hk|tw)/i.test(v.lang));
}

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
function sceneIndexAt(t) { return Math.max(0, scenes.findIndex(s => t >= s.start && t < s.end)); }

function estimateNarrationDuration(text = '') {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(3.5, (words / 145) * 60 + 0.6);
}

function clearSceneAdvance() {
  if (sceneAdvanceTimer) clearTimeout(sceneAdvanceTimer);
  sceneAdvanceTimer = null;
  narrationToken += 1;
}

function saveCurrentVideoPosition() {
  if (!currentVideoName || !Number.isFinite(els.video.currentTime)) return;
  const duration = Number.isFinite(els.video.duration) ? els.video.duration : 0;
  videoPositions[currentVideoName] = duration > 0 ? els.video.currentTime % duration : els.video.currentTime;
}

function playSceneVideo(videoName) {
  if (!videoName) return;

  if (currentVideoName === videoName) {
    els.video.play().catch(() => {});
    return;
  }

  currentVideoName = videoName;
  els.video.src = videoBase + videoName;
  els.video.onloadedmetadata = () => {
    const resumeAt = videoPositions[videoName] || 0;
    if (resumeAt > 0 && resumeAt < els.video.duration) {
      els.video.currentTime = resumeAt;
    }
    els.video.play().catch(() => {});
  };
  els.video.play().catch(() => {});
}

function scheduleNarration(scene) {
  clearSceneAdvance();
  if (!isPlaying || !scene) return;

  const token = narrationToken;
  const text = scene.voice || `${scene.headline}. ${scene.caption}`;
  const advance = () => {
    if (token === narrationToken && isPlaying) advanceScene();
  };

  if (!voiceOn || !('speechSynthesis' in window)) {
    sceneAdvanceTimer = setTimeout(advance, estimateNarrationDuration(text) * 1000);
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.88;
  utterance.pitch = 0.9;
  utterance.volume = 1;
  const voices = window.speechSynthesis.getVoices();
  const preferred = selectNarrationVoice(voices);
  if (preferred) utterance.voice = preferred;
  utterance.onend = advance;
  utterance.onerror = () => {
    sceneAdvanceTimer = setTimeout(advance, estimateNarrationDuration(text) * 1000);
  };
  window.speechSynthesis.speak(utterance);
}

function chartSeries(seed, baseline, variance, elapsed, points = 8) {
  return Array.from({ length: points }, (_, i) => {
    const phase = seed * 0.73 + i * 0.91 + elapsed * 0.12;
    return Math.max(8, Math.min(96, baseline + Math.sin(phase) * variance + Math.cos(phase * 0.57) * variance * 0.45));
  });
}

const chartTypes = [
  'Column Chart',
  'Bar Chart',
  'Line Chart',
  'Doughnut Chart',
  'Area Chart',
  'XY Scatter Chart',
  'Bubble Chart',
  'Radar Chart',
  'Treemap Chart',
  'Histogram',
  'Pareto Chart',
  'Waterfall Chart',
  'Funnel Chart',
  'Combo Chart',
  'Sparkline'
];

const intelligenceEquations = [
  { formula: 'I<sub>t</sub> = σ(w<sub>s</sub>S<sub>t</sub> + w<sub>c</sub>C<sub>t</sub> + w<sub>k</sub>K<sub>t</sub>)', variables: 'S signals · C context · K KPI' },
  { formula: 'R<sub>t</sub> = P(e<sub>t</sub>|x<sub>t</sub>) × L<sub>impact</sub>', variables: 'e event · x features · L loss' },
  { formula: 'A* = argmax<sub>a</sub> E[ΔKPI | a,x<sub>t</sub>]', variables: 'a action · x state · KPI outcome' },
  { formula: 'η = D<sub>t</sub> / C<sub>t</sub> − SLA<sub>gap</sub>', variables: 'D demand · C capacity · SLA target' },
  { formula: 'τ = ETA<sub>pred</sub> − ETA<sub>plan</sub>', variables: 'ETA prediction · plan baseline' },
  { formula: 'Z = |x<sub>t</sub> − μ<sub>t</sub>| / σ<sub>t</sub>', variables: 'x signal · μ norm · σ volatility' },
  { formula: 'Y = Σ p<sub>i</sub>v<sub>i</sub> − c<sub>ops</sub>', variables: 'p probability · v value · c cost' },
  { formula: 'G = αN<sub>links</sub> + βF<sub>flow</sub> + γT<sub>risk</sub>', variables: 'N graph · F flow · T trust' }
];

function pointsPath(values, width, height, inset = 8) {
  const step = (width - inset * 2) / Math.max(1, values.length - 1);
  return values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${inset + i * step} ${height - inset - (v / 100) * (height - inset * 2)}`).join(' ');
}

function polarPoint(cx, cy, radius, value, index, total) {
  const angle = (Math.PI * 2 * index / total) - Math.PI / 2;
  const distance = radius * (value / 100);
  return `${cx + Math.cos(angle) * distance},${cy + Math.sin(angle) * distance}`;
}

function renderChartSvg(type, values, accentClass, elapsed, seed) {
  const width = 260, height = 82, inset = 8;
  const maxBar = Math.max(...values, 1);
  const grid = '<line class="grid" x1="0" y1="24" x2="260" y2="24"></line><line class="grid" x1="0" y1="58" x2="260" y2="58"></line>';

  if (type === 'Column Chart' || type === 'Histogram') {
    const gap = type === 'Histogram' ? 1 : 6;
    const barWidth = (width - 24 - gap * (values.length - 1)) / values.length;
    const bars = values.map((v, i) => `<rect class="bar" x="${12 + i * (barWidth + gap)}" y="${height - inset - (v / maxBar) * 62}" width="${barWidth}" height="${(v / maxBar) * 62}"></rect>`).join('');
    return `${grid}${bars}`;
  }

  if (type === 'Bar Chart') {
    const barHeight = 9;
    const bars = values.slice(0, 6).map((v, i) => `<rect class="bar" x="10" y="${10 + i * 12}" width="${(v / maxBar) * 224}" height="${barHeight}"></rect><text class="axis-label" x="240" y="${18 + i * 12}">${Math.round(v)}</text>`).join('');
    return bars;
  }

  if (type === 'Line Chart' || type === 'Sparkline') {
    const path = pointsPath(values, width, height, inset);
    const dots = values.map((v, i) => {
      const x = inset + i * ((width - inset * 2) / (values.length - 1));
      const y = height - inset - (v / 100) * (height - inset * 2);
      return `<circle class="point" cx="${x}" cy="${y}" r="2.1"></circle>`;
    }).join('');
    return `${grid}<path class="line" d="${path}"></path>${dots}`;
  }

  if (type === 'Area Chart') {
    const path = pointsPath(values, width, height, inset);
    const area = `${path} L ${width - inset} ${height - inset} L ${inset} ${height - inset} Z`;
    return `${grid}<path class="area" d="${area}"></path><path class="line" d="${path}"></path>`;
  }

  if (type === 'Doughnut Chart') {
    const total = values.slice(0, 4).reduce((a, b) => a + b, 0);
    let offset = 0;
    const rings = values.slice(0, 4).map((v, i) => {
      const dash = v / total * 100;
      const circle = `<circle class="donut-segment segment-${i}" cx="130" cy="41" r="27" pathLength="100" stroke-dasharray="${dash} ${100 - dash}" stroke-dashoffset="${-offset}" />`;
      offset += dash;
      return circle;
    }).join('');
    return `<circle class="donut-track" cx="130" cy="41" r="27" />${rings}<text class="center-value" x="130" y="46">${Math.round(values[0])}%</text>`;
  }

  if (type === 'XY Scatter Chart') {
    return values.map((v, i) => {
      const x = 14 + i * 31 + Math.sin(elapsed * 0.3 + i) * 5;
      const y = height - 10 - (v / 100) * 64;
      return `<circle class="point" cx="${x}" cy="${y}" r="3"></circle>`;
    }).join('') + `<path class="trend" d="M 12 ${height - 20} L 246 18"></path>`;
  }

  if (type === 'Bubble Chart') {
    return values.slice(0, 7).map((v, i) => {
      const x = 22 + i * 35;
      const y = height - 12 - (v / 100) * 58;
      const r = 4 + ((values[(i + 2) % values.length] + seed) % 16) / 2;
      return `<circle class="bubble" cx="${x}" cy="${y}" r="${r}"></circle>`;
    }).join('');
  }

  if (type === 'Radar Chart') {
    const radarValues = values.slice(0, 6);
    const polygon = radarValues.map((v, i) => polarPoint(130, 41, 32, v, i, radarValues.length)).join(' ');
    const frame = [25, 50, 75, 100].map(r => `<polygon class="radar-grid" points="${radarValues.map((_, i) => polarPoint(130, 41, 32, r, i, radarValues.length)).join(' ')}"></polygon>`).join('');
    return `${frame}<polygon class="radar-area" points="${polygon}"></polygon>`;
  }

  if (type === 'Treemap Chart') {
    const sorted = values.slice(0, 5).sort((a, b) => b - a);
    let x = 8;
    return sorted.map((v, i) => {
      const w = Math.max(26, (v / sorted.reduce((a, b) => a + b, 0)) * 238);
      const rect = `<rect class="tree tree-${i}" x="${x}" y="12" width="${Math.min(w, 252 - x)}" height="58" rx="5"></rect>`;
      x += Math.min(w, 252 - x) + 3;
      return rect;
    }).join('');
  }

  if (type === 'Pareto Chart' || type === 'Combo Chart') {
    const sorted = type === 'Pareto Chart' ? values.slice(0, 7).sort((a, b) => b - a) : values.slice(0, 7);
    const barWidth = 20;
    let cumulative = 0;
    const total = sorted.reduce((a, b) => a + b, 0);
    const bars = sorted.map((v, i) => `<rect class="bar" x="${16 + i * 34}" y="${height - inset - (v / maxBar) * 56}" width="${barWidth}" height="${(v / maxBar) * 56}"></rect>`).join('');
    const lineValues = sorted.map(v => (cumulative += v) / total * 100);
    return `${bars}<path class="line secondary" d="${pointsPath(lineValues, 238, height, inset).replaceAll('M 8', 'M 16')}"></path>`;
  }

  if (type === 'Waterfall Chart') {
    let running = 30;
    return values.slice(0, 7).map((v, i) => {
      const delta = (v - 50) / 3;
      const next = Math.max(8, Math.min(92, running + delta));
      const y = height - inset - (Math.max(running, next) / 100) * 60;
      const h = Math.max(5, Math.abs(next - running) / 100 * 60);
      running = next;
      return `<rect class="${delta >= 0 ? 'bar' : 'bar negative'}" x="${16 + i * 33}" y="${y}" width="22" height="${h}"></rect>`;
    }).join('');
  }

  if (type === 'Funnel Chart') {
    return values.slice(0, 5).sort((a, b) => b - a).map((v, i) => {
      const w = 56 + (v / maxBar) * 168;
      const x = (width - w) / 2;
      return `<rect class="bar" x="${x}" y="${9 + i * 14}" width="${w}" height="10" rx="5"></rect>`;
    }).join('');
  }

  return `${grid}<path class="line" d="${pointsPath(values, width, height, inset)}"></path>`;
}

function agentChartType(scene, agentIndex) {
  const sceneIndex = Math.max(0, scenes.findIndex(s => s.id === scene.id));
  return chartTypes[(sceneIndex * 3 + agentIndex) % chartTypes.length];
}

function agentIntelligenceEquation(scene, agentIndex) {
  const sceneIndex = Math.max(0, scenes.findIndex(s => s.id === scene.id));
  return intelligenceEquations[(sceneIndex * 2 + agentIndex) % intelligenceEquations.length];
}

function renderAgentCharts(scene, elapsed, profile) {
  const agents = scene.agents || [];
  els.telemetryGrid.innerHTML = agents.map((agent, index) => {
    const type = agentChartType(scene, index);
    const baseline = Math.min(88, profile[2] + index * 4 - (index % 2) * 8);
    const values = chartSeries(scene.id.length + index * 5, baseline, 13 + index * 2, elapsed, type === 'Radar Chart' ? 6 : 8);
    const svg = renderChartSvg(type, values, index % 2 ? 'warm' : 'cool', elapsed, index + scene.id.length);
    const equation = agentIntelligenceEquation(scene, index);
    return `<div class="graph-card ${index % 2 ? 'warm' : 'cool'}">
      <div class="graph-label">${agent}</div>
      <div class="intelligence-equation" title="${equation.variables}">
        <span class="equation-formula">${equation.formula}</span>
        <span class="equation-variables">${equation.variables}</span>
      </div>
      <svg class="spark" viewBox="0 0 260 82" preserveAspectRatio="none">${svg}</svg>
    </div>`;
  }).join('');
}

function renderTelemetry(scene, elapsed) {
  const p = profiles[scene.chapter] || profiles['Airport Ecosystem'];
  renderAgentCharts(scene, elapsed, p);
  const kpis = Object.entries(scene.kpis || {});
  els.modelDetails.innerHTML = `
    <div class="detail-row"><span class="detail-title">Chapter</span> ${scene.chapter}</div>
    <div class="detail-row"><span class="detail-title">Model Layer</span> UniStack AgentOps + UniWeave workflows + Smart connectivity signals</div>
    <div class="detail-row"><span class="detail-title">KPI Focus</span> ${kpis.map(([k,v]) => `${k}: ${v}`).join(' | ')}</div>`;
  els.telemetryFeed.innerHTML = [
    `${scene.section} signal fused`,
    `${scene.agents?.[0] || 'Primary agent'} active`,
    `Recommendation loop refreshed`
  ].map((line, i) => `<div class="feed-row"><span class="feed-tag">${i+1}</span><span class="feed-value">${line}</span></div>`).join('');
}


function updateProgress(elapsed) {
  els.progress.style.width = `${Math.min(100, elapsed / totalDuration * 100)}%`;
}

function renderScene(scene, elapsed, options = {}) {
  if (!scene) return;
  const enteringScene = lastSceneId !== scene.id || options.force;
  if (enteringScene) {
    if (lastSceneId && lastSceneId !== scene.id) saveCurrentVideoPosition();
    playSceneVideo(scene.video);
    els.chapter.textContent = scene.chapter || '';
    els.section.textContent = scene.section;
    els.headline.textContent = scene.headline;
    els.caption.textContent = scene.caption;
    els.agents.innerHTML = scene.agents.map(a => `<div class="agent">${a}</div>`).join('');
    els.kpis.innerHTML = Object.entries(scene.kpis).map(([k,v]) => `<div class="kpi"><div class="label">${k}</div><div class="value">${v}</div></div>`).join('');
    lastSceneId = scene.id;
    if (isPlaying) scheduleNarration(scene);
  }
  updateProgress(elapsed);
  renderTelemetry(scene, elapsed);
}

function tick(now) {
  if (!startTime) startTime = now - pausedAt * 1000;
  const scene = scenes[activeSceneIndex] || scenes[scenes.length - 1];
  const sceneElapsed = (now - startTime) / 1000;
  const elapsed = Math.min(totalDuration, scene.start + sceneElapsed);
  pausedAt = elapsed;
  renderScene(scene, elapsed);
  if (isPlaying) raf = requestAnimationFrame(tick);
}

function advanceScene() {
  saveCurrentVideoPosition();
  if (activeSceneIndex >= scenes.length - 1) {
    cancelAnimationFrame(raf);
    isPlaying = false;
    startTime = null;
    pausedAt = totalDuration;
    updateProgress(totalDuration);
    els.playBtn.textContent = '▶ Start narrated demo';
    return;
  }

  activeSceneIndex += 1;
  pausedAt = scenes[activeSceneIndex].start;
  startTime = null;
  lastSceneId = null;
  renderScene(scenes[activeSceneIndex], pausedAt, { force: true });
}

function startDemo() {
  if (isPlaying || !scenes.length) return;
  isPlaying = true;
  activeSceneIndex = sceneIndexAt(pausedAt);
  if (activeSceneIndex < 0) activeSceneIndex = 0;
  pausedAt = scenes[activeSceneIndex].start;
  startTime = null;
  els.playBtn.textContent = '▶ Playing';
  renderScene(scenes[activeSceneIndex], pausedAt, { force: true });
  raf = requestAnimationFrame(tick);
}
function pauseDemo() {
  if (!isPlaying) return;
  cancelAnimationFrame(raf);
  window.speechSynthesis?.pause();
  if (sceneAdvanceTimer) clearTimeout(sceneAdvanceTimer);
  saveCurrentVideoPosition();
  els.video.pause();
  isPlaying = false;
  startTime = null;
  els.playBtn.textContent = '▶ Resume';
}
function resetDemo() {
  cancelAnimationFrame(raf);
  clearSceneAdvance();
  window.speechSynthesis?.cancel();
  isPlaying = false;
  startTime = null;
  pausedAt = 0;
  activeSceneIndex = 0;
  lastSceneId = null;
  currentVideoName = null;
  Object.keys(videoPositions).forEach(key => { videoPositions[key] = 0; });
  els.playBtn.textContent = '▶ Start narrated demo';
  renderScene(scenes[0], 0);
}
function seekTo(seconds) {
  cancelAnimationFrame(raf);
  clearSceneAdvance();
  window.speechSynthesis?.cancel();
  saveCurrentVideoPosition();
  activeSceneIndex = sceneIndexAt(seconds);
  pausedAt = scenes[activeSceneIndex]?.start || 0;
  startTime = null;
  lastSceneId = null;
  renderScene(scenes[activeSceneIndex], pausedAt, { force: true });
  if (isPlaying) raf = requestAnimationFrame(tick);
}

fetch('data/scenes.json').then(r => r.json()).then(sceneJson => {
  scenes = sceneJson;
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
  clearSceneAdvance();
  window.speechSynthesis?.cancel();
  if (isPlaying) scheduleNarration(scenes[activeSceneIndex]);
});
