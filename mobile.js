/* ============================================================
   MOMO GINGKO — mobile subpage bootstrap
   Included at the end of every content page (production-design,
   concept-illustration, design, about, project, gallery-item).

   Desktop: these files are FRAGMENTS mounted by the shell; loaded
   directly they redirect into index.html?view=… (unchanged).

   Mobile: the shell is off — each page is a real, standalone,
   scrolling portfolio subpage. This script builds the standalone
   chrome: the hand-drawn title banner, a wrapped sticky sub-nav
   (PD/Design, swipe L/R to switch views), and the footer. C&I
   drops its filters (one big gallery). No back arrows.
   ============================================================ */
(function(){
  var MQ = matchMedia('(max-aspect-ratio: 7/5), (max-width: 820px)');

  if(!MQ.matches){
    if(!window.__SHELL__){
      var file = location.pathname.split('/').pop() || 'index.html';
      location.replace('index.html?view=' + file + location.search.replace('?','&'));
    }
    return;
  }

  var root = document.documentElement; root.classList.add('mob');
  var b = document.body; b.classList.add('m-sub');
  var page = b.dataset.page || 'menu';
  MQ.addEventListener('change', function(){ location.reload(); });

  var FOOT =
    '<footer class="mfoot"><nav class="mfoot-nav">'+
    '<a href="production-design.html">Production Design</a>'+
    '<a href="concept-illustration.html">Concept &amp; Illustration</a>'+
    '<a href="design.html">Design</a>'+
    '<a href="about.html">About</a>'+
    '</nav><span class="mfoot-cr">© 2025 默默 GINGKO</span></footer>';

  // ---- gallery-item: full-screen viewer (its own bar handles counter + prev/next hrefs) ----
  if(page === 'gallery'){
    [].forEach.call(document.querySelectorAll('.gk-close'), function(a){
      a.setAttribute('role','button');
      a.addEventListener('click', function(e){ e.preventDefault(); if(history.length>1) history.back(); else location.href='index.html'; });
    });
    var gx=0, gy=0, gt=0;
    addEventListener('touchstart', function(e){ var t=e.changedTouches[0]; gx=t.clientX; gy=t.clientY; gt=Date.now(); }, {passive:true});
    addEventListener('touchend', function(e){
      var t=e.changedTouches[0], dx=t.clientX-gx, dy=t.clientY-gy;
      if(Date.now()-gt>600 || Math.abs(dx)<45 || Math.abs(dx)<Math.abs(dy)*1.4) return;
      var a=document.querySelector(dx<0 ? '.item-next' : '.item-prev');
      if(a) location.href = a.getAttribute('href');
    }, {passive:true});
    return;
  }

  var vr = document.querySelector('.view-root');

  // ---- C&I: drop the filters — mobile shows one big gallery ----
  var filt = document.querySelector('.view-root .filters');
  if(filt) filt.remove();

  // ---- sub-nav (PD / Design): sticky WRAPPED row, no back arrow; swipe L/R switches views ----
  var sub = document.querySelector('.view-root .submenu');
  if(sub){
    var bar = document.createElement('div'); bar.className = 'm-subnav';
    bar.appendChild(sub);                         // relocate (its click listeners survive the move)
    b.insertBefore(bar, b.firstChild);

    var btns = [].slice.call(sub.querySelectorAll('button'));
    var sxx=0, syy=0, stt=0;
    addEventListener('touchstart', function(e){ var t=e.changedTouches[0]; sxx=t.clientX; syy=t.clientY; stt=Date.now(); }, {passive:true});
    addEventListener('touchend', function(e){
      var t=e.changedTouches[0], dx=t.clientX-sxx, dy=t.clientY-syy;
      if(Date.now()-stt>600 || Math.abs(dx)<55 || Math.abs(dx)<Math.abs(dy)*1.5) return;
      var i = btns.findIndex(function(x){ return x.getAttribute('aria-selected')==='true'; });
      if(i<0) i=0;
      var j = dx<0 ? Math.min(btns.length-1, i+1) : Math.max(0, i-1);   // swipe left → next view
      if(j!==i){ btns[j].click(); scrollTo(0,0); }
    }, {passive:true});
  }

  // ---- hand-drawn title banner (masked + ink-filled, cropped to the mark) ----
  var timg = b.dataset.titleImg || '';
  if(timg && vr){
    var ban = document.createElement('div'); ban.className = 'm-banner';
    var mark = document.createElement('span');
    mark.className = 'm-btitle'; mark.setAttribute('role','img'); mark.setAttribute('aria-label', b.dataset.title||'');
    mark.style.setProperty('--ti', 'url("' + timg + '")');
    ban.appendChild(mark); vr.insertBefore(ban, vr.firstChild);
    fitBanner(mark, timg);
  }

  // ---- footer on every subpage ----
  b.insertAdjacentHTML('beforeend', FOOT);

  function fitBanner(el, url){
    var im = new Image();
    im.onload = function(){
      try{
        var NW=im.naturalWidth, NH=im.naturalHeight, sc=Math.min(1, 320/NW),
            cw=Math.max(1, NW*sc|0), ch=Math.max(1, NH*sc|0);
        var cv=document.createElement('canvas'); cv.width=cw; cv.height=ch;
        var cx=cv.getContext('2d'); cx.drawImage(im,0,0,cw,ch);
        var d=cx.getImageData(0,0,cw,ch).data, maxY=-1, px, py;
        for(py=ch-1; py>=0 && maxY<0; py--){ for(px=0; px<cw; px++){ if(d[(py*cw+px)*4+3]>18){ maxY=py; break; } } }
        if(maxY<0) return;
        el.style.aspectRatio = NW + ' / ' + Math.max(1, Math.round(NH*(maxY+1)/ch));
      }catch(e){}
    };
    im.src = url;
  }
})();
