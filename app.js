(() => {
  'use strict';

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const seed = window.ECOBOT_MOCK;
  const STORAGE_KEY = 'ecobot_frontend_demo_v1';
  const initialState = () => ({
    ...clone(seed.system),
    records: clone(seed.records),
    activity: clone(seed.activity),
    categoryTotals: clone(seed.categoryTotals),
    weekly: clone(seed.weekly),
    events: clone(seed.events),
    sorting: false,
    currentPage: 'overview',
    lastUpdated: new Date().toISOString()
  });

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return initialState();
      const parsed = JSON.parse(saved);
      const base = initialState();
      return { ...base, ...parsed, coordinates: { ...base.coordinates, ...(parsed.coordinates || {}) } };
    } catch (_) { return initialState(); }
  }

  let state = loadState();
  let sortTimer = null;
  let toastTimer = null;
  const pageContent = document.getElementById('pageContent');
  const toastRegion = document.getElementById('toastRegion');
  const modal = document.getElementById('modalBackdrop');

  const categoryInfo = {
    plastic: { label: 'Plastic', icon: '♻', item: 'PET beverage bottle', route: 'Plastic bin', color: 'plastic' },
    paper: { label: 'Paper / Non-metal', icon: '▤', item: 'Printed worksheet', route: 'Paper bin', color: 'paper' },
    metal: { label: 'Metal', icon: '▣', item: 'Aluminum can', route: 'Metal bin', color: 'metal' }
  };
  const pageNames = {
    overview: 'Overview', 'live-sorting': 'Live sorting', 'dobot-remote': 'Dobot remote',
    records: 'Waste records', analytics: 'Analytics', system: 'System & safety'
  };

  function saveState() {
    state.lastUpdated = new Date().toISOString();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* storage is optional */ }
  }
  function number(value, digits = 0) { return Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
  function esc(value) { return String(value).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function timeNow() { return new Date().toLocaleTimeString('en-PH', { hour12: false }); }
  function dateLabel() { return new Date().toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' }); }
  function setRoute(route) {
    if (!pageNames[route]) route = 'overview';
    state.currentPage = route;
    if (location.hash !== `#${route}`) location.hash = route;
    render();
    document.getElementById('sidebar').classList.remove('open');
  }
  function toast(message, type = 'success') {
    const node = document.createElement('div');
    node.className = `toast ${type === 'success' ? '' : type}`;
    node.textContent = message;
    toastRegion.appendChild(node);
    setTimeout(() => node.remove(), 3200);
  }
  function statusPill(ok, text) { return `<span class="demo-label" style="${ok ? '' : 'background:#fff5f5;border-color:#f1dcdc;color:#bd5555'}">${esc(text)}</span>`; }
  function categoryTag(category) {
    const info = categoryInfo[category] || categoryInfo.plastic;
    return `<span class="category-tag ${info.color}"><span>${info.icon}</span>${info.label}</span>`;
  }
  function topbarSync() {
    const mode = state.mode === 'wired' ? 'WIRED MODE' : 'WIRELESS MODE';
    document.getElementById('topModeLabel').textContent = mode;
    document.getElementById('topModeDot').style.background = state.mode === 'wired' ? '#c28d43' : '#5596ce';
    document.getElementById('topConnectionLabel').textContent = state.connected ? 'Robot connected' : 'Robot disconnected';
    document.getElementById('topConnectionDot').style.background = state.connected ? '#69c895' : '#d75b5b';
    document.getElementById('pageCrumb').textContent = pageNames[state.currentPage] || 'Overview';
    const e = document.getElementById('topEStop');
    e.classList.toggle('active', state.emergencyStop);
    e.innerHTML = state.emergencyStop ? '<span class="estop-symbol">■</span> E-STOP ACTIVE' : '<span class="estop-symbol">■</span> EMERGENCY STOP';
  }
  function render() {
    document.querySelectorAll('.nav-link[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === state.currentPage));
    topbarSync();
    const map = {
      overview: renderOverview,
      'live-sorting': renderLiveSorting,
      'dobot-remote': renderRemote,
      records: renderRecords,
      analytics: renderAnalytics,
      system: renderSystem
    };
    pageContent.innerHTML = (map[state.currentPage] || renderOverview)();
    saveState();
  }

  function heading(title, subtitle, action = '') {
    return `<div class="page-heading"><div><div class="eyebrow">ECOBOT / CAMPUS WASTE INTELLIGENCE</div><h1>${title}</h1><p class="page-subtitle">${subtitle}</p></div><div class="heading-actions">${action}<span class="demo-label">DEMO DATA</span></div></div>`;
  }

  function kpi(label, value, foot, icon, tint, accent) {
    return `<div class="card kpi-card" style="--tint:${tint};--accent:${accent}"><div class="kpi-top"><span class="kpi-label">${label}</span><span class="kpi-icon">${icon}</span></div><div class="kpi-value">${value}</div><div class="kpi-foot">${foot}</div></div>`;
  }

  function renderOverview() {
    const total = Object.values(state.categoryTotals).reduce((a,b) => a + b, 0);
    const recent = state.activity.slice(0, 4);
    const maxBar = Math.max(...state.weekly.map(d => d.plastic + d.paper));
    const bars = state.weekly.map((d, i) => {
      const p = Math.max(5, d.plastic / maxBar * 100);
      const q = Math.max(5, d.paper / maxBar * 100);
      return `<div class="bar-group"><div class="bar ${i === 6 ? 'today' : ''}" style="height:${p}%" title="Plastic ${d.plastic}"></div><div class="bar secondary" style="height:${q * .72}%" title="Paper ${d.paper}"></div></div>`;
    }).join('');
    return `${heading('Campus sorting overview', 'A live-style snapshot of your intelligent waste segregation prototype.', `<span class="date-chip">▦ &nbsp; ${dateLabel()}</span>`)}
      <div class="kpi-grid">
        ${kpi('ITEMS SORTED', number(total), '<span class="positive">+12.6%</span> &nbsp; vs. previous period', '↗', '#e8f5ed', '#3c9866')}
        ${kpi('DETECTION ACCURACY', `${state.accuracy.toFixed(1)}%`, 'Vision model · mock evaluation', '◎', '#edf5fb', '#548fbe')}
        ${kpi('SORTING SUCCESS RATE', `${state.successRate.toFixed(1)}%`, 'Successful pick-and-place cycles', '✓', '#f2f6e9', '#83a14c')}
        ${kpi('AVG. COMMUNICATION', `${state.latency} ms`, `${state.mode === 'wired' ? 'USB / Serial link' : 'Wi-Fi / RF link'} · simulated`, '⌁', '#fbf3e7', '#c18a3f')}
      </div>
      <div class="dashboard-grid">
        <section class="card"><div class="card-head"><div><h3 class="card-title">Segregation activity</h3><p class="card-caption">Items processed across the current week</p></div><div class="legend-row"><span class="legend-key"><i class="legend-swatch"></i>Plastic</span><span class="legend-key"><i class="legend-swatch secondary"></i>Paper</span></div></div>
          <div class="card-body"><div class="chart-wrap"><div class="chart-y-axis"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div><div class="chart-main"><div class="bar-chart">${bars}</div><div class="chart-labels">${state.weekly.map(d => `<span>${d.day}</span>`).join('')}</div></div></div></div></section>
        <section class="card"><div class="card-head"><div><h3 class="card-title">Recent activity</h3><p class="card-caption">Latest classification and sorting events</p></div><button class="btn btn-secondary btn-sm" data-action="navigate" data-route="records">View all ↗</button></div><div class="card-body"><div class="activity-list">${recent.map(a => `<div class="activity-item"><div class="activity-symbol symbol-${a.category}">${categoryInfo[a.category].icon}</div><div class="activity-copy"><strong>${esc(a.item)}</strong><span>${esc(a.action)} · ${esc(a.id)}</span></div><span class="activity-time">${esc(a.time)}</span></div>`).join('')}</div></div></section>
      </div>
      <div class="bottom-grid">
        <section class="card"><div class="card-head"><div><h3 class="card-title">System workflow</h3><p class="card-caption">End-to-end process architecture</p></div>${statusPill(state.connected, state.connected ? 'SYSTEM READY' : 'DISCONNECTED')}</div><div class="card-body"><div class="pipeline"><div class="pipeline-step"><div class="pipeline-icon">◉</div><strong>Detection</strong><span>Camera + sensors</span></div><div class="pipeline-arrow">→</div><div class="pipeline-step"><div class="pipeline-icon">⌘</div><strong>Controller</strong><span>Classification</span></div><div class="pipeline-arrow">→</div><div class="pipeline-step"><div class="pipeline-icon">⌁</div><strong>Communication</strong><span>${state.mode === 'wired' ? 'USB / Serial' : 'Wi-Fi / RF'}</span></div><div class="pipeline-arrow">→</div><div class="pipeline-step"><div class="pipeline-icon">♧</div><strong>Dobot arm</strong><span>Pick & place</span></div><div class="pipeline-arrow">→</div><div class="pipeline-step"><div class="pipeline-icon">▤</div><strong>Waste bins</strong><span>3 target streams</span></div></div></div></section>
        <section class="card"><div class="card-head"><div><h3 class="card-title">Sensor network</h3><p class="card-caption">Mock device health and availability</p></div><button class="btn btn-secondary btn-sm" data-action="navigate" data-route="system">Configure ↗</button></div><div class="card-body"><div class="sensor-grid">${sensorPill('Vision camera', state.cameraOnline, 'USB camera')}${sensorPill('Inductive', state.inductiveOnline, 'Metal detect')}${sensorPill('Capacitive', state.capacitiveOnline, 'Material detect')}${sensorPill('Infrared', state.infraredOnline, 'Presence')}${sensorPill('Ultrasonic', state.ultrasonicOnline, 'Distance')}${sensorPill('Dobot link', state.connected, 'Robot status')}</div></div></section>
      </div>`;
  }

  function sensorPill(name, online, sub) {
    return `<div class="sensor-pill"><div class="sensor-pill-top"><i class="status-dot ${online ? '' : 'offline'}"></i>${name}</div><strong>${online ? 'Online' : 'Offline'} <span style="font-weight:400;color:#a0aaa3">· ${sub}</span></strong></div>`;
  }

  function renderLiveSorting() {
    const info = categoryInfo[state.selectedCategory];
    const isLocked = state.emergencyStop || !state.connected;
    const progress = state.sorting ? 2 : state.sortStatus.includes('complete') ? 4 : 1;
    return `${heading('Live sorting station', 'Monitor the detection zone and test the waste classification-to-robot workflow.', `<button class="btn btn-primary" data-action="start-sort" ${isLocked || state.sorting ? 'disabled' : ''}>▶ &nbsp; Simulate sorting</button>`)}
      <div class="live-layout">
        <section class="card camera-panel"><div class="card-head"><div><h3 class="card-title">Vision detection feed</h3><p class="card-caption">Camera 01 · simulated live preview</p></div><span class="demo-label">${state.cameraOnline ? 'CAMERA ONLINE' : 'CAMERA OFFLINE'}</span></div>
          <div class="camera-frame"><div class="camera-hud"><span class="camera-live">● LIVE PREVIEW</span><span>CAM-01 &nbsp; 640 × 480</span></div><div class="camera-target"><i class="target-corner tl"></i><i class="target-corner tr"></i><i class="target-corner bl"></i><i class="target-corner br"></i><div class="mock-object" id="mockObject">${info.icon}</div></div><div class="camera-label">OBJECT TRACKING · ${info.label.toUpperCase()}</div></div>
          <div class="camera-bottom"><span>Detection zone · Conveyor / input tray</span><span>Frame rate: 24 FPS (demo)</span></div>
        </section>
        <section class="card detection-card"><div><h3 class="card-title">Classification result</h3><p class="card-caption">Selected category for the next demo cycle</p></div>
          <div class="detection-class"><div class="detection-emoji">${info.icon}</div><div><strong>${info.label}</strong><span>Predicted material class</span></div><div class="confidence-value">${state.selectedCategory === 'plastic' ? '98.4' : state.selectedCategory === 'paper' ? '95.1' : '97.7'}<small style="font-size:9px">%</small></div></div>
          <div class="detail-pair"><span>Vision model</span><strong>YOLO · Demo model v1</strong></div><div class="detail-pair"><span>Supplementary sensor</span><strong>${state.selectedCategory === 'metal' ? 'Inductive: detected' : 'IR + capacitive: detected'}</strong></div><div class="detail-pair"><span>Target destination</span><strong>${info.route}</strong></div><div class="detail-pair"><span>Control route</span><strong>${state.mode === 'wired' ? 'USB / Serial' : 'Wi-Fi / RF'}</strong></div>
          <div style="margin-top:15px"><div class="card-title" style="font-size:10px">Manual classification selection</div><div class="category-buttons">${Object.keys(categoryInfo).map(key => `<button class="category-btn ${state.selectedCategory === key ? 'selected' : ''}" data-action="select-category" data-category="${key}"><span class="cat-emoji">${categoryInfo[key].icon}</span>${categoryInfo[key].label.split(' / ')[0]}</button>`).join('')}</div></div>
          <div class="workflow">${['Detect','Classify','Transmit','Pick & place'].map((name,i)=>`<div class="workflow-step ${i < progress ? 'done' : i === progress ? 'current' : ''}"><div class="workflow-num">${i < progress ? '✓' : i+1}</div><span>${name}</span></div>`).join('')}</div>
          <div class="action-row"><button class="btn btn-primary" data-action="start-sort" ${isLocked || state.sorting ? 'disabled' : ''}>▶ &nbsp; Run demo cycle</button><button class="btn btn-secondary" data-action="navigate" data-route="dobot-remote">Open Dobot remote ↗</button></div>
          <p class="muted-note" style="margin:12px 0 0">${state.emergencyStop ? 'Emergency stop is latched. Reset safety on the System & Safety page before running another cycle.' : !state.connected ? 'Robot link is disconnected. Connect the simulated robot before starting a cycle.' : esc(state.sortStatus)}</p>
        </section>
      </div>
      <section class="card section-gap"><div class="card-head"><div><h3 class="card-title">Sensor fusion snapshot</h3><p class="card-caption">Example signals that support the classification decision</p></div><span class="muted-note">Sample values only</span></div><div class="card-body"><div class="sensor-grid"><div class="sensor-pill"><div class="sensor-pill-top">◉ Camera model</div><strong>${state.selectedCategory === 'plastic' ? 'Plastic · 98.4%' : state.selectedCategory === 'paper' ? 'Paper · 95.1%' : 'Metal · 97.7%'}</strong></div><div class="sensor-pill"><div class="sensor-pill-top">⌁ Inductive</div><strong>${state.selectedCategory === 'metal' ? 'Metal presence' : 'No metal detected'}</strong></div><div class="sensor-pill"><div class="sensor-pill-top">◌ IR presence</div><strong>Object detected</strong></div><div class="sensor-pill"><div class="sensor-pill-top">↕ Ultrasonic</div><strong>Distance · 11.8 cm</strong></div><div class="sensor-pill"><div class="sensor-pill-top">▧ Capacitive</div><strong>${state.selectedCategory === 'paper' ? 'Low response' : 'Material response'}</strong></div><div class="sensor-pill"><div class="sensor-pill-top">⌘ Controller</div><strong>${state.connected ? 'Ready for command' : 'Waiting for link'}</strong></div></div></div></section>`;
  }

  function renderRobotSvg() {
    return `<svg class="robot-svg" viewBox="0 0 520 340" role="img" aria-label="Illustrative Dobot Magician robotic arm visualization">
      <defs><linearGradient id="armMetal" x1="0" x2="1"><stop offset="0" stop-color="#b8c8be"/><stop offset=".48" stop-color="#edf2ed"/><stop offset="1" stop-color="#9aada2"/></linearGradient><linearGradient id="armGreen" x1="0" x2="1"><stop offset="0" stop-color="#277c57"/><stop offset=".55" stop-color="#57b17d"/><stop offset="1" stop-color="#286f50"/></linearGradient><filter id="armShadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#315343" flood-opacity=".18"/></filter></defs>
      <ellipse cx="262" cy="286" rx="137" ry="19" fill="#dfe8e1"/>
      <g filter="url(#armShadow)"><ellipse cx="260" cy="274" rx="67" ry="18" fill="#70867a"/><path d="M193 259 Q260 244 327 259 L319 276 Q260 296 201 276Z" fill="#344d40"/><ellipse cx="260" cy="258" rx="67" ry="18" fill="url(#armGreen)"/><ellipse cx="260" cy="253" rx="48" ry="11" fill="#75c292" opacity=".6"/><path d="M230 244 L230 202 Q230 187 246 181 L267 181 Q283 187 283 202 L283 244Z" fill="url(#armMetal)" stroke="#93a69a" stroke-width="1.5"/><ellipse cx="256" cy="190" rx="30" ry="16" fill="#dce6de" stroke="#9daea2"/><circle cx="256" cy="189" r="12" fill="#4a9d70" stroke="#d5eadc" stroke-width="4"/>
      <g id="armUpper" style="transform-origin:256px 187px"><path d="M243 181 L226 112 Q224 98 237 92 L253 86 Q269 84 275 99 L292 165 L271 180Z" fill="url(#armGreen)" stroke="#277a56" stroke-width="1.5"/><path d="M253 98 L267 96 L282 162 L269 166Z" fill="#b8d1c0" opacity=".8"/><circle cx="249" cy="102" r="17" fill="#dfe9e1" stroke="#7b9887" stroke-width="4"/><circle cx="249" cy="102" r="7" fill="#408d64"/></g>
      <g id="armFore" style="transform-origin:249px 102px"><path d="M250 91 L325 70 Q341 67 350 81 L355 94 Q357 109 341 114 L267 134 L256 116Z" fill="url(#armMetal)" stroke="#94a79b" stroke-width="1.5"/><path d="M269 100 L337 82 L342 96 L275 116Z" fill="#4b9e70" opacity=".92"/><circle cx="343" cy="94" r="15" fill="#dce7de" stroke="#8ca394" stroke-width="4"/><circle cx="343" cy="94" r="6" fill="#3d8c61"/></g>
      <path d="M352 88 L390 105 L384 118 L347 105Z" fill="#b6c6bb" stroke="#8fa497"/><path d="M384 108 L400 112 L398 136 L387 133Z" fill="#3b8a5e"/><path d="M388 132 L384 150 L391 150 L396 132Z" fill="#637d6d"/><path d="M390 149 L380 162 M394 149 L403 162" stroke="#526c5d" stroke-width="4" stroke-linecap="round"/><path d="M378 162 L382 170 M405 162 L401 170" stroke="#526c5d" stroke-width="3" stroke-linecap="round"/>
      <circle cx="260" cy="258" r="5" fill="#d3e6d9"/><text x="180" y="310" font-size="9" fill="#95a59b">DOBOT MAGICIAN · ILLUSTRATIVE VIEW</text></g>
      <g font-size="9" fill="#899a90"><text x="65" y="81">JOINT 1</text><path d="M110 84 L211 128" stroke="#b7c7bc" stroke-dasharray="3 3"/><text x="377" y="57">END EFFECTOR</text><path d="M390 62 L393 108" stroke="#b7c7bc" stroke-dasharray="3 3"/><text x="375" y="230">BASE</text><path d="M366 226 L313 259" stroke="#b7c7bc" stroke-dasharray="3 3"/></g>
    </svg>`;
  }

  function renderRemote() {
    const locked = state.emergencyStop || !state.connected;
    const c = state.coordinates;
    return `${heading('Dobot Magician remote', 'Explore the operator controls for manual positioning, end-effector selection, and communication mode testing.', `<span class="date-chip">⌘ &nbsp; ${esc(state.robotModel || 'Dobot Magician')}</span>`)}
      <div class="remote-status-strip"><div class="remote-status-left"><div class="robot-status-orb">⌘</div><div class="remote-status-copy"><strong>${state.emergencyStop ? 'Emergency stop active' : state.connected ? 'Dobot Magician · Connected (demo)' : 'Dobot Magician · Disconnected'}</strong><span>${state.emergencyStop ? 'Motion commands are locked' : state.lastAction}</span></div></div><div class="mode-switch"><button class="mode-option ${state.mode === 'wired' ? 'active' : ''}" data-action="switch-mode" data-mode="wired">⌁ &nbsp; Wired / USB</button><button class="mode-option ${state.mode === 'wireless' ? 'active' : ''}" data-action="switch-mode" data-mode="wireless">◉ &nbsp; Wireless / RF</button></div><button class="btn ${state.connected ? 'btn-secondary' : 'btn-primary'} btn-sm" data-action="toggle-connection">${state.connected ? 'Disconnect' : 'Connect'} robot</button></div>
      <div class="remote-grid">
        <section class="card robot-stage"><div class="stage-toolbar"><div><strong>Robot workspace</strong><div class="card-caption">Illustrative arm position · not to scale</div></div><span>3D PREVIEW / DEMO</span></div><div class="robot-svg-wrap"><div class="stage-grid"></div>${renderRobotSvg()}<div class="stage-axis"><span class="x-axis">X ↗</span><span class="y-axis">Y ↖</span><span class="z-axis">Z ↑</span></div></div><div class="stage-footer"><span>Workspace limits · simulation only</span><span>Tool: ${state.tool === 'suction' ? 'Suction cup' : 'Gripper'} · ${state.toolActive ? 'Active' : 'Standby'}</span></div></section>
        <div class="remote-controls">
          <section class="card control-card"><div class="control-card-head"><strong>Position coordinates</strong><span>MM / DEG</span></div><div class="coordinate-grid"><div class="coordinate-box"><label>X AXIS</label><strong>${number(c.x,1)}</strong><small>mm</small></div><div class="coordinate-box"><label>Y AXIS</label><strong>${number(c.y,1)}</strong><small>mm</small></div><div class="coordinate-box"><label>Z AXIS</label><strong>${number(c.z,1)}</strong><small>mm</small></div><div class="coordinate-box"><label>ROTATION</label><strong>${number(c.r,1)}</strong><small>°</small></div></div>
            <div class="jog-row"><div class="jog-cluster"><button class="jog-btn" data-action="jog" data-axis="x" data-dir="-1" ${locked?'disabled':''}>X−</button><button class="jog-btn" data-action="jog" data-axis="y" data-dir="1" ${locked?'disabled':''}>Y+</button><button class="jog-btn" data-action="jog" data-axis="x" data-dir="1" ${locked?'disabled':''}>X+</button></div><span class="jog-label">XY JOG</span><div class="jog-cluster"><button class="jog-btn" data-action="jog" data-axis="y" data-dir="-1" ${locked?'disabled':''}>Y−</button><button class="jog-btn" data-action="jog" data-axis="z" data-dir="1" ${locked?'disabled':''}>Z+</button><button class="jog-btn" data-action="jog" data-axis="z" data-dir="-1" ${locked?'disabled':''}>Z−</button></div></div>
            <div class="jog-row"><div class="jog-cluster"><button class="jog-btn" data-action="jog" data-axis="r" data-dir="-1" ${locked?'disabled':''}>R−</button><span class="jog-label" style="align-self:center">ROTATE</span><button class="jog-btn" data-action="jog" data-axis="r" data-dir="1" ${locked?'disabled':''}>R+</button></div><span></span><span class="jog-label">STEP: 5 mm / 5°</span></div>
            <p class="jog-note">Jog buttons adjust the mock coordinates. Actual workspace limits must be configured and enforced by the robot controller.</p>
          </section>
          <section class="card control-card"><div class="control-card-head"><strong>Motion & end-effector</strong><span>OPERATOR SETTINGS</span></div><div class="setting-copy" style="margin-bottom:8px"><strong>Movement speed</strong><span>Percentage of configured maximum speed</span></div><div class="speed-row"><input type="range" min="10" max="100" step="5" value="${state.speed}" data-action="speed" ${locked?'disabled':''}/><span class="speed-value">${state.speed}%</span></div><div class="speed-marks"><span>10% · Precise</span><span>100% · Fast</span></div><div style="height:14px"></div><div class="setting-copy" style="margin-bottom:8px"><strong>End-effector tool</strong><span>Select the tool attached to the robot arm</span></div><div class="tool-toggle"><button class="tool-option ${state.tool === 'suction'?'active':''}" data-action="tool" data-tool="suction" ${locked?'disabled':''}>◉ &nbsp; Suction cup</button><button class="tool-option ${state.tool === 'gripper'?'active':''}" data-action="tool" data-tool="gripper" ${locked?'disabled':''}>⊞ &nbsp; Gripper</button></div>
            <div class="remote-bottom-actions"><button class="btn btn-secondary" data-action="home" ${locked?'disabled':''}>⌂ &nbsp; Home</button><button class="btn btn-success" data-action="tool-action" ${locked?'disabled':''}>${state.tool === 'suction' ? (state.toolActive ? '◉ &nbsp; Vacuum ON' : '◉ &nbsp; Vacuum OFF') : (state.toolActive ? '⊞ &nbsp; Grip CLOSED' : '⊞ &nbsp; Grip OPEN')}</button><button class="btn btn-danger" data-action="request-estop">■ &nbsp; Stop</button></div>
            <div class="connection-meta"><div class="meta-cell"><span>LINK TYPE</span><strong>${state.mode === 'wired'?'USB / Serial':'Wi-Fi / RF'}</strong></div><div class="meta-cell"><span>LATENCY</span><strong>${state.mode === 'wired'?'14 ms':`${state.latency} ms`}</strong></div><div class="meta-cell"><span>CONNECTION</span><strong>${state.connected?'Stable':'Offline'}</strong></div></div>
          </section>
        </div>
      </div>
      ${locked ? `<div class="card section-gap" style="padding:14px 16px;color:#b45050;font-size:9px">${state.emergencyStop ? 'E-STOP is active. Use the System & Safety page to inspect the state and reset the demo interlock.' : 'The robot is disconnected. Connect the demo robot to enable motion controls.'}</div>` : ''}
      <p class="muted-note" style="margin:13px 2px 0">Safety reminder: this is a UI-only simulator. A production Dobot integration requires a hardware-side safety circuit, validated workspace limits, and controller-side command checks.</p>`;
  }

  function renderRecords() {
    const rows = state.records.map(r => `<tr data-record-row data-category="${r.category}" data-status="${r.status}" data-search="${esc((r.id+' '+r.item+' '+r.route).toLowerCase())}"><td class="id-cell">${esc(r.id)}</td><td>${esc(r.timestamp)}</td><td><strong style="color:#526259;font-weight:600">${esc(r.item)}</strong></td><td>${categoryTag(r.category)}</td><td>${number(r.confidence,1)}%</td><td>${esc(r.route)}</td><td><span class="status-tag ${r.status === 'success'?'success':'flagged'}">${r.status === 'success'?'✓ Completed':'! Review'}</span></td><td>${number(r.duration,1)} s</td><td>${r.mode === 'wired'?'Wired':'Wireless'}</td></tr>`).join('');
    return `${heading('Waste segregation records', 'Browse the mock event history generated by the prototype sorting workflow.', `<button class="btn btn-secondary" data-action="export-csv">↓ &nbsp; Export CSV</button>`)}
      <section class="card"><div class="filter-bar"><div class="search-field"><span class="search-glyph">⌕</span><input id="recordSearch" type="search" placeholder="Search record ID, item, or destination…" /></div><select class="filter-select" id="categoryFilter"><option value="all">All categories</option><option value="plastic">Plastic</option><option value="paper">Paper</option><option value="metal">Metal</option></select><select class="filter-select" id="statusFilter"><option value="all">All statuses</option><option value="success">Completed</option><option value="flagged">Review</option></select><button class="btn btn-quiet btn-sm" data-action="clear-filters">Clear filters</button></div>
      <div class="data-table-wrap"><table><thead><tr><th>Record ID</th><th>Timestamp</th><th>Detected item</th><th>Category</th><th>Confidence</th><th>Destination</th><th>Status</th><th>Cycle time</th><th>Mode</th></tr></thead><tbody id="recordsTableBody">${rows || '<tr><td colspan="9"><div class="empty-state">No records found.</div></td></tr>'}</tbody></table></div><div class="table-footer"><span id="recordCount">Showing ${state.records.length} mock records</span><div class="pagination"><span class="page-dot active">1</span><span class="page-dot">2</span><span class="page-dot">3</span><span style="padding:5px 3px">···</span></div></div></section>
      <p class="muted-note" style="margin:12px 2px 0">Records are stored only in this browser's local demo state. CSV export downloads the currently seeded and simulated records.</p>`;
  }

  function renderAnalytics() {
    const total = Object.values(state.categoryTotals).reduce((a,b)=>a+b,0);
    const pc = total ? Math.round(state.categoryTotals.plastic / total * 100) : 0;
    const pa = total ? Math.round(state.categoryTotals.paper / total * 100) : 0;
    const mt = 100-pc-pa;
    return `${heading('Performance analytics', 'Evaluate segregation volume, classification performance, and dual-mode communication metrics.', `<span class="date-chip">◷ &nbsp; Last 7 days · Demo</span>`)}
      <div class="kpi-grid">${kpi('TOTAL SORTED',number(total),'Across the 3 target categories','▤','#e8f5ed','#3c9866')}${kpi('AVG. CYCLE TIME','4.8 s','Detection to bin placement','◷','#edf5fb','#548fbe')}${kpi('WIRED LATENCY','14 ms','Simulated USB / Serial average','⌁','#fbf3e7','#c18a3f')}${kpi('WIRELESS LATENCY',`${state.latency} ms`,'Simulated Wi-Fi / RF average','◉','#f2f6e9','#83a14c')}</div>
      <div class="analytics-grid"><section class="card"><div class="card-head"><div><h3 class="card-title">Waste category distribution</h3><p class="card-caption">Share of all logged items</p></div><span class="demo-label">${number(total)} ITEMS</span></div><div class="card-body"><div class="donut-layout"><div class="donut-chart" style="background:conic-gradient(#4396c7 0 ${pc}%,#e0b45f ${pc}% ${pc+pa}%,#7b8992 ${pc+pa}% 100%)"><div class="donut-center"><strong>${number(total)}</strong><span>Total items</span></div></div><div class="donut-legend"><div class="donut-legend-item"><i class="legend-dot blue"></i><span>Plastic</span><strong>${number(state.categoryTotals.plastic)} · ${pc}%</strong></div><div class="donut-legend-item"><i class="legend-dot amber"></i><span>Paper / Non-metal</span><strong>${number(state.categoryTotals.paper)} · ${pa}%</strong></div><div class="donut-legend-item"><i class="legend-dot gray"></i><span>Metal</span><strong>${number(state.categoryTotals.metal)} · ${mt}%</strong></div></div></div></div></section>
      <section class="card"><div class="card-head"><div><h3 class="card-title">System performance indicators</h3><p class="card-caption">Illustrative evaluation values</p></div></div><div class="card-body"><div class="metric-list"><div class="metric-row"><label>Detection accuracy</label><div class="metric-track"><span style="width:${state.accuracy}%"></span></div><strong>${state.accuracy.toFixed(1)}%</strong></div><div class="metric-row"><label>Sorting success</label><div class="metric-track"><span style="width:${state.successRate}%"></span></div><strong>${state.successRate.toFixed(1)}%</strong></div><div class="metric-row"><label>Sensor availability</label><div class="metric-track"><span style="width:${[state.cameraOnline,state.inductiveOnline,state.capacitiveOnline,state.infraredOnline,state.ultrasonicOnline].filter(Boolean).length*20}%"></span></div><strong>${[state.cameraOnline,state.inductiveOnline,state.capacitiveOnline,state.infraredOnline,state.ultrasonicOnline].filter(Boolean).length*20}%</strong></div><div class="metric-row"><label>Demo uptime</label><div class="metric-track"><span style="width:99.1%"></span></div><strong>99.1%</strong></div></div><p class="muted-note" style="margin:17px 0 0">For the final study, replace these sample values with repeated trial results and clearly defined test conditions.</p></div></section></div>
      <div class="performance-cards"><div class="card performance-card"><span>WIRELESS LINK</span><strong>${state.latency} ms</strong><small>Mock round-trip latency</small></div><div class="card performance-card"><span>WIRED LINK</span><strong>14 ms</strong><small>Mock round-trip latency</small></div><div class="card performance-card"><span>MODE COMPARISON</span><strong>${number(state.latency-14)} ms</strong><small>Wireless minus wired latency</small></div></div>`;
  }

  function renderSystem() {
    const sensors = [
      ['Vision camera','USB camera / AI inference','cameraOnline','◉'],
      ['Inductive sensor','Metal presence detection','inductiveOnline','⌁'],
      ['Capacitive sensor','Material response detection','capacitiveOnline','◌'],
      ['Infrared sensor','Object presence input','infraredOnline','◎'],
      ['Ultrasonic sensor','Distance measurement','ultrasonicOnline','↕']
    ];
    return `${heading('System configuration & safety', 'Review communication modes, sensor health, automation preferences, and operator safety states.', `<button class="btn btn-secondary" data-action="refresh-demo">↻ &nbsp; Refresh demo state</button>`)}
      <div class="system-grid"><div>
        <section class="card" style="margin-bottom:15px"><div class="card-head"><div><h3 class="card-title">Communication configuration</h3><p class="card-caption">Dual-mode controller interface</p></div><span class="demo-label">MOCK LINK</span></div><div class="card-body">
          <div class="setting-row"><div class="setting-copy"><strong>Wired communication</strong><span>USB / Serial · example port COM3</span></div><button class="btn btn-sm ${state.mode==='wired'?'btn-success':'btn-secondary'}" data-action="switch-mode" data-mode="wired">${state.mode==='wired'?'Active mode':'Use wired'}</button></div>
          <div class="setting-row"><div class="setting-copy"><strong>Wireless communication</strong><span>Wi-Fi / RF · example network ECOBOT-LAB</span></div><button class="btn btn-sm ${state.mode==='wireless'?'btn-success':'btn-secondary'}" data-action="switch-mode" data-mode="wireless">${state.mode==='wireless'?'Active mode':'Use wireless'}</button></div>
          <div class="setting-row"><div class="setting-copy"><strong>Robot controller link</strong><span>${state.connected?'Handshake established in the demo UI':'No active demo link'}</span></div><button class="btn btn-sm ${state.connected?'btn-secondary':'btn-primary'}" data-action="toggle-connection">${state.connected?'Disconnect':'Connect'}</button></div>
          <div class="connection-meta"><div class="meta-cell"><span>ACTIVE MODE</span><strong>${state.mode==='wired'?'USB / Serial':'Wi-Fi / RF'}</strong></div><div class="meta-cell"><span>LATENCY</span><strong>${state.mode==='wired'?'14 ms':state.latency+' ms'}</strong></div><div class="meta-cell"><span>LINK STATUS</span><strong>${state.connected?'Connected':'Offline'}</strong></div></div>
        </div></section>
        <section class="card"><div class="card-head"><div><h3 class="card-title">Sensor availability</h3><p class="card-caption">Toggle mock sensor states to explore the UI</p></div></div><div class="card-body">${sensors.map(([name,desc,key,icon])=>`<div class="sensor-row"><div class="sensor-icon">${icon}</div><div class="sensor-copy"><strong>${name}</strong><span>${desc}</span></div><span class="status-dot ${state[key]?'':'offline'}"></span><button class="toggle ${state[key]?'on':''}" data-action="toggle-sensor" data-key="${key}" aria-label="Toggle ${name}" aria-pressed="${state[key]}"></button></div>`).join('')}</div></section>
      </div><div>
        <section class="card" style="margin-bottom:15px"><div class="card-head"><div><h3 class="card-title">Automation preferences</h3><p class="card-caption">Operator-level options for the demo</p></div></div><div class="card-body"><div class="setting-row"><div class="setting-copy"><strong>Automatic sorting mode</strong><span>Allow the simulated workflow to run after category selection</span></div><button class="toggle ${state.autoSort?'on':''}" data-action="toggle-setting" data-key="autoSort" aria-label="Toggle automatic sorting" aria-pressed="${state.autoSort}"></button></div><div class="setting-row"><div class="setting-copy"><strong>Return to home after cycle</strong><span>Demo preference only; no robot motion is issued</span></div><button class="toggle on" data-action="toast" data-message="Home-after-cycle preference is display-only in this prototype."></button></div><div class="setting-row"><div class="setting-copy"><strong>Communication-loss fallback</strong><span>Show a stop state when the mock connection is disconnected</span></div><button class="toggle on" data-action="toast" data-message="Communication-loss fallback is represented in the UI state."></button></div></div></section>
        <section class="card"><div class="card-head"><div><h3 class="card-title">Safety interlocks</h3><p class="card-caption">Emergency state and recovery actions</p></div></div><div class="card-body"><div class="safety-banner"><div class="safety-symbol">■</div><div class="safety-copy"><strong>${state.emergencyStop?'EMERGENCY STOP ACTIVE':'Emergency stop is not active'}</strong><span>${state.emergencyStop?'Remote commands are locked until reset.':'Demo interlock is currently released.'}</span></div></div><div class="setting-row"><div class="setting-copy"><strong>Emergency stop latch</strong><span>Simulated hardware stop state</span></div><span class="status-tag ${state.emergencyStop?'flagged':'success'}">${state.emergencyStop?'ACTIVE':'RELEASED'}</span></div><div class="setting-row"><div class="setting-copy"><strong>Home position</strong><span>Set display coordinates to the demo home pose</span></div><button class="btn btn-secondary btn-sm" data-action="home" ${state.emergencyStop||!state.connected?'disabled':''}>⌂ &nbsp; Home</button></div><div class="setting-row"><div class="setting-copy"><strong>Reset safety state</strong><span>Clear the demo emergency-stop latch after inspection</span></div><button class="btn btn-danger btn-sm" data-action="reset-safety" ${!state.emergencyStop?'disabled':''}>Reset interlock</button></div><p class="muted-note" style="margin:13px 0 0">A real emergency stop must be a hardwired, fail-safe circuit that removes motion power independently of this webpage. Do not rely on a browser button for personnel safety.</p></div></section>
      </div></div>
      <section class="card section-gap"><div class="card-head"><div><h3 class="card-title">Recent system events</h3><p class="card-caption">Illustrative controller and sensor event log</p></div></div><div class="data-table-wrap"><table><thead><tr><th>Time</th><th>Event</th><th>Description</th><th>Level</th></tr></thead><tbody>${state.events.slice(0,6).map(e=>`<tr><td class="id-cell">${esc(e.time)}</td><td><strong style="font-size:8px;color:#617168">${esc(e.type)}</strong></td><td>${esc(e.detail)}</td><td><span class="status-tag ${e.level==='success'?'success':'flagged'}">${e.level==='success'?'Normal':'Info'}</span></td></tr>`).join('')}</tbody></table></div></section>`;
  }

  function startSort(category) {
    if (state.emergencyStop) { toast('Emergency stop is active. Reset safety before sorting.', 'error'); return; }
    if (!state.connected) { toast('Robot is disconnected. Connect before sorting.', 'warning'); return; }
    if (state.sorting) { toast('A demo sorting cycle is already running.', 'warning'); return; }
    const selected = category || state.selectedCategory;
    state.selectedCategory = selected;
    state.sorting = true;
    state.sortStatus = `Picking up ${categoryInfo[selected].label} · simulated cycle`;
    state.lastAction = 'Demo sorting cycle started';
    addEvent('SORT STARTED', `Manual demo cycle started for ${categoryInfo[selected].label}`, 'info');
    render();
    toast(`Demo cycle started: ${categoryInfo[selected].label}`);
    if (sortTimer) clearTimeout(sortTimer);
    sortTimer = setTimeout(() => {
      const info = categoryInfo[selected];
      const idNumber = (Math.max(...state.records.map(r => Number(String(r.id).replace(/\D/g,'')) || 2400)) + 1);
      const id = `EC-${idNumber}`;
      const duration = Number((4.1 + Math.random() * 1.6).toFixed(1));
      const record = { id, timestamp: `${new Date().toLocaleDateString('en-CA')} ${timeNow()}`, category: selected, item: info.item, confidence: selected==='plastic'?98.4:selected==='paper'?95.1:97.7, route: info.route, status:'success', duration, mode:state.mode };
      state.records.unshift(record);
      state.categoryTotals[selected] += 1;
      state.cycleCount += 1;
      state.sorting = false;
      state.sortStatus = `Cycle complete · ${id} sorted to ${info.route}`;
      state.lastAction = `Last cycle: ${info.label} → ${info.route}`;
      state.activity.unshift({ category:selected, item:info.item, action:`Sorted to ${info.route}`, time:'just now', id });
      state.activity = state.activity.slice(0, 6);
      state.events.unshift({ time:timeNow(), type:'SORT COMPLETE', detail:`${id} · ${info.item} → ${info.route}`, level:'success' });
      state.events = state.events.slice(0, 12);
      state.successRate = Math.min(99.9, Number((state.successRate + 0.04).toFixed(1)));
      state.accuracy = Math.min(99.9, Number((state.accuracy + 0.01).toFixed(1)));
      saveState(); render(); toast(`${info.label} placed in ${info.route}.`);
    }, 1700);
  }

  function addEvent(type, detail, level='info') {
    state.events.unshift({ time:timeNow(), type, detail, level });
    state.events = state.events.slice(0, 12);
  }
  function requestEStop() { modal.hidden = false; }
  function activateEStop() {
    state.emergencyStop = true;
    state.sorting = false;
    if (sortTimer) clearTimeout(sortTimer);
    state.sortStatus = 'Emergency stop active · motion locked';
    state.lastAction = 'Emergency stop latched by operator';
    addEvent('EMERGENCY STOP', 'Operator activated the demo stop interlock', 'warning');
    modal.hidden = true;
    render();
    toast('Emergency stop active. Remote controls are locked.', 'error');
  }
  function resetSafety() {
    if (!state.emergencyStop) return;
    state.emergencyStop = false;
    state.sortStatus = 'Idle · safety interlock reset';
    state.lastAction = 'Safety reset acknowledged in demo UI';
    addEvent('SAFETY RESET', 'Demo emergency-stop latch was reset by operator', 'info');
    render();
    toast('Demo safety interlock reset. Inspect the robot before resuming.');
  }
  function switchMode(mode) {
    if (!['wired','wireless'].includes(mode)) return;
    state.mode = mode;
    state.latency = mode === 'wired' ? 14 : 42;
    state.lastAction = `Communication mode changed to ${mode === 'wired' ? 'Wired / USB' : 'Wireless / RF'}`;
    addEvent('COMMUNICATION', `Mode selected: ${mode === 'wired' ? 'USB / Serial' : 'Wi-Fi / RF'}`, 'info');
    render();
    toast(`${mode === 'wired' ? 'Wired / USB' : 'Wireless / RF'} mode selected.`);
  }
  function moveAxis(axis, dir) {
    if (state.emergencyStop || !state.connected) return;
    const limits = { x:[150,320], y:[-120,120], z:[0,150], r:[-180,180] };
    const step = axis === 'r' ? 5 : 5;
    const current = state.coordinates[axis];
    const next = Math.max(limits[axis][0], Math.min(limits[axis][1], current + dir * step));
    state.coordinates[axis] = Number(next.toFixed(1));
    state.lastAction = `Jogged ${axis.toUpperCase()} ${dir > 0 ? '+' : '−'}${step}${axis==='r'?'°':' mm'} (demo)`;
    render();
  }
  function goHome() {
    if (state.emergencyStop || !state.connected) return;
    state.coordinates = { x:248.0, y:12.0, z:42.0, r:0.0 };
    state.lastAction = 'Home position reached (simulated)';
    addEvent('HOME POSITION', 'Operator selected the demo home routine', 'success');
    render(); toast('Robot display returned to home coordinates.');
  }
  function toggleConnection() {
    state.connected = !state.connected;
    state.lastAction = state.connected ? 'Demo robot link connected' : 'Demo robot link disconnected';
    if (!state.connected) { state.sorting = false; if (sortTimer) clearTimeout(sortTimer); state.sortStatus = 'Communication lost · robot motion locked'; }
    addEvent('COMMUNICATION', state.connected ? 'Demo Dobot link connected' : 'Demo Dobot link disconnected', state.connected?'success':'warning');
    render(); toast(state.connected ? 'Demo robot connected.' : 'Demo robot disconnected.', state.connected?'success':'warning');
  }
  function toggleTool() {
    if (state.emergencyStop || !state.connected) return;
    state.toolActive = !state.toolActive;
    state.lastAction = `${state.tool === 'suction' ? 'Vacuum' : 'Gripper'} ${state.toolActive ? 'activated' : 'released'} (demo)`;
    render(); toast(state.lastAction);
  }
  function exportCsv() {
    const headers = ['record_id','timestamp','item','category','confidence_percent','destination','status','cycle_seconds','communication_mode'];
    const lines = [headers.join(','), ...state.records.map(r => [r.id,r.timestamp,r.item,r.category,r.confidence,r.route,r.status,r.duration,r.mode].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))];
    const blob = new Blob([lines.join('\n')], { type:'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'ecobot-demo-waste-records.csv'; a.click(); URL.revokeObjectURL(url);
    toast('CSV export generated from demo records.');
  }
  function filterRecords() {
    const search = (document.getElementById('recordSearch')?.value || '').toLowerCase();
    const category = document.getElementById('categoryFilter')?.value || 'all';
    const status = document.getElementById('statusFilter')?.value || 'all';
    let count = 0;
    document.querySelectorAll('[data-record-row]').forEach(row => {
      const show = (!search || row.dataset.search.includes(search)) && (category === 'all' || row.dataset.category === category) && (status === 'all' || row.dataset.status === status);
      row.hidden = !show; if (show) count++;
    });
    const label = document.getElementById('recordCount'); if (label) label.textContent = `Showing ${count} of ${state.records.length} mock records`;
  }

  document.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-route]');
    if (nav && nav.dataset.route) { event.preventDefault(); setRoute(nav.dataset.route); return; }
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const action = el.dataset.action;
    switch (action) {
      case 'navigate': setRoute(el.dataset.route); break;
      case 'switch-mode': switchMode(el.dataset.mode); break;
      case 'toggle-connection': toggleConnection(); break;
      case 'start-sort': startSort(); break;
      case 'select-category': state.selectedCategory = el.dataset.category; render(); break;
      case 'jog': moveAxis(el.dataset.axis, Number(el.dataset.dir)); break;
      case 'home': goHome(); break;
      case 'tool': state.tool = el.dataset.tool; render(); toast(`${state.tool === 'suction' ? 'Suction cup' : 'Gripper'} selected.`); break;
      case 'tool-action': toggleTool(); break;
      case 'request-estop': requestEStop(); break;
      case 'reset-safety': resetSafety(); break;
      case 'toggle-sensor': state[el.dataset.key] = !state[el.dataset.key]; render(); toast(`${el.dataset.key.replace('Online','')} sensor ${state[el.dataset.key]?'enabled':'disabled'} in demo.`); break;
      case 'toggle-setting': state[el.dataset.key] = !state[el.dataset.key]; render(); toast(`${el.dataset.key === 'autoSort' ? 'Automatic sorting' : 'Setting'} ${state[el.dataset.key]?'enabled':'disabled'}.`); break;
      case 'export-csv': exportCsv(); break;
      case 'clear-filters': { const s=document.getElementById('recordSearch'); const c=document.getElementById('categoryFilter'); const st=document.getElementById('statusFilter'); if(s)s.value='';if(c)c.value='all';if(st)st.value='all';filterRecords(); break; }
      case 'refresh-demo': state = initialState(); render(); toast('Mock data reset to the original seed dataset.'); break;
      case 'toast': toast(el.dataset.message || 'Demo setting selected.'); break;
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.id === 'recordSearch') filterRecords();
    if (event.target.matches('[data-action="speed"]')) {
      state.speed = Number(event.target.value);
      const value = event.target.parentElement.querySelector('.speed-value');
      if (value) value.textContent = `${state.speed}%`;
      saveState();
    }
  });
  document.addEventListener('change', (event) => {
    if (event.target.id === 'categoryFilter' || event.target.id === 'statusFilter') filterRecords();
  });

  document.getElementById('topEStop').addEventListener('click', requestEStop);
  document.getElementById('confirmEStop').addEventListener('click', activateEStop);
  document.getElementById('cancelEStop').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', (event) => { if (event.target === modal) modal.hidden = true; });
  document.getElementById('mobileMenu').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
  window.addEventListener('hashchange', () => {
    const route = location.hash.replace('#','') || 'overview';
    if (pageNames[route] && route !== state.currentPage) { state.currentPage = route; render(); }
  });

  const firstRoute = location.hash.replace('#','');
  state.currentPage = pageNames[firstRoute] ? firstRoute : 'overview';
  render();
})();
