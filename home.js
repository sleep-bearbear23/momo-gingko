/* ============================================================
   MOMO GINGKO — home scroll (PDG rebuild R4)
   The home is five sections, same order on desktop and mobile:
   cover → project highlights → production design → illustration
   (only once about.json has 6 illustrations) → about.

   Desktop: sections ride a transform pager over the leaf canvas —
   one gesture = one section; About (last) scrolls freely.
   Mobile: the sections are #mHome slides (CSS scroll-snap).
   Both: section dots, and the section you left is where you return.
   Section markup comes from GKcontent.homeSections().
   Loaded by index.html after the canvas engine (uses GK + isMob).
   ============================================================ */
(function(){
  const body = document.body, dots = document.getElementById('hDots');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SEC = 'gk-home-sec';
  const ss = { get(k){ try{ return sessionStorage.getItem(k); }catch(e){ return null; } },
               set(k,v){ try{ sessionStorage.setItem(k,v); }catch(e){} } };
  let keys = ['cover'], names = ['Cover'];
  const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function buildDots(){ dots.innerHTML = names.map((n,i)=>'<button type="button" data-i="'+i+'" aria-label="'+esc(n)+'"><span>'+esc(n)+'</span></button>').join(''); }
  function paintDots(i){ dots.querySelectorAll('button').forEach((b,k)=>b.setAttribute('aria-current', k===i)); }
  const sectionHTML = (s, cls) => '<section class="'+cls+' hs" data-key="'+s.key+'" aria-label="'+esc(s.name)+'"><div class="hs-in">'+s.html+'</div></section>';
  const aboutHead = (el, ab) => { if(!el || !ab) return;
    if(ab.titleImg) { el.classList.add('hsh-img'); el.innerHTML = '<img src="'+esc(ab.titleImg)+'" alt="'+esc(ab.title||'About')+'">'; }
    else if(ab.title) el.textContent = ab.title; };
  const wantAbout = () => /^#about$/i.test(location.hash);

  /* ============================ MOBILE: #mHome scroll-snap slides ============================ */
  if(isMob()){
    const mh = document.getElementById('mHome'), aboutSec = document.getElementById('mAbout');
    const slides = () => [...mh.querySelectorAll('.mslide')];
    const current = () => { const cy = innerHeight/2, all = slides();
      return Math.max(0, all.findIndex(s=>{ const r = s.getBoundingClientRect(); return r.top<=cy && r.bottom>cy; })); };
    const jump = key => { const s = mh.querySelector('.mslide[data-key="'+key+'"]'); if(!s) return;
      const sb = mh.style.scrollBehavior; mh.style.scrollBehavior = 'auto'; mh.scrollTop = s.offsetTop; mh.style.scrollBehavior = sb; sync(); };
    // read the section to return to BEFORE anything can overwrite it; nothing is saved until it's restored
    const boot = wantAbout() ? 'about' : ss.get(SEC);
    let timer = 0, restored = false;
    function sync(){ timer = 0; if(!restored || !body.classList.contains('m-entered')) return;
      const i = current(); paintDots(i); if(keys[i]) ss.set(SEC, keys[i]); }

    const ready = GKcontent.homeSections().then(({sections, about})=>{
      aboutSec.insertAdjacentHTML('beforebegin', sections.map(s=>sectionHTML(s,'mslide')).join(''));
      aboutHead(document.getElementById('mAboutTitle'), about);
      keys = ['cover', ...sections.map(s=>s.key), 'about']; names = ['Cover', ...sections.map(s=>s.name), (about&&about.title)||'About'];
      buildDots(); sync();
    });
    GKcontent.renderAbout(mh.querySelector('.mabout-body'), {inline:true});

    mh.addEventListener('scroll', ()=>{ if(!timer) timer = setTimeout(sync, 90); }, {passive:true});
    mh.addEventListener('click', e=>{                       // footer "Home" / "About"
      const a = e.target.closest('[data-scroll]'); if(!a) return;
      const t = mh.querySelector(a.getAttribute('data-scroll')); if(t){ e.preventDefault(); t.scrollIntoView({behavior:'smooth', block:'start'}); }
    });
    dots.addEventListener('click', e=>{ const b = e.target.closest('button'); if(!b) return;
      const s = slides()[+b.dataset.i]; if(s) s.scrollIntoView({behavior: reduce?'auto':'smooth', block:'start'}); });

    // Return to the home in a session that already entered → no landing tap, back on the section you left
    // (index.html#about → About). A first visit keeps the landing; #about then applies right after the tap.
    if(ss.get('gk-entered') && window.GK && GK.enterQuiet){
      GK.enterQuiet(); ready.then(()=>{ restored = true; if(boot && boot!=='cover') jump(boot); else sync(); });
    } else {
      new MutationObserver((m, ob)=>{ if(!body.classList.contains('m-entered')) return; ob.disconnect();
        ready.then(()=>{ restored = true; if(wantAbout()) jump('about'); else sync(); }); }).observe(body, {attributes:true, attributeFilter:['class']});
    }
    return;
  }

  /* ============================ DESKTOP: transform pager ============================ */
  const track = document.getElementById('hpTrack'), cue = document.getElementById('hCue'), logo = document.getElementById('logo');
  const MOVE = 900;                                        // matches the .85s track transition (site.css)
  let idx = 0, n = 1, entered = false, blown = false, busy = false, aboutEl = null, pending = null;
  const onHome = () => body.dataset.page === 'home';

  track.innerHTML = '<section class="hs hs-cover" data-key="cover" aria-label="Cover"></section>';   // the cover is the canvas + #logo behind
  const ready = GKcontent.homeSections().then(({sections, about})=>{
    track.insertAdjacentHTML('beforeend', sections.map(s=>sectionHTML(s,'')).join('')+
      '<section class="hs hs-about" data-key="about" aria-label="About"><div class="hs-about-in"><h2 class="hsh">About</h2><div class="mabout-body"></div></div></section>');
    aboutEl = track.lastElementChild; aboutHead(aboutEl.querySelector('.hsh'), about);
    GKcontent.renderAbout(aboutEl.querySelector('.mabout-body'), {inline:true});
    [...track.children].forEach((s,i)=>{ s.style.top = (i*100)+'%'; });
    keys = ['cover', ...sections.map(s=>s.key), 'about']; names = ['Cover', ...sections.map(s=>s.name), (about&&about.title)||'About'];
    n = keys.length; buildDots(); paintDots(idx);
    if(pending){ const k = pending; pending = null; api.resume(k); }
  });

  // move the track (and the logo with it); `instant` skips the easing
  function setIdx(i, instant, keepScroll){
    idx = i;
    const els = [track, logo];
    if(instant || reduce) els.forEach(el=>{ el.style.transition = 'none'; });
    track.style.transform = 'translateY('+(-i*100)+'%)';
    logo.style.transform = 'translate(-50%, calc(-50% - '+(i*100)+'vh))';
    if(instant || reduce){ track.offsetHeight; els.forEach(el=>{ el.style.transition = ''; }); }
    body.classList.toggle('hp-in', i>0);                   // off the cover → leaf cursor, cue hidden
    paintDots(i); ss.set(SEC, keys[i]);
    if(i===n-1 && aboutEl && !keepScroll) aboutEl.scrollTop = 0;
    if(i===0 && blown && onHome()) GK.home();              // back on the cover: calm return state, never the landing
    busy = true;
    setTimeout(()=>{ busy = false;                         // off the cover: quiet white-leaf field once the move has landed
      if(idx>0 && blown && onHome() && GK.mode!=='paper') GK.paper(); }, (instant||reduce) ? 60 : MOVE);
  }
  function go(i){
    if(!entered || busy || !onHome()) return;
    i = Math.max(0, Math.min(n-1, i)); if(i===idx) return;
    if(idx===0 && !blown){                                 // first move off the cover: blow the leaves away, then go
      busy = true;
      if(reduce){ blown = true; busy = false; GK.paper(); setIdx(i, true); return; }
      GK.blowAway(); setTimeout(()=>{ blown = true; busy = false; setIdx(i); }, 620);
      return;
    }
    setIdx(i);
  }
  const next = () => go(idx+1), prev = () => go(idx-1);

  /* wheel: one gesture = one section (logic from the approved prototype). A gesture is "fresh" after a
     pause, or when the delta jumps up (a new swipe starting while the old one's momentum is still
     decaying). Momentum alone never re-triggers. About reads natively; a gesture that scrolled it is used up. */
  let lastT = 0, lastAbs = 0, consumed = false;
  addEventListener('wheel', e=>{
    if(!onHome()) return;
    const now = performance.now(), abs = Math.abs(e.deltaY), gap = now-lastT;
    const fresh = gap>220 || (abs>14 && abs>lastAbs*1.8+4);
    lastT = now; lastAbs = abs; if(fresh) consumed = false;
    if(idx===n-1 && aboutEl && (aboutEl.scrollTop>1 || e.deltaY>0)){ consumed = true; return; }   // About scrolls natively
    e.preventDefault();
    if(consumed || busy || abs<3 || !entered) return;
    consumed = true; e.deltaY>0 ? next() : prev();
  }, {passive:false});

  addEventListener('keydown', e=>{
    if(!onHome() || !entered || e.metaKey || e.ctrlKey || e.altKey) return;
    if(idx===n-1 && aboutEl && !((e.key==='ArrowUp'||e.key==='PageUp') && aboutEl.scrollTop<=1)) return;   // About: keys scroll it
    if(e.key===' ' && e.target.closest && e.target.closest('a,button')) return;                              // Space still activates a focused control
    if(['ArrowDown','PageDown',' '].includes(e.key)){ e.preventDefault(); next(); }
    if(['ArrowUp','PageUp'].includes(e.key)){ e.preventDefault(); prev(); }
  });
  dots.addEventListener('click', e=>{ const b = e.target.closest('button'); if(b) go(+b.dataset.i); });
  cue.addEventListener('click', next);

  const api = window.GKhome = {
    index: () => idx,
    key: () => keys[idx],
    // the landing was clicked (index.html activate): dots + cue appear, the pager unlocks
    entered(){ entered = true; body.classList.add('hp-entered'); paintDots(idx); },
    // nav.js toHome(): back on the home from an inner page → the section the visitor left (or `key`, e.g. 'about')
    resume(key){
      entered = true; blown = true; body.classList.add('hp-entered');
      if(key && keys.indexOf(key)<0){ pending = key; }
      const i = key && keys.indexOf(key)>=0 ? keys.indexOf(key) : idx;
      setIdx(i, true, !key);
      if(i>0) GK.paper();
    }
  };
})();
