/* ============================================================
   MOMO GINGKO — shell controller
   Router + frame geometry + chrome + transition sequencing.
   Runs only inside the shell (index.html). "Pages" are fetched
   as fragments (main.view-root + data-*) and mounted in #mount,
   so the whole site is ONE runtime document: the leaf-canvas
   background, the border frame and fullscreen all persist.
   ============================================================ */
(function(){
  window.__SHELL__ = true;
  const root   = document.documentElement;
  const bodyEl = document.body;
  const mount  = document.getElementById('mount');
  const title  = document.getElementById('pageTitle');
  const side   = document.getElementById('sideMenu');
  const ret    = document.getElementById('returnBtn');
  const foot   = document.getElementById('footer');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait   = ms => new Promise(r=>setTimeout(r, reduce?0:ms));
  const FILE   = location.protocol==='file:';   // fetch + pushState don't work on file://

  function showFileNotice(){
    if(document.getElementById('fileNotice')) return;
    const n=document.createElement('div'); n.id='fileNotice';
    n.style.cssText='position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:200;'+
      'max-width:min(560px,88vw);background:#332C25;color:#FAF4EA;font-family:ui-monospace,monospace;'+
      'font-size:12px;line-height:1.55;letter-spacing:.02em;padding:14px 18px;border-radius:6px;'+
      'box-shadow:0 12px 40px -12px rgba(0,0,0,.6);text-align:center;';
    n.innerHTML='This site must be opened over <b>http://</b>, not as a file. In the project '+
      'folder run <b>python3&nbsp;-m&nbsp;http.server</b> and open <b>http://localhost:8000</b>. '+
      '(Navigation is disabled on file:// to prevent a reload loop.)';
    document.body.appendChild(n);
  }

  const copyright = document.getElementById('copyright');
  // border footer = Home · About. "About" is the home's last section (index.html#about → GKhome.resume('about')).
  const FOOTER = `<a href="index.html">Home</a>`+
                 `<a href="index.html#about">About</a>`;

  let busy=false, currentFile='index.html', currentUrl='index.html', galleryOrigin='production-design.html';

  // ---------- frame geometry ----------
  // menu/about: content box 3:2, top/bottom border ≤5% of H.
  // project:    content box 5:4, top/bottom border ≤8% of H.
  const isMob = ()=>root.classList.contains('mob');
  function frameFor(page){
    const W=innerWidth, H=innerHeight;
    if(page==='home' || page==='gallery') return {bt:0, bs:0};
    const cfg = page==='project' ? {ratio:5/4, tp:0.08} : {ratio:3/2, tp:0.05};
    let t=cfg.tp*H, Hc=H-2*t, Wc=cfg.ratio*Hc, s=(W-Wc)/2;
    if(s<0){ s=0; Wc=W; Hc=Wc/cfg.ratio; t=Math.max(0,(H-Hc)/2); }
    return {bt:t, bs:s};
  }
  function applyFrame(page){
    const f=frameFor(page);
    root.style.setProperty('--bt', f.bt+'px');
    root.style.setProperty('--bs', f.bs+'px');
  }
  function closeFrame(){                                   // full-black closed frame
    root.style.setProperty('--bt', (innerHeight/2)+'px');
    root.style.setProperty('--bs', (innerWidth/2)+'px');
  }
  window.GKframe = ()=>applyFrame(bodyEl.dataset.page);

  // ---------- routing helpers ----------
  function sameOrigin(a){ try{ return new URL(a.href).origin===location.origin; }catch(e){ return false; } }
  function isRoutable(a){
    if(!a) return false;
    const raw=a.getAttribute('href');
    if(!raw || raw.startsWith('#') || raw.startsWith('javascript:') ||
       raw.startsWith('mailto:') || raw.startsWith('tel:')) return false;
    if(a.target && a.target!=='' && a.target!=='_self') return false;
    if(a.hasAttribute('download')) return false;
    return sameOrigin(a);
  }
  const fileOf = url => (new URL(url, location.href).pathname.split('/').pop() || 'index.html');

  // ---------- chrome ----------
  function runScripts(container){
    [...container.querySelectorAll('script')].forEach(old=>{
      const s=document.createElement('script');
      [...old.attributes].forEach(a=>s.setAttribute(a.name,a.value));
      s.textContent=old.textContent; old.replaceWith(s);
    });
  }
  function fadeTitle(){
    const t=Math.min(1, mount.scrollTop/230);
    if(title.classList.contains('img')){
      // TINT the mark toward paper (no opacity → leaves never show through the strokes)
      title.style.background=`color-mix(in srgb, var(--paper) ${Math.round(t*92)}%, var(--ink))`;
      title.style.opacity='';
    } else {
      title.style.color=`color-mix(in srgb, var(--grey) ${t*100}%, var(--ink))`;
      title.style.opacity=String(1-0.5*t);
    }
  }
  mount.addEventListener('scroll', fadeTitle, {passive:true});

  // Title PNGs are a fixed 5000×3000 canvas with the mark touching top/left/right and blank
  // space below. Scan the alpha to find the mark's bottom edge and set the title box's
  // aspect-ratio to just the mark — so 1-line and 2-line titles both sit tight, no big gap.
  function fitTitleImage(url){
    const im=new Image();
    im.onload=function(){
      try{
        const NW=im.naturalWidth, NH=im.naturalHeight;
        const sc=Math.min(1, 320/NW), cw=Math.max(1,(NW*sc)|0), ch=Math.max(1,(NH*sc)|0);
        const cv=document.createElement('canvas'); cv.width=cw; cv.height=ch;
        const cx=cv.getContext('2d'); cx.drawImage(im,0,0,cw,ch);
        const d=cx.getImageData(0,0,cw,ch).data;
        let maxY=-1;
        for(let py=ch-1;py>=0 && maxY<0;py--){ for(let px=0;px<cw;px++){ if(d[(py*cw+px)*4+3]>18){ maxY=py; break; } } }
        if(maxY<0) return;
        title.style.aspectRatio = NW + ' / ' + Math.max(1, Math.round(NH*(maxY+1)/ch));
        applyTitleOffset();
      }catch(e){}
    };
    im.src=url;
  }

  function setChrome(doc){
    const b=doc.body, page=b.dataset.page||'menu';
    if(window.GK && window.GK.rollCursor) window.GK.rollCursor();   // new random leaf cursor each page load
    const t=b.dataset.title||'', timg=b.dataset.titleImg||'';
    if(timg){                                   // hand-drawn PNG title (masked shape, tinted)
      title.classList.add('img'); title.hidden=false; title.textContent='';
      title.style.setProperty('--ti','url("'+timg+'")'); title.style.color='';
      title.style.aspectRatio='5/3';            // default until the alpha scan refines it
      title.setAttribute('aria-label', t);
      fitTitleImage(timg);
    } else {
      title.classList.remove('img'); title.style.removeProperty('--ti'); title.style.background='';
      title.style.aspectRatio=''; title.textContent=t; title.hidden=!t; title.removeAttribute('aria-label');
    }
    mount.scrollTop=0; fadeTitle();
    // a project's return button goes back to where it was opened from (a home section or the list)
    const origin = page==='project' ? window.GKorigin : null;   // project.html and film-stills.html (both data-page="project")
    ret.setAttribute('href', origin || b.dataset.parent || 'index.html');
    ret.textContent = origin ? '← back' : (b.dataset.back || '← back');
    ret.hidden = (page==='home'||page==='gallery');
    foot.innerHTML = FOOTER;
    // relocate the fragment's sub-nav / filters into the fixed right rail
    side.innerHTML='';
    const sm=mount.querySelector('.submenu,.filters');
    if(sm){ side.appendChild(sm); side.hidden=false; } else { side.hidden=true; }
  }
  // offset content below the fixed title. For tile galleries, drop the top rim to ~55% up
  // from the bottom so it clears the big title; text pages sit just under the title.
  // Called AFTER applyFrame so #mount already has its final height.
  function applyTitleOffset(){
    const vr=mount.querySelector('.view-root'); if(!vr) return;
    const hasImg=title.classList.contains('img');
    const noTitle = title.hidden || (!title.textContent && !hasImg);
    if(noTitle){ vr.style.paddingTop=''; return; }
    // content starts at the 55% line (title shrank) — tighter gap, but never under the title
    const base = hasImg ? title.offsetHeight*0.82 : title.offsetHeight+24;
    vr.style.paddingTop = Math.max(base, mount.clientHeight*0.55) + 'px';
  }

  async function mountFragment(url){
    const res=await fetch(url,{credentials:'same-origin'});
    if(!res.ok) throw new Error('fetch '+res.status);
    const doc=new DOMParser().parseFromString(await res.text(),'text/html');
    const view=doc.querySelector('.view-root');
    mount.innerHTML='';
    if(view) mount.appendChild(document.adoptNode(view)); else mount.innerHTML=doc.body.innerHTML;
    setChrome(doc);
    runScripts(mount);
    document.title = doc.title || '默默 GINGKO';
    return doc.body.dataset.page || 'menu';
  }

  // ---------- transitions (R7.5) ----------
  // EVERY page-to-page navigation is the same move: the current page fades to black (#blackout, leaf-printed,
  // ~250ms ease-in), the content is swapped underneath with nothing animating, and the new page fades in from black
  // (~350ms ease-out). Not covered: gallery next/prev paging (in place, below) and the home's own section
  // choreography (home.js). The old per-route sequences (leaf blow, border crop, paper curtain, tile fly-off) are gone.
  const black = document.getElementById('blackout');
  async function blackIn(){ black.classList.add('on'); await wait(260); }
  async function blackOut(){ black.classList.remove('on'); await wait(350); }
  // under the black the frame edges SNAP to the new page's geometry (their CSS transition is for window resizes)
  function snapFrame(page){ root.classList.add('frame-snap'); applyFrame(page); void mount.offsetHeight; setTimeout(()=>root.classList.remove('frame-snap'), 80); }
  function warpLogo(){ }   // stub: Momo's future 默默 → gingko warp (Procreate asset) starts from #logo
  function restoreHomeChrome(){
    const l=document.getElementById('logo'); if(l) l.style.transform='translate(-50%,-50%)';
  }

  // `key` = a home page to land on (e.g. 'about'); otherwise the page the visitor left.
  async function toHome(key){
    if(bodyEl.dataset.page!=='home') await blackIn();
    bodyEl.dataset.page='home'; ret.hidden=true;
    title.hidden=true; title.style.opacity=''; side.hidden=true; foot.style.opacity=''; copyright.style.opacity='';
    snapFrame('home');
    restoreHomeChrome();
    if(window.GKhome) window.GKhome.resume(key); else window.GK.home();   // canvas: cover → GK.home(), a page → GK.paper()
    mount.innerHTML=''; document.title='默默 GINGKO';
    await blackOut();
  }

  // (re-)render the gallery item from the URL via the content layer (real image + auto caption)
  async function renderGalleryItem(){
    const root=mount.querySelector('#galleryRoot');
    if(root && window.GKcontent) await GKcontent.renderGalleryItem(root);
  }
  // paging between gallery items: fade the media out, re-render the new one, fade it in
  async function pageGallery(url){
    const root=mount.querySelector('#galleryRoot'); if(!root) return go(url,true);
    const item=root.querySelector('.item'); if(item && item.classList.contains('paging')) return;
    if(item) item.classList.add('paging');
    try{ history.pushState({gk:1}, '', url); }catch(e){}
    await wait(300);
    await renderGalleryItem();
    currentFile='gallery-item.html';
    const m=root.querySelector('.item-media'); if(m){ m.style.opacity='0'; requestAnimationFrame(()=>{ m.style.opacity=''; }); }
  }

  async function toPage(file){
    const from=bodyEl.dataset.page;
    bodyEl.classList.add('entered');                // → switches on the leaf cursor
    if(file==='gallery-item.html' && from==='gallery'){   // popstate between items: in-place paging, no page transition
      const item=mount.querySelector('#galleryRoot .item');
      if(item) item.classList.add('paging');
      await wait(300); await renderGalleryItem();
      const m=mount.querySelector('.item-media'); if(m){ m.style.opacity='0'; requestAnimationFrame(()=>{ m.style.opacity=''; }); }
      return 'gallery';
    }
    await blackIn();
    const page = await mountFragment(file);         // fills mount + sets chrome, under the black
    if(page==='gallery'){
      galleryOrigin = currentUrl;                   // full URL (incl. ?slug=) so Close returns to the exact page
      title.hidden=true; side.hidden=true; foot.style.opacity='0'; copyright.style.opacity='0';
      window.GK.ink();                              // black-leaf field behind the image
    } else {
      window.GK.paper();
      foot.style.opacity=''; copyright.style.opacity='';
    }
    bodyEl.dataset.page=page;
    snapFrame(page);
    applyTitleOffset();                             // #mount has its final height now
    title.style.opacity=''; side.style.opacity=''; mount.classList.remove('leaving'); bodyEl.classList.remove('hp-leaving');
    if(window.GKcontent && GKcontent.relayout){ GKcontent.relayout(); setTimeout(()=>GKcontent.relayout(), 200); }   // C&I masonry packs against the framed width
    await blackOut();
    return page;
  }

  async function go(url, push){
    if(FILE){ showFileNotice(); return; }   // no fetch/pushState on file:// — bail (no reload loop)
    if(busy) return;
    if(window.GKcontent && GKcontent.projectUrl) url = await GKcontent.projectUrl(url);   // unpublished project → the list
    if(busy) return;
    const file=fileOf(url), from=bodyEl.dataset.page;
    // remember where a project was opened from, so its back links return there (R4.6). A deep link has no origin.
    if((file==='project.html' || file==='film-stills.html') && currentFile!=='project.html' && currentFile!=='film-stills.html' && currentFile!=='gallery-item.html')
      window.GKorigin = (from==='home' && currentFile==='index.html' && !window.GKhome.index()) ? null : (currentFile==='index.html' ? 'index.html' : currentUrl);
    // gallery-item + project re-render from the query (slug / i&n) → don't short-circuit same-file nav
    if(file===currentFile && from!=='home' && file!=='gallery-item.html' && file!=='project.html') return;
    busy=true;
    // update the URL up front so a fragment's inline script reads the right query
    // (e.g. gallery-item i/n) — mounting happens after this. Guarded because pushState
    // throws on origin-null documents (file:// — the site must be served over http).
    if(push){ try{ history.pushState({gk:1}, '', file==='index.html'?'index.html':url); }catch(e){} }
    try{
      if(file==='index.html' || file===''){ await toHome(/#about$/i.test(url) ? 'about' : null); }
      else { await toPage(file); }
      currentFile=file; currentUrl=url;
    }catch(e){ busy=false; if(!FILE) location.href=url; return; }
    busy=false;
  }

  // ---------- events ----------
  // Mobile is a different architecture: the swipe home (index.html) + standalone subpages that
  // navigate for real. The SPA shell/router below is DESKTOP-ONLY.
  if(isMob()) return;

  document.addEventListener('click', function(e){
    if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return;
    const close=e.target.closest('.gk-close');
    if(close){ e.preventDefault(); go(galleryOrigin, true); return; }
    const a=e.target.closest('a');
    if(!isRoutable(a)) return;
    e.preventDefault();
    // gallery next/prev: flash the arrow pink, then page in place (only image + caption fade)
    if(bodyEl.dataset.page==='gallery' && (a.classList.contains('item-next')||a.classList.contains('item-prev'))){
      a.classList.add('flash'); setTimeout(()=>a.classList.remove('flash'), 60);
      pageGallery(a.href); return;
    }
    go(a.href, true);
  });
  document.addEventListener('keydown', function(e){
    if(bodyEl.dataset.page!=='gallery') return;
    if(e.key==='ArrowRight'){ const n=mount.querySelector('.item-next'); if(n) n.click(); }
    else if(e.key==='ArrowLeft'){ const p=mount.querySelector('.item-prev'); if(p) p.click(); }
    else if(e.key==='Escape'){ go(galleryOrigin, true); }
  });
  // random "knock" (offset + rotate) each time the cursor enters a tile
  document.addEventListener('mouseover', function(e){
    const t=e.target.closest && e.target.closest('.tile');
    if(!t || (e.relatedTarget && t.contains(e.relatedTarget))) return;
    t.style.setProperty('--kx', ((Math.random()-0.5)*20).toFixed(1)+'px');
    t.style.setProperty('--ky', ((Math.random()-0.5)*16 - 3).toFixed(1)+'px');
    t.style.setProperty('--kr', ((Math.random()-0.5)*8).toFixed(1)+'deg');
  });
  window.addEventListener('popstate', ()=>{ go(location.href, false); });
  window.addEventListener('resize', ()=>{ applyFrame(bodyEl.dataset.page); applyTitleOffset(); });

  // ---------- boot ----------
  ret.hidden=true; side.hidden=true; title.hidden=true;
  applyFrame('home');
  if(FILE){ showFileNotice(); }
  else {
    // index.html?view=<file>&<rest> → go('<file>?<rest>') so ?slug= / ?sec= / ?i= survive the redirect
    const q=new URLSearchParams(location.search), deep=q.get('view');
    if(deep){ q.delete('view'); const rest=q.toString();
      history.replaceState({gk:1},'', 'index.html'); go(deep + (rest?'?'+rest:''), true); }
  }
})();
