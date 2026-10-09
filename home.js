/* ============================================================
   MOMO GINGKO — home pager (PDG rebuild R4 + R5)
   Five pages, same order on desktop and phone: cover → project highlights (black) → production design
   (paper between black bars; teaser ⇄ looping project carousel) → illustration (black grid; only once
   about.json has 8 illustrations) → about (paper, free scroll).

   The cover never moves. Two full-screen black cards (A, B) do the travelling; content never crosses a
   background change: on every move the old content leaves first (fade + small lift), the cards move, then
   the new content lands on its own ground. Exception: illustration ⇄ about, where the tiles ride away
   locked to card B.  Stack inside #hp: paper / about (1) < cards (2) < content (3); dots + cue sit outside.

   The choreography (go, CARD, timings), pdGeometry, the carousel, the grid and the wheel rule are copied
   from the approved prototype (_planning/pdg-rebuild/prototype-home-v4.html) — tune them there first.
   Pages are addressed by KEY here (the illustration page may be absent), not by fixed index.
   Loaded by index.html after the canvas engine (uses GK + isMob). Markup: GKcontent.homeSections().
   ============================================================ */
(function(){
  const body = document.body, hp = document.getElementById('hp'), dots = document.getElementById('hDots'), cue = document.getElementById('hCue');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T = t => reduce ? 1 : t;                             // timings below are ms at normal speed
  const mobile = isMob();
  const SECKEY = 'gk-home-sec';
  const ss = { get(k){ try{ return sessionStorage.getItem(k); }catch(e){ return null; } },
               set(k,v){ try{ sessionStorage.setItem(k,v); }catch(e){} } };
  const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const wantAbout = () => /^#about$/i.test(location.hash);
  const boot = wantAbout() ? 'about' : ss.get(SECKEY);       // read before anything can overwrite it
  const onHome = () => body.dataset.page === 'home';
  const isPhone = () => hp.clientWidth <= 600;

  hp.innerHTML =
    '<i class="hbarprobe"></i><div class="hp-paper"></div>'+
    '<section class="hsec habout" data-key="about" aria-label="About"><div class="habout-in"><h2 class="hsh">About</h2><div class="mabout-body"></div></div>'+
    (mobile ? '<footer class="mfoot"><nav class="mfoot-nav"><a data-go="cover" role="button">Home</a><a data-go="about" role="button">About</a></nav><span class="mfoot-cr">© 2025 默默 GINGKO</span></footer>' : '')+
    '</section><div class="hcard" id="hcardA"></div><div class="hcard" id="hcardB"></div>';
  const aboutEl = hp.querySelector('.habout'), cardA = document.getElementById('hcardA'), cardB = document.getElementById('hcardB');
  GKcontent.renderAbout(aboutEl.querySelector('.mabout-body'), {inline:true});

  let pages = [{key:'cover', name:'Cover', el:null}], N = 1;
  let idx = 0, entered = false, busy = false, blown = false, timers = [], pending = null;
  let pdsec = null, panes = null, strip = null, ilsec = null, NP = 0, ci = 0, stepping = false, drawAR = 1100/712;
  let ilMedia = [], ilQueue = [], ilFilled = false, ilHover = false;
  const keyOf = i => (pages[i]||{}).key, elOf = i => (pages[i]||{}).el, at = k => pages.findIndex(p=>p.key===k);
  const later = (f,t) => timers.push(setTimeout(f, T(t)));

  /* ---------- page 3 geometry: project cards share the drawing's exact size and position ---------- */
  function pdGeometry(){
    const W = hp.clientWidth, H = hp.clientHeight, bar = hp.querySelector('.hbarprobe').offsetHeight, phone = W<=600;
    const maxW = phone ? W-32 : Math.min(W*.62, 900);
    const maxH = H - 2*bar - (phone ? 200 : 210);
    const w = Math.min(maxW, maxH*drawAR), h = w/drawAR;
    const gap = phone ? 14 : Math.max(18, W*.02);
    const side = phone ? 0 : 128;                            // dots on the very outside, then the arrows, then the cards
    const vw = W - 2*side, lead = (vw-w)/2;
    if(pdsec){ const s = pdsec.style;
      s.setProperty('--dw', w+'px'); s.setProperty('--dh', h+'px'); s.setProperty('--gap', gap+'px'); s.setProperty('--lead', lead+'px'); s.setProperty('--side', side+'px'); }
    return {w, gap, lead};
  }
  // infinite loop: three copies of the list; we live in the middle copy and jump silently when we drift out of it
  function paintCarousel(anim){ if(!strip) return; const g = pdGeometry();
    strip.style.transition = anim ? 'transform '+T(560)+'ms cubic-bezier(.6,0,.2,1)' : 'none';
    strip.style.transform = 'translateX('+(g.lead - ci*(g.w+g.gap))+'px)';
    const now = pdsec.querySelector('.hcnow'); if(now) now.textContent = ((ci%NP)+NP)%NP+1; }
  function step(d){ if(stepping || !NP) return; stepping = true; ci += d; paintCarousel(true);
    setTimeout(()=>{ if(ci>=2*NP) ci -= NP; if(ci<NP) ci += NP; paintCarousel(false); stepping = false; }, T(580)); }
  const allOpen = () => !!panes && panes.classList.contains('all');
  function showAll(on){ if(!panes) return; panes.classList.toggle('all', on);
    if(on){ ci = NP; paintCarousel(false); strip.classList.remove('nudge'); if(isPhone()){ strip.offsetWidth; strip.classList.add('nudge'); } } }

  /* ---------- page 4: fill the tiles late, and (desktop) cycle the rest of the pictures in ---------- */
  // Tiles start empty: the thumbs are fetched once the visitor leaves the cover, not on first load. Phones fill 1–8 only.
  function fillTiles(){ if(ilFilled || !ilsec) return; ilFilled = true;
    ilsec.querySelectorAll('.htile').forEach(t=>{ if(isPhone() && t.classList.contains('dk')) return; t.innerHTML = ilMedia[+t.dataset.m].html; }); }
  // About every 4s one random tile crossfades (0.6s) to the next picture not on screen; the one it replaced goes to the
  // back of the queue, so every pick appears over time. Desktop only, only while page 4 is current and settled, and
  // paused while the pointer is over the grid, the tab is hidden, or reduced motion is on.
  function cycleTile(){
    if(!ilsec || !ilQueue.length || reduce || isPhone() || ilHover || busy || document.hidden || !onHome() || keyOf(idx)!=='illustration' || !ilsec.classList.contains('show')) return;
    const tiles = [...ilsec.querySelectorAll('.htile')].filter(t=>!t.querySelector('.hin')), t = tiles[(Math.random()*tiles.length)|0]; if(!t) return;
    const m = ilQueue.shift(), old = t.firstElementChild, was = +t.dataset.m;
    t.insertAdjacentHTML('beforeend', ilMedia[m].html); const inc = t.lastElementChild; inc.classList.add('hin'); inc.offsetHeight; inc.classList.add('go');
    t.dataset.m = m; t.setAttribute('aria-label', ilMedia[m].label); ilQueue.push(was);
    setTimeout(()=>{ if(old) old.remove(); inc.classList.remove('hin','go'); }, 650);
  }
  setInterval(cycleTile, 4000);

  /* ---------- choreography ---------- */
  const CARD = { cover:['100%','100%'], highlights:['0%','100%'], pd:['calc(-100% + var(--bar))','calc(100% - var(--bar))'],
                 illustration:['-100%','0%'], about:['-100%','-100%'] };
  const E_CARD = 'cubic-bezier(.72,0,.2,1)', E_OUT = 'cubic-bezier(.5,0,.75,0)', E_IN = 'cubic-bezier(.2,.7,.2,1)';
  // timings (ms): old content out → cards → new content in
  const OUT = 260, CARD_D = 90, CARD_T = 520, IN_D = 530, IN_T = 400, LOCK = 760;
  const ROT = [-24,-8,-30,-14,-20];
  function setCards(key, dur, delay, ease){
    [cardA,cardB].forEach((c,k)=>{ c.style.transition = dur ? 'transform '+T(dur)+'ms '+(ease||E_CARD)+' '+T(delay||0)+'ms' : 'none'; c.style.transform = 'translateY('+CARD[key][k]+')'; });
  }
  function contentOut(el, dir){ if(!el) return; el.style.transition = 'opacity '+T(OUT)+'ms '+E_OUT+', transform '+T(OUT)+'ms '+E_OUT;
    el.style.opacity = 0; el.style.transform = 'translateY('+(dir*-6)+'%)'; later(()=>{ el.classList.remove('on'); el.style.transition = 'none'; }, OUT+20); }
  function contentIn(el, dir, delay){ if(!el) return; el.style.transition = 'none'; el.style.opacity = 0; el.style.transform = 'translateY('+(dir*7)+'%)'; el.classList.add('on'); el.offsetHeight;
    el.style.transition = 'opacity '+T(IN_T)+'ms '+E_IN+' '+T(delay)+'ms, transform '+T(IN_T)+'ms '+E_IN+' '+T(delay)+'ms'; el.style.opacity = 1; el.style.transform = 'none'; }
  // the cover (leaf canvas + logo + cue, all UNDER #hp) shows only on pages 1–2; elsewhere a paper layer hides it
  let coverOn = true;
  function cover(v){ coverOn = v; body.classList.toggle('hp-coveroff', !v); syncCanvas(); }
  // desktop canvas: once card A has covered the brushed landing field it becomes the calm return state for good
  // (GK.home()); while the cover is hidden it idles as the quiet paper field. Phones keep their static paper field.
  function syncCanvas(){ if(mobile || !blown || !onHome() || !window.GK) return;
    if(coverOn){ if(GK.mode!=='home') GK.home(); } else if(GK.mode!=='paper') GK.paper(); }
  function paint(){
    const k = keyOf(idx);
    body.classList.toggle('hp-in', idx>0);                                   // off the cover → leaf cursor
    body.classList.toggle('hp-about', k==='about');                          // phone: dots hidden on About
    body.classList.toggle('hp-dark', k==='highlights' || k==='illustration');// black page → light cursor
    dots.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-current', i===idx));
    if(entered && k) ss.set(SECKEY, k);
    if(idx>0) fillTiles();
  }
  const aboutOn = () => { aboutEl.classList.add('on'); aboutEl.style.opacity = 1; aboutEl.style.transform = 'none'; };

  function go(to){
    if(!entered || busy || !onHome() || N<2) return; to = Math.max(0, Math.min(N-1, to)); if(to===idx) return;
    const from = idx, dir = to>from ? 1 : -1, fk = keyOf(from), tk = keyOf(to); idx = to; paint();
    timers.forEach(clearTimeout); timers = [];
    if(fk==='pd') later(()=>showAll(false), 500);
    if(tk==='about') aboutEl.scrollTop = 0;

    // cover: visible only when it can be seen (pages 1–2); the card does the covering
    if(tk==='cover') cover(true);
    else if(tk==='highlights'){ if(fk!=='cover') later(()=>cover(true), CARD_D+CARD_T+20); }   // only once card A has closed over it
    else if(fk==='highlights') cover(false);
    else if(fk==='cover') later(()=>cover(false), CARD_T*.45);
    // the brushed field becomes the calm state once the card has covered it
    if(fk==='cover' && !blown) later(()=>{ blown = true; syncCanvas(); }, CARD_T+80);

    // Illustration ⇄ About: the tiles ride with the black card, same speed, no shrinking
    if((fk==='illustration' && tk==='about') || (fk==='about' && tk==='illustration')){
      aboutOn();
      ilsec.classList.add('on','show','locked'); ilsec.style.opacity = 1; ilsec.style.transition = 'none';
      if(fk==='about'){ ilsec.style.transform = 'translateY(-100%)'; ilsec.offsetHeight; }
      ilsec.style.transition = 'transform '+T(CARD_T+60)+'ms '+E_CARD; ilsec.style.transform = tk==='about' ? 'translateY(-100%)' : 'none';
      setCards(tk, CARD_T+60, 0);
      later(()=>{ ilsec.classList.remove('locked');
        if(tk==='about'){ ilsec.classList.remove('on','show'); ilsec.style.transition = 'none'; ilsec.style.transform = 'none'; } else { aboutEl.classList.remove('on'); } }, CARD_T+80);
      busy = true; later(()=>{ busy = false; }, LOCK); return;
    }

    // everything else: old content leaves first, cards move, new content lands on its own ground
    const old = (fk==='cover' || fk==='about') ? null : elOf(from);
    const cardDelay = old ? CARD_D : 0;
    // About is static paper UNDER the cards: it goes away once black fully covers it, and appears while black still does
    // (the prototype only reaches About through Illustration; these timings cover the other routes with the same rule)
    if(fk==='about') later(()=>aboutEl.classList.remove('on'), tk==='highlights' ? CARD_T : CARD_T*.5);
    contentOut(old, dir);
    if(fk==='illustration') later(()=>ilsec.classList.remove('show'), OUT);
    setCards(tk, CARD_T, cardDelay);
    const arrive = old ? IN_D : CARD_T-60;                   // from the cover the card leads, content follows
    if(tk==='illustration'){ ilsec.classList.remove('show'); ilsec.style.transform = 'none'; ilsec.classList.add('on'); ilsec.style.opacity = 1; ilsec.style.transition = 'none';
      later(()=>ilsec.classList.add('show'), cardDelay+CARD_T-40); }
    else if(tk==='about') later(aboutOn, fk==='highlights' ? OUT : cardDelay+CARD_T*.5);
    else contentIn(elOf(to), dir, arrive);
    busy = true; later(()=>{ busy = false; }, LOCK);
  }
  const next = () => go(idx+1), prev = () => go(idx-1);

  // cut straight to a page with no animation (returning to the home; restoring the section the visitor left)
  function jump(to){
    to = Math.max(0, Math.min(N-1, to)); const tk = keyOf(to);
    timers.forEach(clearTimeout); timers = []; busy = false; idx = to;
    setCards(tk, 0); showAll(false);
    pages.forEach((p,i)=>{ const el = p.el; if(!el) return;
      el.style.transition = 'none'; el.style.transform = 'none'; el.style.opacity = i===to ? 1 : '';
      el.classList.toggle('on', i===to); });
    if(ilsec){ ilsec.classList.add('locked'); ilsec.classList.toggle('show', tk==='illustration'); ilsec.offsetHeight; ilsec.classList.remove('locked'); }
    if(to>0) blown = true;
    cover(tk==='cover' || tk==='highlights'); paint();
  }

  /* ---------- build pages 2–4, the dots, and wire page 3 ---------- */
  const ready = GKcontent.homeSections().then(d=>{
    drawAR = d.drawAR;
    cardB.insertAdjacentHTML('afterend', d.pages.map(p=>'<section class="hsec h-'+p.key+'" data-key="'+p.key+'" aria-label="'+esc(p.name)+'">'+p.html+'</section>').join(''));
    const ab = d.about||{}, ah = aboutEl.querySelector('.hsh');
    if(ab.titleImg){ ah.classList.add('hsh-img'); ah.innerHTML = '<img src="'+esc(ab.titleImg)+'" alt="'+esc(ab.title||'About')+'">'; } else if(ab.title) ah.textContent = ab.title;
    pages = [{key:'cover', name:'Cover', el:null}, ...d.pages.map(p=>({key:p.key, name:p.name, el:hp.querySelector('.hsec[data-key="'+p.key+'"]')})), {key:'about', name:ab.title||'About', el:aboutEl}];
    N = pages.length;
    dots.innerHTML = pages.map((p,i)=>'<button type="button" data-i="'+i+'" aria-label="'+esc(p.name)+'" style="--rot:'+ROT[i%ROT.length]+'deg"><span class="lab">'+esc(p.name)+'</span></button>').join('');
    pdsec = hp.querySelector('.h-pd'); ilsec = hp.querySelector('.h-illustration');
    if(ilsec){ ilMedia = (d.pages.find(p=>p.key==='illustration')||{}).media || [];
      ilQueue = ilMedia.map((m,i)=>i).slice(28);              // the pictures beyond the 28 tiles wait here
      const grid = ilsec.querySelector('.higrid');
      grid.addEventListener('pointerenter', ()=>{ ilHover = true; }); grid.addEventListener('pointerleave', ()=>{ ilHover = false; }); }
    if(pdsec){ panes = pdsec.querySelector('.hpanes'); strip = pdsec.querySelector('.hstrip'); NP = (d.pages.find(p=>p.key==='pd')||{}).count || 0; ci = NP;
      pdsec.querySelector('.hteaser').addEventListener('click', e=>{ e.preventDefault(); showAll(true); });   // slides the pane; no page load
      pdsec.querySelector('.hback').addEventListener('click', ()=>showAll(false));
      pdsec.querySelector('.harr.l').addEventListener('click', ()=>step(-1));
      pdsec.querySelector('.harr.r').addEventListener('click', ()=>step(1)); }
    setCards('cover', 0); pdGeometry(); paint();
    if(pending!==null){ const k = pending; pending = null; api.resume(k||null); }
  });

  /* wheel: one gesture = one section. A move disarms the wheel; it re-arms after 260ms of silence, or on a clear
     new push during decaying momentum (big, >2.2× the last delta, the old gesture already below half its peak,
     and ≥350ms since the last move). Copied from the prototype — this is what stops the page 1 → 3 double jump. */
  let lastT = 0, lastAbs = 0, peak = 0, armed = true, lastTrig = -1e9;
  addEventListener('wheel', e=>{
    if(!onHome()) return;
    const now = performance.now(), abs = Math.abs(e.deltaY), gap = now-lastT;
    if(gap>260){ armed = true; peak = 0; }
    else if(!armed && abs>=30 && abs>lastAbs*2.2 && lastAbs<peak*.5 && now-lastTrig>350){ armed = true; peak = 0; }
    peak = Math.max(peak, abs); lastT = now; lastAbs = abs;
    if(keyOf(idx)==='about' && (aboutEl.scrollTop>1 || e.deltaY>0)){ armed = false; return; }   // About scrolls natively
    e.preventDefault();
    if(!armed || busy || abs<4 || !entered) return;
    armed = false; lastTrig = now; e.deltaY>0 ? next() : prev();
  }, {passive:false});

  /* touch: a vertical swipe over 40px = one section; on the open carousel a sideways swipe steps it.
     About scrolls natively; a downward swipe over 50px that STARTS at its top goes back. */
  let ty = null, tx = null, tTop = 0;
  addEventListener('touchstart', e=>{ if(!onHome()) return; ty = e.touches[0].clientY; tx = e.touches[0].clientX; tTop = aboutEl.scrollTop; }, {passive:true});
  addEventListener('touchmove', e=>{ if(onHome() && entered && keyOf(idx)!=='about' && e.cancelable) e.preventDefault(); }, {passive:false});
  addEventListener('touchend', e=>{ if(ty==null) return; const dy = ty-e.changedTouches[0].clientY, dx = tx-e.changedTouches[0].clientX; ty = null;
    if(!entered || !onHome()) return;
    if(keyOf(idx)==='pd' && allOpen() && Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)){ step(dx>0 ? 1 : -1); return; }
    if(keyOf(idx)!=='about'){ if(Math.abs(dy)>40) dy>0 ? next() : prev(); } else if(tTop<=1 && dy<-50) prev(); });

  addEventListener('keydown', e=>{
    if(!onHome() || !entered || e.metaKey || e.ctrlKey || e.altKey) return;
    if(keyOf(idx)==='pd' && allOpen()){ if(e.key==='ArrowRight'){ step(1); return; } if(e.key==='ArrowLeft'){ step(-1); return; } }
    if(keyOf(idx)==='about' && !((e.key==='ArrowUp'||e.key==='PageUp') && aboutEl.scrollTop<=1)) return;   // About: keys scroll it
    if(e.key===' ' && e.target.closest && e.target.closest('a,button')) return;                              // Space still activates a focused control
    if(['ArrowDown','PageDown',' '].includes(e.key)){ e.preventDefault(); next(); }
    if(['ArrowUp','PageUp'].includes(e.key)){ e.preventDefault(); prev(); }
  });
  dots.addEventListener('click', e=>{ const b = e.target.closest('button'); if(b) go(+b.dataset.i); });
  cue.addEventListener('click', e=>{ if(entered){ e.stopPropagation(); next(); } });
  hp.addEventListener('click', e=>{ const a = e.target.closest('[data-go]'); if(!a) return; e.preventDefault();
    if(a.dataset.go==='about') aboutEl.scrollTo({top:0, behavior: reduce?'auto':'smooth'}); else go(at(a.dataset.go)); });
  addEventListener('resize', ()=>{ pdGeometry(); if(allOpen()) paintCarousel(false); });

  const api = window.GKhome = {
    index: () => idx,
    key: () => keyOf(idx),
    // the landing was clicked / tapped (index.html activate): the pager unlocks
    entered(){ entered = true; body.classList.add('hp-entered'); paint();
      if(wantAbout()) ready.then(()=>jump(at('about'))); },
    // back on the home from an inner page (nav.js toHome) → the page the visitor left, or `key` (e.g. 'about')
    resume(key){
      entered = true; blown = true; body.classList.add('hp-entered');
      if(N<2){ pending = key||''; return; }                // pages not built yet → applied when they are
      const i = key ? at(key) : idx; jump(i<0 ? idx : i);
    }
  };

  // phone, returning to the home in a session that already entered: no landing tap, back on the page you left
  if(mobile && ss.get('gk-entered') && window.GK && GK.enterQuiet){
    GK.enterQuiet(); entered = true; body.classList.add('hp-entered');
    ready.then(()=>{ const i = boot ? at(boot) : 0; jump(i<0 ? 0 : i); });
  }
})();
