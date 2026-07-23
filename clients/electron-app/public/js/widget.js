const dial = document.getElementById('dial');
const widget = document.getElementById('jarvis-widget');
const waveRing = document.getElementById('waveRing');
const core = document.getElementById('core');
const label = document.getElementById('state-label');

const colors = {
  idle: '#54585f',
  listening: '#9DB4FF',
  processing: '#F0C36B',
  speaking: '#7FE7C4',
  error: '#FF8A73',
  awaiting_auth: '#FFA500'
};

// build 36 tick marks around the dial
const cx = 110, cy = 110, rOuter = 108, rInner = 100;
for(let i=0;i<36;i++){
  const angle = (i/36) * Math.PI * 2;
  const x1 = cx + rOuter*Math.cos(angle);
  const y1 = cy + rOuter*Math.sin(angle);
  const x2 = cx + rInner*Math.cos(angle);
  const y2 = cy + rInner*Math.sin(angle);
  const line = document.createElementNS('http://www.w3.org/2000/svg','line');
  line.setAttribute('x1',x1); line.setAttribute('y1',y1);
  line.setAttribute('x2',x2); line.setAttribute('y2',y2);
  line.classList.add('tick');
  line.dataset.idx = i;
  dial.appendChild(line);
}

let phase = 0;
let currentState = 'idle';

function waveformPath(amp, freq, rBase){
  let d = '';
  const points = 90;
  for(let i=0;i<=points;i++){
    const t = (i/points) * Math.PI * 2;
    const wobble = Math.sin(t*freq + phase) * amp;
    const r = rBase + wobble;
    const x = cx + r*Math.cos(t);
    const y = cy + r*Math.sin(t);
    d += (i===0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
  }
  return d + 'Z';
}

const stateConfig = {
  idle:       { amp:1.5,  freq:6, speed:0.01, rBase:88, coreClass:'idle', spin:false, ticks:0 },
  listening:  { amp:9,    freq:10,speed:0.09, rBase:88, coreClass:'pulse',spin:false, ticks:8 },
  processing: { amp:3,    freq:5, speed:0.05, rBase:88, coreClass:'pulse',spin:true,  ticks:36 },
  speaking:   { amp:6,    freq:16,speed:0.14, rBase:88, coreClass:'pulse',spin:false, ticks:20 },
  error:      { amp:2,    freq:3, speed:0.02, rBase:88, coreClass:'pulse',spin:false, ticks:36 },
  awaiting_auth:{ amp:4,  freq:12,speed:0.08, rBase:88, coreClass:'pulse',spin:true,  ticks:18 },
};

window.setWidgetState = function(s) {
  if(!stateConfig[s]) return;
  currentState = s;
  document.documentElement.style.setProperty('--state-color', colors[s]);
  core.className = 'core ' + (stateConfig[s].coreClass || '');
  dial.classList.toggle('spin', !!stateConfig[s].spin);

  // light ticks proportionally
  const cfg = stateConfig[s];
  const allTicks = dial.querySelectorAll('.tick');
  allTicks.forEach((t,i)=>{
    t.classList.toggle('lit', i < cfg.ticks);
  });

  label.textContent = s;
  label.classList.add('show');
  clearTimeout(window._labelTimeout);
  if(s === 'idle'){
    window._labelTimeout = setTimeout(()=>label.classList.remove('show'), 1800);
  }
};

function animate(){
  const cfg = stateConfig[currentState];
  phase += cfg.speed;
  waveRing.setAttribute('d', waveformPath(cfg.amp, cfg.freq, cfg.rBase));
  requestAnimationFrame(animate);
}
animate();
window.setWidgetState('idle');

// Interaction: Click core to toggle connection
core.style.cursor = 'pointer';
core.style.pointerEvents = 'auto'; // allow click through the drag region
core.title = 'Click to connect/disconnect Voice';

core.addEventListener('click', async (e) => {
  e.stopPropagation(); // prevent drag interference
  const live = window.JarvisLive;
  if (!live) return;
  if (live.isConnected) {
    live.disconnect();
    window.setWidgetState('idle');
  } else {
    await live.connect();
    // state will change via live.js callbacks
  }
});

// Interaction: Press Enter to open Chat
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement.tagName !== 'INPUT') {
    if (window.showChatPopup) {
      window.showChatPopup();
      const input = document.getElementById('chat-input');
      if (input) setTimeout(() => input.focus(), 100);
    }
  }
});
