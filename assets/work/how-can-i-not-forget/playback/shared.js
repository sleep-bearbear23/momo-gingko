/* ============================================================
   ORION SHARED — logo, font-size keyboard control
   Include after DOM is ready on every page.
   ============================================================ */

/* ── Font size keyboard control (↑ / ↓) ── */
(function () {
  let scale = 1.0;
  const MIN = 0.7, MAX = 1.5, STEP = 0.04;
  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      scale = Math.min(MAX, +(scale + STEP).toFixed(2));
      document.documentElement.style.fontSize = (scale * 16) + 'px';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      scale = Math.max(MIN, +(scale - STEP).toFixed(2));
      document.documentElement.style.fontSize = (scale * 16) + 'px';
    }
  });
})();

/* ── ORION logo renderer ──
   drawOrionLogo(canvas, fontSize)
   Draws the 5-segment sweep ring + "RION" onto a canvas element.
   Returns a stop() function to cancel the animation.
   fontSize: visual size of the wordmark in px (ring scales to match).
   The canvas is auto-sized and HiDPI-scaled (devicePixelRatio).
*/
function drawOrionLogo(canvas, fontSize) {
  const ctx = canvas.getContext('2d');
  const DPR = window.devicePixelRatio || 2;

  const FS = fontSize;
  const FW = '200';
  const FF = '"SF Pro Display","Helvetica Neue","DM Sans",system-ui,sans-serif';
  const LG = FS * 0.07;   // letter gap
  const R = FS * 0.44;   // ring radius
  const MW = R * 2 + FS * 0.18; // mark width
  const SW = Math.max(1.2, FS * 0.065); // stroke width
  const NS = 5, SG = 0.18;
  const SS = (Math.PI * 2 - NS * SG) / NS;

  const col = (a) => `rgba(40,38,34,${a})`;

  // Segment colours: teal for the bright leading segment, fading to warm grey
  // Each index maps to one of 5 segments ordered by brightness (0=brightest)
  const SEG_TEAL = [
    (a) => `rgba(38,148,140,${a})`,   // leading — teal
    (a) => `rgba(38,120,118,${a})`,   // second  — muted teal
    (a) => `rgba(60,80,78,${a})`,     // third   — dark teal-grey
    (a) => `rgba(50,52,50,${a})`,     // fourth  — near neutral
    (a) => `rgba(40,38,34,${a})`,     // tail    — warm grey
  ];

  // Map a normalised brightness rank (0=max, 4=min) to a colour function
  function segCol(rank, alpha) {
    const fn = SEG_TEAL[Math.min(rank, 4)];
    return fn(alpha);
  }

  function sf(c) { c.font = `${FW} ${FS}px ${FF}`; c.letterSpacing = `${LG}px`; }

  // measure RION on a throw-away canvas
  const tmp = document.createElement('canvas').getContext('2d');
  sf(tmp);
  const RW = tmp.measureText('RION').width;
  const CW = Math.ceil(MW + LG + RW + LG * 2) + 4;
  const CH = FS * 1.6;

  canvas.width = CW * DPR;
  canvas.height = Math.ceil(CH) * DPR;
  canvas.style.width = CW + 'px';
  canvas.style.height = Math.ceil(CH) + 'px';
  ctx.scale(DPR, DPR);

  const MCX = MW / 2 + 1;
  const MCY = CH / 2;
  const TX = MW + LG + 1;
  const TY = MCY + FS * 0.36;

  let angle = 0, spinning = false, spinStart = null, spinFrom = 0;
  let rafId = null;
  const SPIN_DUR = 1200;

  function easeInOutBack(t) {
    const c = 1.70158 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c + 1) * (2 * t - 2) + c) + 2) / 2;
  }

  function draw() {
    ctx.clearRect(0, 0, CW, CH);

    // Compute brightness rank for each segment this frame
    const alphas = [];
    for (let i = 0; i < NS; i++) {
      const a = i * (SS + SG);
      const mid = a + SS / 2;
      let diff = ((angle - mid) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      alphas.push(Math.max(0.07, 1 - (diff / Math.PI) * 1.1));
    }
    // Rank by brightness descending (rank 0 = brightest segment)
    const sorted = [...alphas].sort((a, b) => b - a);

    for (let i = 0; i < NS; i++) {
      const a = i * (SS + SG);
      const rank = sorted.indexOf(alphas[i]);
      ctx.beginPath();
      ctx.arc(MCX, MCY, R, a, a + SS);
      ctx.strokeStyle = segCol(rank, alphas[i] * 0.9);
      ctx.lineWidth = SW;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    sf(ctx);
    ctx.fillStyle = `rgba(32,140,132,0.92)`;
    ctx.fillText('RION', TX, TY);
  }

  function frame(ts) {
    if (spinning) {
      if (!spinStart) spinStart = ts;
      const t = Math.min((ts - spinStart) / SPIN_DUR, 1);
      const ease = easeInOutBack(t);
      angle = spinFrom + ease * Math.PI * 2 * 2.6;
      if (t >= 1) { spinning = false; spinStart = null; spinFrom = angle; }
    } else {
      angle += 0.001;
      spinFrom = angle;
    }
    draw();
    rafId = requestAnimationFrame(frame);
  }

  rafId = requestAnimationFrame(frame);

  // expose spin trigger and stop
  canvas._orionSpin = function () {
    if (spinning) return;
    spinning = true; spinStart = null; spinFrom = angle;
  };
  canvas._orionStop = function () { if (rafId) cancelAnimationFrame(rafId); };

  return { spin: canvas._orionSpin, stop: canvas._orionStop };
}