/* ECOBOT mock data. Replace this file/API adapter when the backend is ready. */
window.ECOBOT_MOCK = {
  system: {
    projectName: 'ECOBOT',
    prototypeName: 'Dual-mode vision-based segregation prototype',
    robotModel: 'Dobot Magician',
    firmware: 'Demo firmware 0.1.0',
    controller: 'Master control hub',
    site: 'Campus Materials Recovery Area',
    mode: 'wireless',
    connected: true,
    emergencyStop: false,
    autoSort: true,
    cameraOnline: true,
    inductiveOnline: true,
    capacitiveOnline: true,
    infraredOnline: true,
    ultrasonicOnline: true,
    speed: 45,
    tool: 'suction',
    coordinates: { x: 248.0, y: 12.0, z: 42.0, r: 0.0 },
    selectedCategory: 'plastic',
    sortStatus: 'Idle · waiting for object',
    lastAction: 'Homed successfully',
    cycleCount: 1284,
    latency: 42,
    accuracy: 96.8,
    successRate: 94.2
  },
  records: [
    { id:'EC-2408', timestamp:'2026-11-02 15:42:18', category:'plastic', item:'PET beverage bottle', confidence:98.4, route:'Plastic bin', status:'success', duration:4.2, mode:'wireless' },
    { id:'EC-2407', timestamp:'2026-11-02 15:39:51', category:'paper', item:'Printed worksheet', confidence:95.1, route:'Paper bin', status:'success', duration:4.8, mode:'wired' },
    { id:'EC-2406', timestamp:'2026-11-02 15:36:23', category:'metal', item:'Aluminum can', confidence:97.7, route:'Metal bin', status:'success', duration:4.4, mode:'wireless' },
    { id:'EC-2405', timestamp:'2026-11-02 15:30:06', category:'plastic', item:'Food container', confidence:92.6, route:'Plastic bin', status:'success', duration:5.1, mode:'wireless' },
    { id:'EC-2404', timestamp:'2026-11-02 15:24:32', category:'paper', item:'Cardboard strip', confidence:89.3, route:'Paper bin', status:'success', duration:5.0, mode:'wired' },
    { id:'EC-2403', timestamp:'2026-11-02 15:17:44', category:'metal', item:'Steel food tin', confidence:96.2, route:'Metal bin', status:'success', duration:4.5, mode:'wireless' },
    { id:'EC-2402', timestamp:'2026-11-02 15:08:19', category:'plastic', item:'Plastic cup', confidence:87.8, route:'Plastic bin', status:'flagged', duration:6.3, mode:'wireless' },
    { id:'EC-2401', timestamp:'2026-11-02 14:58:02', category:'paper', item:'Notebook paper', confidence:98.1, route:'Paper bin', status:'success', duration:4.1, mode:'wired' },
    { id:'EC-2400', timestamp:'2026-11-02 14:51:37', category:'metal', item:'Drink can', confidence:95.4, route:'Metal bin', status:'success', duration:4.6, mode:'wireless' },
    { id:'EC-2399', timestamp:'2026-11-02 14:43:09', category:'plastic', item:'HDPE bottle', confidence:94.8, route:'Plastic bin', status:'success', duration:4.7, mode:'wired' },
    { id:'EC-2398', timestamp:'2026-11-02 14:35:50', category:'paper', item:'Paper packaging', confidence:91.6, route:'Paper bin', status:'success', duration:4.9, mode:'wireless' },
    { id:'EC-2397', timestamp:'2026-11-02 14:29:26', category:'metal', item:'Small metal bracket', confidence:88.9, route:'Metal bin', status:'flagged', duration:6.0, mode:'wireless' }
  ],
  activity: [
    { category:'plastic', item:'PET beverage bottle', action:'Sorted to Plastic bin', time:'2 min ago', id:'EC-2408' },
    { category:'paper', item:'Printed worksheet', action:'Sorted to Paper bin', time:'5 min ago', id:'EC-2407' },
    { category:'metal', item:'Aluminum can', action:'Sorted to Metal bin', time:'8 min ago', id:'EC-2406' },
    { category:'plastic', item:'Food container', action:'Sorted to Plastic bin', time:'12 min ago', id:'EC-2405' }
  ],
  weekly: [
    { day:'Mon', plastic:42, paper:33 }, { day:'Tue', plastic:57, paper:40 },
    { day:'Wed', plastic:48, paper:45 }, { day:'Thu', plastic:66, paper:51 },
    { day:'Fri', plastic:73, paper:58 }, { day:'Sat', plastic:51, paper:37 },
    { day:'Sun', plastic:62, paper:46 }
  ],
  categoryTotals: { plastic: 538, paper: 436, metal: 310 },
  events: [
    { time:'15:42:18', type:'SORT COMPLETE', detail:'EC-2408 · PET beverage bottle → Plastic bin', level:'success' },
    { time:'15:39:51', type:'SORT COMPLETE', detail:'EC-2407 · Printed worksheet → Paper bin', level:'success' },
    { time:'15:36:23', type:'SENSOR UPDATE', detail:'Inductive sensor returned metal-present state', level:'info' },
    { time:'15:30:06', type:'COMMUNICATION', detail:'Wireless heartbeat received · 42 ms latency', level:'info' },
    { time:'15:17:44', type:'SORT COMPLETE', detail:'EC-2403 · Steel food tin → Metal bin', level:'success' }
  ]
};
