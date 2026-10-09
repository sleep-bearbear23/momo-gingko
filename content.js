/* ============================================================
   MOMO GINGKO — content layer
   Fetches the JSON in /content and renders it into the pages, so
   adding work never means touching HTML. Works in BOTH the desktop
   shell (mounted fragment) and a standalone mobile subpage.
   Loaded by index.html (shell) and by each data-driven fragment's
   <head> (standalone). Exposes window.GKcontent.
   ============================================================ */
(function(){
  const cache = {};
  function load(path){ if(!cache[path]) cache[path]=fetch(path,{credentials:'same-origin'}).then(r=>r.json()); return cache[path]; }
  const esc = s => String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  // one image cell: a real <img> once filled, otherwise the labelled gingko placeholder.
  // `small` → prefer the thumbnail (grids/cards); full `src` is used for hero + the gallery viewer.
  function cell(o, small){
    if(!o || !o.src) return '<span class="ph" data-object="'+esc(o&&o.label||'')+'"></span>';
    const disp=o.src, thumb=o.thumb||o.src;
    // `pos` = non-destructive focal crop (object-position) set in the studio, e.g. "38% 24%".
    const style = o.pos ? ' style="object-position:'+esc(o.pos)+'"' : '';
    // grids/cards use `small`: serve a srcset so retina + large tiles get the 1800px display, not the soft 640px thumb.
    if(small && o.thumb){
      return '<img src="'+esc(thumb)+'" srcset="'+esc(thumb)+' 640w, '+esc(disp)+' 1800w" '+
        'sizes="(max-width:820px) 48vw, 680px" alt="'+esc(o.alt||o.label||'')+'" loading="lazy"'+style+'>';
    }
    return '<img src="'+esc(small?thumb:disp)+'" alt="'+esc(o.alt||o.label||'')+'" loading="lazy"'+style+'>';
  }
  // newest-first by year then month (both strings like "2025" / "02")
  const byYM = (a,b) => String(b.year||'').localeCompare(String(a.year||'')) || String(b.month||'').localeCompare(String(a.month||''));
  // featured projects first (1, 2, 3…), then everything else by byYM
  const isFeat = p => Number.isFinite(p.featured) && p.featured > 0;
  const byFeatured = (a,b) => (isFeat(b)-isFeat(a)) || (isFeat(a) ? a.featured-b.featured : byYM(a,b));
  // `published:false` projects stay in the data (and in the Filmography, unlinked) but have no page, card or link.
  const isPub = p => !!p && p.published !== false;
  const isMobile = () => document.documentElement.classList.contains('mob');
  // project-page image: never cropped, width/height from `aspect` (no layout shift), thumb + display srcset.
  function pimg(o, opts){
    opts = opts||{};
    const a = String(o.aspect||'').split('/').map(Number), w = a[0]||0, h = a[1]||0;
    return '<img'+(opts.cls?' class="'+opts.cls+'"':'')+' src="'+esc(o.src)+'"'+
      (o.thumb?' srcset="'+esc(o.thumb)+' 640w, '+esc(o.src)+' 1800w" sizes="(max-width:820px) 100vw, 760px"':'')+
      (w&&h?' width="'+w+'" height="'+h+'"':'')+' alt="'+esc(o.alt||'')+'"'+
      (opts.eager?' fetchpriority="high"':' loading="lazy"')+' decoding="async"'+
      (opts.pos&&o.pos?' style="object-position:'+esc(o.pos)+'"':'')+'>';
  }
  const isPortrait = o => { const a = String(o.aspect||'').split('/').map(Number); return a[1] > a[0]; };
  // credit ordering: Artist (music video — top) → Director → Producer → Art department (Production Designer
  // above Art Director) → Costume (below the art dept) → everyone else. Stable within a rank (keeps entered order).
  const CREDIT_RANK = r => { const s=String(r||'').toLowerCase().trim();
    if(/\bartist\b/.test(s)) return -10;                       // Artist — above all (MV)
    if(/director/.test(s) && !/art director/.test(s) && !/assistant director/.test(s)) return 0;  // Director / Writer-Director (top)
    if(/producer/.test(s)) return 10;                          // Producer / Executive Producer
    if(/costume|wardrobe/.test(s)) return 30;                  // Costume — sits below the art department
    if(/production design/.test(s)) return 20;                 // art dept: Production Designer first
    if(/art direct/.test(s)) return 21;                        // then Art Director
    if(/set dec|set dress/.test(s)) return 22;                 // Set Decoration
    if(/prop|scenic|graphic|set design|construction/.test(s)) return 23;
    return 40; };                                              // everyone else
  const orderCredits = list => (list||[]).map((c,i)=>({c,i})).sort((a,b)=>CREDIT_RANK(a.c.role)-CREDIT_RANK(b.c.role)||a.i-b.i).map(x=>x.c);
  const SECTION_LABEL = { 'film-stills':'Film Stills', 'prop-design':'Prop Design', 'elevations-previs':'Elevations & Previs',
    'poster':'Poster', 'social-marketing':'Social Marketing', 'graphic-design':'Prop Graphic Design',
    'illustration':'Illustration', 'costume':'Costume' };
  const SECTION_LAYOUT = { 'film-stills':'g2', 'prop-design':'g3', 'elevations-previs':'g2',
    'poster':'g2', 'social-marketing':'g3', 'graphic-design':'g2', 'illustration':'g3', 'costume':'g3' };
  const tabLayout = title => /film\s*still/i.test(title) ? 'g2' : 'g3';

  const GKcontent = {
    load,
    // where a project link should really go: project.html?slug=<unpublished|unknown> → the list.
    // nav.js go() calls this before mounting, so the shell never shows an unpublished page.
    async projectUrl(url){
      try{
        const u = new URL(url, location.href);
        if(!/(^|\/)project\.html$/.test(u.pathname)) return url;
        const d = await load('content/projects.json'), slug = u.searchParams.get('slug');
        return isPub((d.projects||[]).find(x=>x.slug===slug)) ? url : 'production-design.html';
      }catch(e){ return url; }
    },
    // mobile home only: fill each menu-page card's thumbnail from pages.json (desktop ignores this).
    async fillMenuThumbs(){
      let pages; try{ pages = await load('content/pages.json'); }catch(e){ return; }
      document.querySelectorAll('[data-page-thumb]').forEach(el=>{
        const t = (pages[el.getAttribute('data-page-thumb')]||{}).mobileThumb;
        const s = t && (t.thumb || t.src);
        if(s) el.innerHTML = '<img src="'+esc(s)+'" alt=""'+(t.pos?' style="object-position:'+esc(t.pos)+'"':'')+'>';
      });
    },
    // Production Design → the project list: featured first (by `featured`), then the rest newest-first
    async renderProjectCards(el){
      if(!el) return;
      const d = await load('content/projects.json');
      el.innerHTML = (d.projects||[]).filter(isPub).sort(byFeatured).map(p =>
        '<a class="tile card" href="project.html?slug='+esc(p.slug)+'">'+
          cell(p.cover, true)+
          '<span class="tile-info"><b>'+esc(p.title)+'</b>'+
          (p.role?'<span class="ti-meta">'+esc(p.role)+'</span>':'')+
          '<span class="ti-meta">'+[p.format,p.year].filter(Boolean).map(esc).join(' · ')+'</span></span></a>'
      ).join('');
    },
    // a single project page
    async renderProject(el, slug){
      if(!el) return;
      const d = await load('content/projects.json');
      const p = (d.projects||[]).find(x=>x.slug===slug) || (d.projects||[]).filter(isPub)[0];
      if(!p){ el.innerHTML='<p class="logline">Project not found.</p>'; return; }
      // unpublished → no page. Standalone (mobile) replaces itself with the list; the desktop shell
      // never gets here (nav.js go() swaps the URL first via GKcontent.projectUrl).
      if(!isPub(p)){ if(!window.__SHELL__) location.replace('production-design.html'); return; }
      document.title = p.title + ' — 默默 GINGKO';
      if((p.topics||[]).some(t=>t.blocks)){ renderProjectBlocks(el, p); return; }
      const hero = p.hero||[], n = hero.length;
      const strip = hero.length ? '<div class="proj-strip" data-strip><div class="ps-track">'+
        hero.map((h,i)=>'<a class="ps-img" style="aspect-ratio:'+esc(h.aspect||'4/3')+'" href="gallery-item.html?work='+esc(p.slug)+'&set=hero&i='+(i+1)+'&n='+n+'">'+cell(h)+'</a>').join('')+
        '</div><button class="ps-arrow ps-prev" aria-label="Previous images">‹</button><button class="ps-arrow ps-next" aria-label="Next images">›</button></div>' : '';
      const info = '<div class="proj-info">'+
        ['format','year','productionCo'].map(k=>p[k]?'<span>'+esc(p[k])+'</span>':'').join('')+
        (p.role?'<span>Role — '+esc(p.role)+'</span>':'')+'</div>';
      const awards = (p.awards&&p.awards.length) ? '<div class="stamps" aria-label="Awards">'+
        p.awards.map(a=>'<span class="stamp">'+esc(a.name)+(a.note?'<br>'+esc(a.note):'')+'</span>').join('')+'</div>' : '';
      const links = (p.links&&p.links.length) ? '<div class="social">'+
        p.links.map(l=>'<a href="'+esc(l.url||'#')+'">'+esc(l.label)+'</a>').join('')+'</div>' : '';
      const diary = (p.diary&&p.diary.length) ? '<section class="diary"><h2 class="block-h">Production Diary</h2>'+
        p.diary.map(t=>'<p>'+esc(t)+'</p>').join('')+'</section>' : '';
      const credits = (p.credits&&p.credits.length) ? '<section class="creditlist"><h2 class="block-h">Credits</h2><dl>'+
        orderCredits(p.credits).map(c=>'<dt>'+esc(c.role)+'</dt><dd>'+esc(c.name)+'</dd>').join('')+'</dl></section>' : '';
      const tabs = (p.tabs&&p.tabs.length) ? '<section class="tabs">'+
        p.tabs.map((t,ti)=>'<details class="tab"'+(ti===0?' open':'')+'><summary>'+esc(t.title)+'</summary><div class="tab-body"><div class="gallery g2">'+
          (t.items||[]).map((im,ii)=>{
            const isPage=!!im.page;   // web-page asset → still opens the gallery viewer (split layout there)
            const href='gallery-item.html?work='+esc(p.slug)+'&set='+ti+'&i='+(ii+1)+'&n='+(t.items.length);
            const info=im.caption?'<span class="tile-info"><b>'+esc(im.caption)+'</b></span>':'';
            return '<a class="tile'+(isPage?' tile-web':'')+'" style="--ar:'+esc(im.aspect||'4/5')+'" href="'+href+'">'+cell(im,true)+info+'</a>';
          }).join('')+
          '</div></div></details>').join('')+'</section>' : '';
      // "Check out next" — 3 random OTHER projects, freshly shuffled each render, stacked one per row
      const others = (d.projects||[]).filter(x=>x.slug!==p.slug && isPub(x));
      for(let i=others.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [others[i],others[j]]=[others[j],others[i]]; }
      const recs = others.slice(0,3);
      const recHtml = recs.length ? '<section class="recommend"><h2 class="block-h">Check out next</h2><div class="rec-list">'+
        recs.map(r=>'<a class="rec" href="project.html?slug='+esc(r.slug)+'">'+cell(r.cover,true)+
          '<span class="rec-info"><b>'+esc(r.title)+'</b><span class="rec-meta">'+esc(r.type||'')+(r.year?' · '+esc(r.year):'')+'</span></span></a>').join('')+
        '</div></section>' : '';
      el.innerHTML = strip + '<article class="proj"><h1 class="proj-title">'+esc(p.title)+'</h1>'+
        info + (p.logline?'<p class="logline">'+esc(p.logline)+'</p>':'') + awards + links + diary + credits + tabs + recHtml + '</article>';
      initStrip();
      initTabs(el);
    },
    // a PD sub-menu gallery (film-stills / prop-design / elevations-previs), curated in sections.json,
    // sorted newest-first by year+month. Tiles open the section in the viewer.
    async renderSection(el, key){
      if(!el) return;
      const [s, pd] = await Promise.all([load('content/sections.json'), load('content/projects.json')]);
      const titleOf = {}; (pd.projects||[]).forEach(p => titleOf[p.slug]=p.title);
      const items = (s[key]||[]).slice().sort(byYM);
      el.className = 'gallery ' + (SECTION_LAYOUT[key]||'g3') + ' sec-' + key;   // sec-<key> lets CSS target one gallery
      const n = items.length;
      el.innerHTML = n ? items.map((it,i)=>{
        const proj = it.project ? (titleOf[it.project]||'') : (it.projectName||'');   // standalone asset → text name
        const title = it.caption || proj;
        const meta = [ (it.caption && proj) ? proj : '', it.year ].filter(Boolean).join(' · ');
        const info = (title?'<b>'+esc(title)+'</b>':'') + (meta?'<span class="ti-meta">'+esc(meta)+'</span>':'');
        // an HTML-page prop still opens the gallery viewer (which shows a split image + description + live link)
        const isPage = !!it.page;
        const href = 'gallery-item.html?section='+esc(key)+'&i='+(i+1)+'&n='+n;
        return '<a class="tile'+(isPage?' tile-web':'')+'" style="--ar:'+esc(it.aspect||'16/9')+'" href="'+href+'">'+
          cell(it, true)+'<span class="tile-info">'+info+'</span></a>';
      }).join('') : '<p class="logline" style="opacity:.6">Nothing here yet.</p>';
    },
    // Concept & Illustration gallery: tagged items, shuffled fresh each load — but images sharing a `group`
    // stay contiguous (a group is shuffled as one block, so grouped pieces never get split apart).
    async renderCI(el){
      if(!el) return;
      const s = await load('content/sections.json');
      const items = (s['ci']||[]).slice();
      items.forEach((it,idx)=>it._i=idx+1);          // stable file index → the viewer (?section=ci&i=) pages in file order
      const groups={}, units=[];
      items.forEach(it=>{ if(it.group){ (groups[it.group]=groups[it.group]||[]).push(it); } else units.push([it]); });
      Object.values(groups).forEach(g=>units.push(g));   // each group becomes one block
      for(let i=units.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [units[i],units[j]]=[units[j],units[i]]; }
      const ordered = units.flat(), n = items.length;
      el.className='masonry';   // JS masonry: natural aspect, landscape works span 2–3 columns
      el.innerHTML = n ? ordered.map(it=>{
        const info = it.caption?'<b>'+esc(it.caption)+'</b>':'';
        return '<a class="tile" data-tags="'+esc((it.tags||[]).join(' '))+'" data-aspect="'+esc(it.aspect||'1/1')+'" href="gallery-item.html?section=ci&i='+it._i+'&n='+n+'">'+
          cell(it,true)+'<span class="tile-info">'+info+'</span></a>';
      }).join('') : '<p class="logline" style="opacity:.6">Nothing here yet.</p>';
      requestAnimationFrame(()=>this.layoutCI(el));
      // Re-pack whenever the container's WIDTH changes — catches the frame animating in on
      // return from a gallery-item (a plain window-resize listener misses the mount reflow,
      // so the masonry stayed laid out for the borderless width and "broke" on return).
      if(!el._ciRO && window.ResizeObserver){
        el._ciRO=new ResizeObserver(()=>{ const w=Math.round(el.clientWidth); if(!w||w===el._ciW)return; el._ciW=w; clearTimeout(el._ciT); el._ciT=setTimeout(()=>this.layoutCI(el),80); });
        el._ciRO.observe(el);
      } else if(!el._ciResize){ el._ciResize=true; window.addEventListener('resize', ()=>{ clearTimeout(el._ciT); el._ciT=setTimeout(()=>this.layoutCI(el),120); }); }
    },
    // Deterministic re-pack of any masonry grid on the page — nav.js calls this once a page
    // transition has settled (the mount is at its final framed width), so the C&I grid is
    // always laid out for the RIGHT width even if the rAF/ResizeObserver timing was missed.
    relayout(){ document.querySelectorAll('.masonry').forEach(el=>{ if(el.querySelector('.tile')) this.layoutCI(el); }); },
    // C&I layout: fixed-height rows (4:5 portrait height). Three row modes:
    //   • portraits — N per row;  • landscape+portrait — landscape spans 2 cols (alternating side) + portraits;
    //   • two-up — TWO landscapes side by side, each half-width (used when there aren't enough portraits to pair).
    // A counter over this load's portrait/landscape totals decides how many landscapes pair vs go two-up, so a
    // run of all-landscape images doesn't collapse into an entirely two-up gallery.
    layoutCI(el){
      if(!el) return;
      const gap=7, target=240;
      const W=el.clientWidth; if(!W){ requestAnimationFrame(()=>this.layoutCI(el)); return; }
      const N=Math.max(1, Math.floor((W+gap)/(target+gap)));
      const colW=(W-(N-1)*gap)/N, rowH=colW*1.25;
      const set=(t,x,y,w,h)=>{ t.style.cssText='position:absolute;box-sizing:border-box;margin:0;left:'+x+'px;top:'+y+'px;width:'+w+'px;height:'+h+'px;'; };
      const q=[...el.querySelectorAll('.tile')].filter(t=>!t.hidden).map(t=>{
        const a=(t.getAttribute('data-aspect')||'1/1').split('/').map(Number);
        return { t, land:((a[0]/a[1])>=1.5 && N>=2) };
      });
      const P=q.filter(x=>!x.land).length, L=q.filter(x=>x.land).length, per=Math.max(0,N-2);
      const paired = per>0 ? Math.min(L, Math.floor(P/per)) : 0;     // landscapes that pair with portraits; rest → two-up
      let seen=0; q.forEach(x=>{ if(x.land){ x.mode=(Math.floor((seen+1)*paired/Math.max(1,L))>Math.floor(seen*paired/Math.max(1,L)))?2:3; seen++; } });
      let land=0;   // alternates landscape side per mode-2 row
      const pull=p=>{ const j=q.findIndex(p); return j>=0? q.splice(j,1)[0] : null; };
      const mode2Row=L2=>{ const start=(land===0)?0:(N-2); land^=1; const row=new Array(N).fill(null);
        row[start]={t:L2.t,span:2}; if(start+1<N) row[start+1]={skip:1};
        for(let c=0;c<N;c++){ if(row[c])continue; const p=pull(x=>!x.land); row[c]=p?{t:p.t,span:1}:{skip:1}; } return {grid:row}; };
      const rows=[];
      while(q.length){
        let rP=0,rL2=0; for(const x of q){ if(!x.land)rP++; else if(x.mode===2)rL2++; }
        const head=q[0];
        if(head.land && head.mode===2){ q.shift(); rows.push(mode2Row(head)); }
        else if(head.land){ q.shift(); const b=pull(x=>x.land&&x.mode===3); rows.push({duo:[head.t, b?b.t:null]}); }
        else if(rL2>0 && (rP - rL2*per) < N){ const l2=pull(x=>x.land&&x.mode===2); rows.push(l2?mode2Row(l2):{grid:(()=>{const r=new Array(N).fill(null);r[0]={t:q.shift().t,span:1};return r;})()}); }
        else { const row=new Array(N).fill(null); for(let c=0;c<N;c++){ const p=pull(x=>!x.land); if(!p)break; row[c]={t:p.t,span:1}; } rows.push({grid:row}); }
      }
      const arOf=t=>{ const a=(t.getAttribute('data-aspect')||'1/1').split('/').map(Number); return (a[0]||1)/(a[1]||1); };
      let y=0;
      rows.forEach(r=>{
        let h=rowH;
        if(r.duo){ const halfW=(W-gap)/2;
          if(r.duo[1]){ h=halfW/((arOf(r.duo[0])+arOf(r.duo[1]))/2);   // two landscapes → natural height (avg ratio)
            set(r.duo[0],0,y,halfW,h); set(r.duo[1],halfW+gap,y,halfW,h); }
          else { h=W/arOf(r.duo[0]); set(r.duo[0],0,y,W,h); } }         // lone landscape → full-width natural
        else { for(let c=0;c<N;c++){ const cell=r.grid[c]; if(!cell||cell.skip||!cell.t)continue; const s=cell.span||1; set(cell.t, c*(colW+gap), y, s*colW+(s-1)*gap, rowH); } }
        y+=h+gap;
      });
      el.style.height=(y>gap? y-gap : rowH)+'px';
    },
    // Filmography: published projects (auto) + standalone entries, grouped by year (newest), ordered by month.
    // opts.collapse → only the most recent year shows, plus a "Show full filmography (N)" toggle (About page).
    async renderFilmography(el, opts){
      if(!el) return;
      const [p, f] = await Promise.all([load('content/projects.json'), load('content/filmography.json')]);
      const rows = [];
      // unpublished projects still list here, as plain unlinked rows
      (p.projects||[]).forEach(pr => rows.push({ title:pr.title, role:pr.role, year:pr.year, month:pr.month||'', slug:isPub(pr)?pr.slug:null }));
      (f.entries||[]).forEach(e => rows.push({ title:e.title, role:e.role, year:e.year, month:e.month||'', slug:null }));
      const years = {}; rows.forEach(r => (years[r.year||'—'] = years[r.year||'—'] || []).push(r));
      const order = Object.keys(years).sort((a,b)=> String(b).localeCompare(String(a)));
      const collapse = !!(opts && opts.collapse) && order.length > 1;
      el.innerHTML = order.map((y,gi) => {
        const list = years[y].sort((a,b)=> String(b.month||'').localeCompare(String(a.month||'')));
        return '<section class="filmo-grp'+(collapse && gi>0 ? ' filmo-x' : '')+'"><h3 class="filmo-yr">'+esc(y)+'</h3><ul>'+
          list.map(r => '<li>'+(r.slug ? '<a href="project.html?slug='+esc(r.slug)+'">'+esc(r.title)+'</a>' : esc(r.title))+
            '<span>'+esc(r.role||'')+'</span></li>').join('')+'</ul></section>';
      }).join('') + (collapse ? '<button class="filmo-toggle" type="button" aria-expanded="false">Show full filmography ('+rows.length+')</button>' : '');
      const btn = el.querySelector('.filmo-toggle');
      if(btn) btn.addEventListener('click', ()=>{
        const open = el.classList.toggle('open');
        btn.setAttribute('aria-expanded', open);
        btn.textContent = open ? 'Show less' : 'Show full filmography ('+rows.length+')';
      });
    },
    // About — content/about.json. Renders into about.html (desktop shell + mobile subpage) AND the inline
    // About section of the home page (opts.inline: desktop pager + mobile swipe; .mportrait / .mabout-body styling).
    // Empty fields are skipped: no positioning line, no contact link until filled. (Illustrations show on the home.)
    async renderAbout(el, opts){
      if(!el) return;
      const a = await load('content/about.json');
      const inline = !!(opts && opts.inline);
      const pic = a.portrait && a.portrait.src
        ? '<div class="'+(inline?'mportrait':'portrait')+'"><img src="'+esc(a.portrait.src)+'"'+
          (a.portrait.thumb?' srcset="'+esc(a.portrait.thumb)+' 506w, '+esc(a.portrait.src)+' 900w" sizes="'+(inline?'60vw':'(max-width:820px) 60vw, 30vw')+'"':'')+
          ' alt="'+esc(a.portrait.alt||'')+'"></div>' : '';
      const bio = '<div class="bio">'+(a.bio||[]).map((t,i)=>'<p'+(i?' class="lede"':'')+'>'+esc(t)+'</p>').join('')+'</div>';
      const pos = a.positioning ? '<p class="positioning">'+esc(a.positioning)+'</p>' : '';
      const c = a.contact||{};
      const links = [
        c.email ? '<a href="mailto:'+esc(c.email)+'">'+esc(c.email)+'</a>' : '',
        c.vimeo ? '<a href="'+esc(c.vimeo)+'" target="_blank" rel="noopener">Vimeo</a>' : '',
        c.resume ? '<a href="'+esc(c.resume)+'" target="_blank" rel="noopener">Résumé (PDF)</a>' : '',
        c.instagram ? '<a href="'+esc(c.instagram)+'" target="_blank" rel="noopener">Instagram</a>' : '',
        c.linkedin ? '<a href="'+esc(c.linkedin)+'" target="_blank" rel="noopener">LinkedIn</a>' : ''
      ].join('');
      const contact = links ? '<div class="about-block"><h2>Contact</h2><div class="contact">'+links+'</div></div>' : '';
      const filmo = '<div class="about-block"><h2>Filmography</h2><div class="filmo"></div></div>';
      el.innerHTML = inline
        ? pic + pos + bio + filmo + contact
        : '<div class="about"><div class="about-grid">'+pic+'<div class="about-text">'+pos+bio+'</div></div>'+filmo+contact+'</div>';
      await this.renderFilmography(el.querySelector('.filmo'), {collapse:true});
    },
    // Home page content for pages 2–4 (PDG rebuild R4 + R5), as { pages:[{key, name, html}], about, drawAR }.
    // The same markup serves desktop and phone; home.js owns the black-card pager and all behaviour.
    //   highlights   — on black: the two `featured` films (4:3 hero crop, title, role · year).
    //   pd           — paper between bars: teaser (heading, drawing, "All projects →") + a second pane with a
    //                  looping carousel of every published project (3 copies of the list; home.js lives in the middle one).
    //   illustration — on black: 6×5 grid (28 tiles + intro) on desktop, 2×5 (8 tiles) on the phone; every tile
    //                  → Instagram. Needs 8 illustrations in about.json; fewer → the page is skipped. Phone = 1–8;
    //                  desktop = 1–28, the rest cycle in (home.js). A GIF plays as its small `video` loop.
    async homeSections(){
      const [d, h, a] = await Promise.all([load('content/projects.json'), load('content/home.json').catch(()=>({})), load('content/about.json').catch(()=>({}))]);
      const head = (o, fallback, extra) => { o = o||{}; const t = o.title || fallback;
        return o.titleImg ? '<h2 class="hsh hsh-img"><img src="'+esc(o.titleImg)+'" alt="'+esc(t)+'"></h2>' : '<h2 class="hsh">'+esc(t)+(extra||'')+'</h2>'; };
      const img = (o, sizes, pos, alt) => '<img src="'+esc(o.thumb||o.src)+'"'+(o.thumb?' srcset="'+esc(o.thumb)+' 640w, '+esc(o.src)+' 1800w" sizes="'+sizes+'"':'')+
        ' alt="'+esc(alt==null?(o.alt||''):alt)+'" decoding="async"'+((pos&&o.pos)?' style="object-position:'+esc(o.pos)+'"':'')+'>';
      const meta = p => [p.role,p.year].filter(Boolean).map(esc).join(' · ');
      const pub = (d.projects||[]).filter(isPub).sort(byFeatured), pages = [];

      const films = pub.filter(isFeat).slice(0,2);
      if(films.length) pages.push({ key:'highlights', name:(h.highlights||{}).title||'Project Highlights', html:
        head(h.highlights,'Project Highlights')+'<div class="hfilms">'+films.map(p=>{
          const im = p.heroImage || p.cover || {};
          return '<a class="hfilm" href="project.html?slug='+esc(p.slug)+'"><span class="hph">'+(im.src?img(im,'(max-width:600px) 92vw, 40vw',true):'')+'</span>'+
            '<h3>'+esc(p.title)+'</h3><span class="hmono">'+meta(p)+'</span></a>';
        }).join('')+'</div>' });

      const pd = h.pdTeaser||{}, dr = pd.image||{};
      const ar = String(dr.aspect||'').split('/').map(Number);
      const card = (p, copy) => { const im = p.heroImage || p.cover || {};
        return '<a class="hpcard" href="project.html?slug='+esc(p.slug)+'"'+(copy!==1?' tabindex="-1" aria-hidden="true"':'')+'><span class="hph">'+(im.src?img(im,'(max-width:600px) 92vw, 62vw',true,''):'')+'</span>'+
          '<h3>'+esc(p.title)+'</h3><span class="hmono">'+meta(p)+'</span></a>'; };
      pages.push({ key:'pd', name:'Production Design', count:pub.length, html:
        '<div class="hpanes"><div class="hpane">'+
          '<a class="hteaser" href="production-design.html">'+head(pd,'See more of my production design work!')+
          (dr.src?img(dr,'(max-width:600px) 92vw, 62vw').replace('<img ','<img class="hdraw" '):'')+'<span class="hpill">All projects →</span></a></div>'+
        '<div class="hpane hallpane" aria-label="All projects">'+
          '<div class="hallhead">'+head({title:'All projects'},'All projects',' <span class="hmono hpcount">'+pub.length+'</span>')+'<button class="hback hmono" type="button">← Back</button></div>'+
          '<div class="hcarousel"><div class="hviewport"><div class="hstrip">'+[0,1,2].map(c=>pub.map(p=>card(p,c)).join('')).join('')+'</div></div>'+
          '<div class="hccount"><span><b class="hcnow">1</b> / '+pub.length+'</span><span>Swipe ‹ ›</span></div>'+
          '<button class="harr l" type="button" aria-label="Previous project">‹</button><button class="harr r" type="button" aria-label="Next project">›</button></div>'+
        '</div></div>' });

      // Tiles are rendered EMPTY; home.js fills them from `media` once the visitor heads down the page (30 thumbs are
      // ~2 MB — too much for the first load on weak data), and on desktop cycles the pictures beyond the 28th in.
      const illos = (a.illustrations||[]).filter(x=>x && x.src), ig = (a.illustrationMore||{}).url, il = h.illustration||{};
      if(illos.length >= 8 && ig){
        const rnd = (lo,hi) => lo + Math.random()*(hi-lo), pos = it => it.pos ? ' style="object-position:'+esc(it.pos)+'"' : '';
        const media = illos.map((it,i)=>({ label: (it.alt||'Illustration '+(i+1))+', opens Instagram', html: it.video
          ? '<video autoplay muted loop playsinline preload="metadata"'+(it.poster?' poster="'+esc(it.poster)+'"':'')+pos(it)+'>'+
            (it.video.webm?'<source src="'+esc(it.video.webm)+'" type="video/webm">':'')+(it.video.mp4?'<source src="'+esc(it.video.mp4)+'" type="video/mp4">':'')+'</video>'
          : '<img src="'+esc(it.thumb||it.src)+'" alt="" decoding="async"'+pos(it)+'>' }));
        const tiles = [];
        for(let i=0;i<28;i++) tiles.push('<a class="htile'+(i>=8?' dk':'')+'" data-m="'+(i % illos.length)+'" href="'+esc(ig)+'" target="_blank" rel="noopener" aria-label="'+esc(media[i % illos.length].label)+'"'+
          ' style="--d:'+(Math.random()*.45).toFixed(2)+'s;--ox:'+rnd(-18,18).toFixed(0)+'px;--oy:'+rnd(-18,18).toFixed(0)+'px"></a>');
        const handle = '@' + String(ig).replace(/\/+$/,'').split('/').pop();
        pages.push({ key:'illustration', name:il.title||'Illustration', media, html:
          '<div class="higrid">'+tiles.join('')+'<div class="hintro"><h2>'+esc(il.title||'Illustration')+'</h2>'+(il.intro?'<p>'+esc(il.intro)+'</p>':'')+
          '<a href="'+esc(ig)+'" target="_blank" rel="noopener">'+esc(handle)+' ↗</a></div></div>' });
      }
      return { pages, about: h.about||{}, drawAR: (ar[0]&&ar[1]) ? ar[0]/ar[1] : 1100/712 };
    },
    // the gallery viewer — reads ?work=&set=hero|<tabIndex>&i=&n=  OR  ?section=<key>&i=&n=.
    // Real image, pages the set; caption auto-derived; the project name LINKS to the project when published.
    async renderGalleryItem(el){
      if(!el) return;
      const q = new URLSearchParams(location.search);
      const work = q.get('work'), set = q.get('set'), section = q.get('section');
      let i = Math.max(1, parseInt(q.get('i'),10) || 1);
      const projData = await load('content/projects.json');
      let list = [], project = null, sub = '';
      if(section==='about-illustrations'){
        const a = await load('content/about.json');
        list = (a.illustrations||[]).filter(x=>x && x.src);
        sub = 'Illustration';
      } else if(section){
        const s = await load('content/sections.json');
        list = (s[section]||[]).slice().sort(byYM);
        sub = SECTION_LABEL[section] || '';
      } else if(work){
        project = (projData.projects||[]).find(x=>x.slug===work) || null;
        if(project){
          if(set==='hero'){ list = project.hero||[]; }
          else { const t = (project.tabs||[])[parseInt(set,10)]; if(t){ list = t.items||[]; sub = t.title; } }
        }
      }
      const n = list.length || Math.max(1, parseInt(q.get('n'),10) || 1);
      i = Math.min(i, n);
      const img = list[i-1] || null;
      // resolve the owning project (section items carry a `project` slug)
      const proj = project || (img && img.project ? (projData.projects||[]).find(x=>x.slug===img.project) : null);
      const pad = v => String(v).padStart(2,'0');
      const next = (i % n) + 1, prev = ((i-2+n) % n) + 1;
      const href = k => { const u = new URLSearchParams(location.search); u.set('i', k); u.set('n', n); return 'gallery-item.html?' + u.toString(); };
      const media = (img && img.src)
        ? '<img src="'+esc(img.src)+'" alt="'+esc(img.alt||img.caption||img.label||(proj&&proj.title)||'')+'">'
        : '<span class="ph" data-object="'+esc((img&&img.label)||'item')+'"></span>';
      // caption (catalog style): "<Project> (<year>). <category> - <label>."
      // per-image `caption` is a short scene/space label (e.g. "The Mirror Space"), NOT a description.
      const yr = (img && img.year) || (proj && proj.year);
      const projName = proj ? proj.title : ((img && img.projectName) || '');
      const projHtml = projName
        ? (isPub(proj) ? '<a class="cap-link" href="project.html?slug='+esc(proj.slug)+'">'+esc(projName)+'</a>' : esc(projName))
        : '';
      const head = projHtml ? (projHtml + (yr?' ('+esc(yr)+')':'')) : (yr?esc(yr):'');
      const label = (img && img.caption) ? esc(img.caption) : '';
      let detail = '';
      if(sub && label) detail = esc(sub) + ' - ' + label;
      else if(label)   detail = label;
      else if(sub)     detail = esc(sub);
      let caption;
      if(head && detail) caption = head + '. ' + detail + '.';
      else if(head)      caption = head + '.';
      else if(detail)    caption = detail + '.';
      else               caption = '&nbsp;';
      // web-page asset: show the screenshot left + a description and a live-page link right
      const isPage = !!(img && img.page);
      const pageText = isPage ? '<div class="item-text">'+
        (img.description ? '<p class="item-desc">'+esc(img.description).replace(/\n/g,'<br>')+'</p>' : '')+
        '<a class="item-pagelink" href="'+esc(img.page)+'" target="_blank" rel="noopener">View live page ↗</a></div>' : '';
      el.innerHTML =
        '<div class="item'+(isPage?' item-page':'')+'">'+
          '<div class="item-bar">'+
            '<a class="gk-close">‹ Back</a>'+
            '<span class="item-count"><span class="ic-i">'+pad(i)+'</span> / <span class="ic-n">'+pad(n)+'</span></span>'+
            '<a class="gk-close">Close ✕</a>'+
          '</div>'+
          '<div class="item-stage'+(isPage?' is-page':'')+'">'+
            '<a class="item-arrow item-prev" href="'+href(prev)+'" aria-label="Previous">‹</a>'+
            '<figure class="item-media" style="margin:0">'+media+'</figure>'+
            pageText+
            '<a class="item-arrow item-next" href="'+href(next)+'" aria-label="Next">›</a>'+
          '</div>'+
          '<div class="item-cap">'+caption+'</div>'+
        '</div>';
    }
  };

  // Project page (PDG rebuild R3.2): hero → header → topics (key · slugline · title · alternating text /
  // image-group blocks) → credits → back link. No viewer, no stage tags, no chips; images aren't links
  // (except the ORION `page` image on desktop — the live page breaks at a phone's aspect ratio).
  function renderProjectBlocks(el, p){
    const mob = isMobile();
    const hero = p.heroImage ? '<div class="pp-hero pp-bleed">'+pimg(p.heroImage,{eager:true,pos:true})+'</div>' : '';
    const meta = [p.role, p.format, p.year].filter(Boolean).map(x=>'<span>'+esc(x)+'</span>').join('');
    const head = '<header class="pp-head"><h1 class="proj-title">'+esc(p.title)+'</h1>'+
      (meta?'<div class="proj-info">'+meta+'</div>':'')+
      (p.logline?'<p class="logline">'+esc(p.logline)+'</p>':'')+
      (p.headerNote?'<p class="pp-note">'+esc(p.headerNote)+'</p>':'')+'</header>';
    const topics = (p.topics||[]).map(t=>{
      const inset = !!t.insetPortraits;
      const blocks = (t.blocks||[]).map(b=>{
        if(b.imgs) return '<figure class="pp-group pp-bleed">'+b.imgs.map(im=>{
            const tag = pimg(im, {cls: inset && isPortrait(im) ? 'pp-inset' : ''});
            return (im.page && !mob) ? '<a class="pp-live" href="'+esc(im.page)+'" target="_blank" rel="noopener">'+tag+'<span>View live page ↗</span></a>' : tag;
          }).join('')+(b.caption?'<figcaption>'+esc(b.caption)+'</figcaption>':'')+'</figure>';
        if(b.text) return '<p class="pp-text">'+(b.lead?'<strong>'+esc(b.lead)+'</strong> ':'')+esc(b.text)+'</p>';
        return '';
      }).join('');
      return '<section class="pp-topic" id="topic-'+esc(t.id)+'">'+
        (t.key?'<div class="pp-key pp-bleed">'+pimg(t.key)+'</div>':'')+
        '<div class="pp-thead">'+(t.slug?'<div class="pp-slug">'+esc(t.slug)+'</div>':'')+'<h2>'+esc(t.title)+'</h2></div>'+
        blocks+'</section>';
    }).join('');
    const credits = (p.credits&&p.credits.length) ? '<section class="creditlist"><h2 class="block-h">Credits</h2><dl>'+
      orderCredits(p.credits).map(c=>'<dt>'+esc(c.role)+'</dt><dd>'+esc(c.name)+'</dd>').join('')+'</dl></section>' : '';
    // "← Back" to wherever the visitor came from (a home section or the list); a direct visit falls back to the list.
    // Shell: nav.js records the origin in window.GKorigin. Mobile: the referrer, and the link is a real history.back().
    let back = { href:'production-design.html', text:'← Back to Production Design', hist:false };
    if(window.__SHELL__){ if(window.GKorigin) back = { href:window.GKorigin, text:'← Back', hist:false }; }
    else { try{ const r = document.referrer && new URL(document.referrer);
      if(r && r.origin===location.origin && /(\/|index\.html|production-design\.html)$/.test(r.pathname) && history.length>1) back = { href:r.pathname+r.search, text:'← Back', hist:true };
    }catch(e){} }
    el.innerHTML = '<article class="pp">'+hero+head+topics+credits+
      '<a class="pp-back" href="'+esc(back.href)+'">'+back.text+'</a></article>';
    if(back.hist) el.querySelector('.pp-back').addEventListener('click', e=>{ e.preventDefault(); history.back(); });
    // #topic-<id> anchors (cheap; nothing on the page links to them yet)
    const target = location.hash && el.querySelector(location.hash.replace(/[^#\w-]/g,''));
    if(target) target.scrollIntoView();
  }

  // desktop hero-strip paging (shell arrows #stripPrev/#stripNext). Mobile uses native CSS scroll → no-ops.
  function initStrip(){
    const strip = document.querySelector('.proj-strip[data-strip]'); if(!strip) return;
    const mount = document.getElementById('mount'); if(!mount) return;    // standalone/mobile → native scroll
    const track = strip.querySelector('.ps-track'); const imgs=[...track.querySelectorAll('.ps-img')];
    let pos=0;
    const gap = ()=>parseFloat(getComputedStyle(track).paddingLeft)||0;
    const maxPos = ()=>Math.max(0, track.scrollWidth - strip.clientWidth);
    const alignLeft = im=>im.offsetLeft - gap();
    const apply = ()=>{ pos=Math.max(0,Math.min(pos,maxPos())); track.style.transform='translateX('+(-pos)+'px)'; };
    const prev = strip.querySelector('.ps-prev'), next=strip.querySelector('.ps-next');   // arrows live inside the strip now
    function sizeImgs(){ strip.style.setProperty('--ps-h', Math.round(mount.clientHeight*0.4)+'px'); }
    if(next) next.onclick=()=>{ const mp=maxPos(); if(pos>=mp-1){ pos=0; } else { let target=null; for(const im of imgs){ const q=alignLeft(im); if(q>pos+1){ target=q; break; } } pos=(target!=null&&target<=mp)?target:mp; } apply(); };
    if(prev) prev.onclick=()=>{ if(pos<=0){ pos=maxPos(); } else { let t=0; for(const im of imgs){ const q=alignLeft(im); if(q<pos-1) t=q; else break; } pos=t; } apply(); };
    sizeImgs();
    if(window.__stripResize) removeEventListener('resize', window.__stripResize);
    window.__stripResize=()=>{ sizeImgs(); apply(); };
    addEventListener('resize', window.__stripResize);
  }

  // smooth expand/collapse for the project <details> tabs (native details jump-cut)
  function initTabs(root){
    (root||document).querySelectorAll('.tabs .tab').forEach(tab=>{
      const body=tab.querySelector('.tab-body'), summary=tab.querySelector('summary');
      if(!body||!summary||summary.dataset.anim) return; summary.dataset.anim='1';
      summary.addEventListener('click', e=>{
        e.preventDefault();
        if(tab.dataset.animating) return; tab.dataset.animating='1';
        const done=()=>{ body.style.height=''; delete tab.dataset.animating; };
        if(tab.open){
          body.style.height=body.scrollHeight+'px'; body.offsetHeight;
          body.style.height='0px';
          body.addEventListener('transitionend', function te(){ tab.open=false; done(); body.removeEventListener('transitionend',te); }, {once:true});
        } else {
          tab.open=true; const h=body.scrollHeight;
          body.style.height='0px'; body.offsetHeight;
          body.style.height=h+'px';
          body.addEventListener('transitionend', function te(){ done(); body.removeEventListener('transitionend',te); }, {once:true});
        }
      });
    });
  }

  window.GKcontent = GKcontent;
})();
