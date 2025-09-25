(function(){
  const NUM_PANES = 4;
  const grid = document.getElementById('grid');
  const state = { 
    loaded: 0, 
    masterDuration: 100, // 100 seconds default "duration" for websites
    lastKnownTime: 0,
    isPlaying: false,
    playbackRate: 1
  };

  // PaneController class to manage individual website playback
  class PaneController {
    constructor(iframe, statusEl) {
      this.iframe = iframe;
      this.statusEl = statusEl;
      this.isPlaying = false;
      this.currentTime = 0;
      this.duration = 100; // Default 100 seconds
      this.playbackRate = 1;
      this.scrollInterval = null;
      this.maxScroll = 0;
      this.isSameOrigin = false;
      this.isControlled = false;
    }

    checkOriginAccess() {
      if (!this.iframe || !this.iframe.src) {
        this.isSameOrigin = false;
        this.isControlled = false;
        return;
      }

      try {
        // Try to access contentDocument to detect cross-origin restrictions
        const doc = this.iframe.contentDocument;
        if (doc) {
          // Check if we can actually access properties
          const testAccess = doc.documentElement;
          this.isSameOrigin = true;
          this.isControlled = true;
        }
      } catch(e) {
        // Cross-origin or other restrictions
        this.isSameOrigin = false;
        this.isControlled = false;
      }
    }

    async play() {
      if (this.isPlaying) return;
      
      // Check origin access first
      this.checkOriginAccess();
      
      if (!this.isControlled) {
        setStatus(this.statusEl, 'Manual only - cross-origin content. Click and scroll in pane.');
        return;
      }
      
      this.isPlaying = true;
      this.updateMaxScroll();
      this.startAutoScroll();
      setStatus(this.statusEl, 'Playing...');
    }

    pause() {
      this.isPlaying = false;
      if (this.scrollInterval) {
        clearInterval(this.scrollInterval);
        this.scrollInterval = null;
      }
      setStatus(this.statusEl, 'Paused');
    }

    stop() {
      this.pause();
      this.currentTime = 0;
      this.seekTo(0);
      setStatus(this.statusEl, 'Stopped');
    }

    seekTo(timePercent) {
      this.currentTime = (timePercent / 100) * this.duration;
      
      // Only attempt to control if we have access
      if (this.isControlled) {
        try {
          this.updateMaxScroll();
          const targetScroll = (timePercent / 100) * this.maxScroll;
          this.iframe.contentWindow.scrollTo(0, targetScroll);
        } catch(e) {
          // Access denied - mark as uncontrolled
          this.isControlled = false;
        }
      }
    }

    setRate(rate) {
      this.playbackRate = rate;
      if (this.isPlaying) {
        this.pause();
        this.play(); // Restart with new rate
      }
    }

    updateMaxScroll() {
      if (this.isControlled) {
        try {
          const doc = this.iframe.contentDocument;
          this.maxScroll = Math.max(
            doc.body.scrollHeight - doc.documentElement.clientHeight,
            0
          );
        } catch(e) {
          this.maxScroll = 1000; // Default fallback
          this.isControlled = false;
        }
      } else {
        this.maxScroll = 1000; // Default for uncontrolled content
      }
    }

    startAutoScroll() {
      if (this.scrollInterval) {
        clearInterval(this.scrollInterval);
      }

      // Only start auto-scroll for controlled content
      if (!this.isControlled) {
        setStatus(this.statusEl, 'Manual scrolling - cross-origin content');
        return;
      }

      // Calculate scroll speed based on playback rate
      const baseScrollSpeed = 2; // pixels per interval
      const scrollSpeed = baseScrollSpeed * this.playbackRate;
      const intervalTime = 100; // 100ms intervals

      this.scrollInterval = setInterval(() => {
        if (!this.isPlaying || !this.isControlled) return;

        try {
          const currentScroll = this.iframe.contentWindow.pageYOffset || 0;
          const newScroll = currentScroll + scrollSpeed;
          
          this.updateMaxScroll();
          
          if (newScroll >= this.maxScroll) {
            // Reached end, pause playback
            this.pause();
            this.currentTime = this.duration;
            setStatus(this.statusEl, 'Playback complete');
            return;
          }

          this.iframe.contentWindow.scrollTo(0, newScroll);
          
          // Update current time based on scroll position
          this.currentTime = (newScroll / this.maxScroll) * this.duration;
          
        } catch(e) {
          // Lost access - mark as uncontrolled
          this.isControlled = false;
          this.pause();
          setStatus(this.statusEl, 'Lost control - content blocked access');
        }
      }, intervalTime);
    }

    getCurrentTime() {
      return this.currentTime;
    }

    getDuration() {
      return this.duration;
    }

    isReady() {
      return this.iframe && this.iframe.src;
    }
  }

  function createPane(index){
    const pane = document.createElement('div');
    pane.className = 'pane';
    pane.dataset.index = index;

    const topbar = document.createElement('div');
    topbar.className = 'topbar';
    const input = Object.assign(document.createElement('input'), { type:'text', placeholder:'Paste website URL...' });
    const loadBtn = Object.assign(document.createElement('button'), { textContent:'Load' });
    topbar.append(input, loadBtn);

    const status = document.createElement('div');
    status.className = 'status';
    status.textContent = 'Idle';

    const websiteWrap = document.createElement('div');
    websiteWrap.className = 'website-wrap';

    const small = document.createElement('div');
    small.className = 'small-controls';
    const refreshBtn = Object.assign(document.createElement('button'), { textContent:'Refresh' });
    const hideBtn = Object.assign(document.createElement('button'), { textContent:'Hide' });
    const gadBtn = Object.assign(document.createElement('button'), { textContent:'GAD' });
    const paneFullscreenBtn = Object.assign(document.createElement('button'), { textContent:'⛶', title:'Fullscreen this pane' });
    small.append(refreshBtn, hideBtn, gadBtn, paneFullscreenBtn);
    websiteWrap.appendChild(small);

    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '0';
    container.style.top = '0';
    container.style.right = '0';
    container.style.bottom = '0';
    websiteWrap.appendChild(container);

    // Create individual controls container
    const individualControls = document.createElement('div');
    individualControls.className = 'individual-controls';
    individualControls.style.display = 'none'; // Hidden by default
    
    // Individual control elements for websites (now with playback controls)
    const indPlayBtn = Object.assign(document.createElement('button'), { textContent:'Play' });
    const indPauseBtn = Object.assign(document.createElement('button'), { textContent:'Pause' });
    const indSeek = Object.assign(document.createElement('input'), { 
      type:'range', min:'0', max:'100', step:'0.01', value:'0', className:'individual-seek'
    });
    const indCurTime = Object.assign(document.createElement('span'), { 
      textContent:'0:00', className:'time-badge'
    });
    const indDurTime = Object.assign(document.createElement('span'), { 
      textContent:'1:40', className:'time-badge' 
    });
    
    // Individual speed control for this website only
    const indSpeedSelect = document.createElement('select');
    indSpeedSelect.innerHTML = `
      <option value="0.5">0.5x</option>
      <option value="1" selected>1x</option>
      <option value="1.5">1.5x</option>
      <option value="2">2x</option>
      <option value="5">5x</option>
    `;
    
    const indRefreshBtn = Object.assign(document.createElement('button'), { textContent:'Refresh' });
    const indBackBtn = Object.assign(document.createElement('button'), { textContent:'← Back' });
    const indForwardBtn = Object.assign(document.createElement('button'), { textContent:'Forward →' });
    const indHomeBtn = Object.assign(document.createElement('button'), { textContent:'Home' });
    
    individualControls.append(indPlayBtn, indPauseBtn, indCurTime, indSeek, indDurTime, indSpeedSelect, indRefreshBtn, indBackBtn, indForwardBtn, indHomeBtn);
    
    pane.append(topbar, status, websiteWrap, individualControls);

    const website = buildWebsitePlayer(container, status);

    loadBtn.addEventListener('click', async ()=>{
      const url = input.value.trim();
      if(!url){ setStatus(status, 'Please paste a URL'); return; }
      await loadUrlIntoWebsite(url, website, status);
    });

    refreshBtn.addEventListener('click', ()=>{
      website.refresh();
    });

    hideBtn.addEventListener('click', ()=>{
      if(container.style.display === 'none'){ container.style.display = ''; hideBtn.textContent = 'Hide'; }
      else { container.style.display = 'none'; hideBtn.textContent = 'Show'; }
    });

    // GAD button to toggle individual controls
    gadBtn.addEventListener('click', ()=>{
      if(individualControls.style.display === 'none'){
        individualControls.style.display = 'flex';
        gadBtn.textContent = 'Hide Controls';
      } else {
        individualControls.style.display = 'none'; 
        gadBtn.textContent = 'GAD';
      }
    });

    // Pane fullscreen toggle functionality
    paneFullscreenBtn.addEventListener('click', ()=>{
      togglePaneFullscreen(pane, paneFullscreenBtn);
    });

    // Individual control event handlers (only for this website)
    indPlayBtn.addEventListener('click', async ()=>{ 
      await website.controller.play(); 
    });
    
    indPauseBtn.addEventListener('click', ()=>{ 
      website.controller.pause(); 
    });
    
    indSeek.addEventListener('input', ()=>{
      const t = Number(indSeek.value)||0;
      const duration = website.controller.getDuration();
      const time = (t / 100) * duration;
      indCurTime.textContent = hhmmss(time);
      const pct = Math.max(0, Math.min(100, t));
      indSeek.style.setProperty('--seek-fill', pct+'%');
    });
    
    indSeek.addEventListener('change', async ()=>{ 
      const t = Number(indSeek.value)||0; 
      website.controller.seekTo(t); 
    });

    // Individual speed control event handler (only affects this website)
    indSpeedSelect.addEventListener('change', ()=>{
      const rate = Number(indSpeedSelect.value);
      website.controller.setRate(rate);
    });
    
    indRefreshBtn.addEventListener('click', ()=>{ 
      website.refresh(); 
    });
    
    indBackBtn.addEventListener('click', ()=>{ 
      website.goBack(); 
    });
    
    indForwardBtn.addEventListener('click', ()=>{ 
      website.goForward(); 
    });

    indHomeBtn.addEventListener('click', ()=>{ 
      website.goHome(); 
    });

    // Update individual controls periodically for this website only
    setInterval(()=>{
      if(individualControls.style.display !== 'none' && website.controller.isReady()){
        const currentTime = website.controller.getCurrentTime() || 0;
        const duration = website.controller.getDuration() || 0;
        
        if(duration > 0){
          indSeek.max = '100';
          const percent = (currentTime / duration) * 100;
          indSeek.value = String(Math.min(100, percent));
          indCurTime.textContent = hhmmss(currentTime);
          indDurTime.textContent = hhmmss(duration);
          
          const pct = Math.max(0, Math.min(100, percent));
          indSeek.style.setProperty('--seek-fill', pct+'%');
        }
      }
    }, 1000);

    grid.appendChild(pane);
    return { pane, input, loadBtn, status, website };
  }

  function setStatus(el, text){ el.textContent = text; }
  function hhmmss(sec){ if(!isFinite(sec)) return '0:00'; const s = Math.floor(sec%60).toString().padStart(2,'0'); const m = Math.floor(sec/60)%60; const h = Math.floor(sec/3600); return (h>0? h+':'+String(m).padStart(2,'0') : m)+':'+s; }

  // Individual pane fullscreen functionality
  function togglePaneFullscreen(pane, fullscreenBtn) {
    const body = document.body;
    const currentFullscreenPane = body.querySelector('.pane-fullscreen');
    
    if (currentFullscreenPane && currentFullscreenPane === pane) {
      // Exit current pane fullscreen
      exitPaneFullscreen();
    } else if (currentFullscreenPane && currentFullscreenPane !== pane) {
      // Switch to different pane fullscreen
      exitPaneFullscreen();
      enterPaneFullscreen(pane, fullscreenBtn);
    } else {
      // Enter pane fullscreen
      enterPaneFullscreen(pane, fullscreenBtn);
    }
  }

  function enterPaneFullscreen(pane, fullscreenBtn) {
    const body = document.body;
    pane.classList.add('pane-fullscreen');
    body.classList.add('pane-fullscreen-mode');
    fullscreenBtn.textContent = '✕';
    fullscreenBtn.title = 'Exit fullscreen';
  }

  function exitPaneFullscreen() {
    const body = document.body;
    const currentFullscreenPane = body.querySelector('.pane-fullscreen');
    
    if (currentFullscreenPane) {
      currentFullscreenPane.classList.remove('pane-fullscreen');
      body.classList.remove('pane-fullscreen-mode');
      
      // Update the fullscreen button text
      const fullscreenBtn = currentFullscreenPane.querySelector('button[title*="fullscreen"]');
      if (fullscreenBtn) {
        fullscreenBtn.textContent = '⛶';
        fullscreenBtn.title = 'Fullscreen this pane';
      }
    }
  }

  // Listen for Escape key to exit pane fullscreen
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('pane-fullscreen-mode')) {
      exitPaneFullscreen();
    }
  });

  function buildWebsitePlayer(mount, statusEl){
    let iframe = null;
    let ready = false;
    let currentUrl = '';
    let homeUrl = '';
    let controller = null;

    function destroy(){ 
      if(controller) {
        controller.pause();
      }
      if(iframe){ 
        iframe.remove(); 
        iframe = null; 
      } 
      ready = false; 
      controller = null;
    }

    function ensureIframe(){ 
      if(iframe) return iframe; 
      const frame = document.createElement('iframe'); 
      frame.style.width = '100%'; 
      frame.style.height = '100%'; 
      frame.style.border = 'none';
      frame.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups';
      mount.appendChild(frame); 
      iframe = frame; 
      
      // Create controller after iframe is ready
      setTimeout(() => {
        controller = new PaneController(iframe, statusEl);
        // Check origin access after a delay to allow iframe to load
        setTimeout(() => {
          controller.checkOriginAccess();
        }, 500);
      }, 1000); // Wait for iframe to load
      
      return frame; 
    }

    return {
      async loadFromUrl(url){
        destroy();
        currentUrl = url;
        homeUrl = url; // Set home URL to the first loaded URL
        setStatus(statusEl, `Loading: ${url}`);
        
        return await new Promise((resolve, reject)=>{
          try {
            const frame = ensureIframe();
            
            const onLoad = ()=>{
              frame.removeEventListener('load', onLoad);
              ready = true;
              // Check origin access after loading
              setTimeout(() => {
                if (controller) {
                  controller.checkOriginAccess();
                  const accessText = controller.isControlled ? 'Ready (controlled)' : 'Ready (manual only)';
                  setStatus(statusEl, `${accessText}: ${url}`);
                }
              }, 500);
              resolve();
            };
            
            const onError = ()=>{
              frame.removeEventListener('error', onError);
              setStatus(statusEl, `Error loading: ${url}`);
              reject(new Error('Failed to load website'));
            };
            
            frame.addEventListener('load', onLoad);
            frame.addEventListener('error', onError);
            frame.src = url;
          } catch(e) {
            setStatus(statusEl, 'Error: ' + e.message);
            reject(e);
          }
        });
      },
      
      refresh(){ 
        if(iframe && currentUrl){ 
          iframe.src = iframe.src; // Force refresh
          setStatus(statusEl, `Refreshing: ${currentUrl}`);
          // Re-check origin access after refresh
          setTimeout(() => {
            if (controller) {
              controller.checkOriginAccess();
              const accessText = controller.isControlled ? 'Ready (controlled)' : 'Ready (manual only)';
              setStatus(statusEl, `${accessText}: ${currentUrl}`);
            }
          }, 1500);
        } 
      },
      
      goBack(){ 
        if(iframe && controller && controller.isControlled){ 
          try {
            iframe.contentWindow.history.back();
          } catch(e) {
            setStatus(statusEl, 'Cannot navigate back (cross-origin)');
          }
        } else {
          setStatus(statusEl, 'Navigation blocked - cross-origin content');
        }
      },
      
      goForward(){ 
        if(iframe && controller && controller.isControlled){ 
          try {
            iframe.contentWindow.history.forward();
          } catch(e) {
            setStatus(statusEl, 'Cannot navigate forward (cross-origin)');
          }
        } else {
          setStatus(statusEl, 'Navigation blocked - cross-origin content');
        }
      },
      
      goHome(){ 
        if(iframe && homeUrl){ 
          iframe.src = homeUrl;
          setStatus(statusEl, `Going home: ${homeUrl}`);
          // Re-check origin access after navigation
          setTimeout(() => {
            if (controller) {
              controller.checkOriginAccess();
              const accessText = controller.isControlled ? 'Ready (controlled)' : 'Ready (manual only)';
              setStatus(statusEl, `${accessText}: ${homeUrl}`);
            }
          }, 1500);
        } 
      },
      
      get controller() { return controller; },
      isReady(){ return ready; },
      getCurrentUrl(){ return currentUrl; },
    };
  }

  async function loadUrlIntoWebsite(url, website, statusEl){
    setStatus(statusEl, 'Loading...');
    try{
      // Add protocol if missing
      if(!url.startsWith('http://') && !url.startsWith('https://')){
        url = 'https://' + url;
      }
      await website.loadFromUrl(url);
    }catch(e){ 
      setStatus(statusEl, 'Error: ' + e.message); 
    }
  }

  const panes = Array.from({length:NUM_PANES}, (_,i)=> createPane(i));

  function updateMasterDuration(){
    const durations = panes.map(p=> p.website.controller ? p.website.controller.getDuration() : 0).filter(Boolean);
    const candidateMax = Math.max(100, ...durations); // At least 100 seconds
    state.masterDuration = candidateMax;
    const seek = document.getElementById('seek');
    const newMax = Math.max(10, Math.ceil(state.masterDuration || 0));
    seek.max = String(newMax);
    if (durtime) { durtime.textContent = hhmmss(state.masterDuration || 0); }
    const curVal = Number(seek.value) || 0;
    const pct = newMax > 0 ? Math.max(0, Math.min(100, (curVal / newMax) * 100)) : 0;
    seek.style.setProperty('--seek-fill', pct + '%');
  }

  // Get DOM elements
  const btnPlay = document.getElementById('play');
  const btnPlayAll = document.getElementById('play-all');
  const btnPause = document.getElementById('pause');
  const btnStop = document.getElementById('stop');
  const seek = document.getElementById('seek');
  const curtime = document.getElementById('curtime');
  const durtime = document.getElementById('durtime');
  const rate = document.getElementById('rate');
  const refreshAllBtn = document.getElementById('refresh-all');
  const fullscreenBtn = document.getElementById('fullscreen');
  const statusIndicator = document.getElementById('status-indicator');

  // Fullscreen functionality
  function toggleFullscreen(event){
    event.preventDefault();
    event.stopPropagation();
    
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(console.error);
        } else if (document.documentElement.webkitRequestFullscreen) {
          document.documentElement.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(console.error);
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  }

  // Listen for fullscreen changes
  document.addEventListener('fullscreenchange', ()=>{
    fullscreenBtn.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
  });
  document.addEventListener('webkitfullscreenchange', ()=>{
    fullscreenBtn.textContent = document.webkitFullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
  });

  // Global control event handlers
  btnPlay.addEventListener('click', async ()=>{ const target = Number(seek.value)||0; await broadcastSeek(target); await broadcastPlay(); });
  btnPlayAll.addEventListener('click', async ()=>{ await broadcastPlay(); });
  btnPause.addEventListener('click', ()=> broadcastPause());
  btnStop.addEventListener('click', async ()=>{ await broadcastPause(); await broadcastSeek(0); });
  rate.addEventListener('change', ()=> broadcastRate(Number(rate.value)));
  seek.addEventListener('input', ()=>{
    const t = Number(seek.value)||0;
    curtime.textContent = hhmmss(t);
    const max = Number(seek.max)||1; 
    const pct = Math.max(0, Math.min(100, (t/max)*100));
    seek.style.setProperty('--seek-fill', pct+'%');
  });
  seek.addEventListener('change', async ()=>{ const t = Number(seek.value)||0; await broadcastSeek((t/state.masterDuration)*100); });

  // Global broadcast functions
  async function broadcastPlay(){ 
    await Promise.all(panes.map(async p=> {
      if(p.website.controller) {
        await p.website.controller.play();
      }
    })); 
    state.isPlaying = true;
  }
  
  function broadcastPause(){ 
    panes.forEach(p=> {
      if(p.website.controller) {
        p.website.controller.pause();
      }
    }); 
    state.isPlaying = false;
  }
  
  async function broadcastSeek(timePercent){ 
    await Promise.all(panes.map(async p=> {
      if(p.website.controller) {
        p.website.controller.seekTo(timePercent);
      }
    })); 
  }
  
  function broadcastRate(r){ 
    panes.forEach(p=> {
      if(p.website.controller) {
        p.website.controller.setRate(r);
      }
    }); 
    state.playbackRate = r;
  }

  // Other event listeners
  refreshAllBtn.addEventListener('click', ()=>{ 
    panes.forEach(p=> p.website.refresh()); 
    statusIndicator.textContent = 'Refreshing all...';
    setTimeout(()=> statusIndicator.textContent = 'Ready', 2000);
  });
  
  fullscreenBtn.addEventListener('click', toggleFullscreen);

  // Update master controls and status periodically
  setInterval(()=>{
    const loadedCount = panes.filter(p=> p.website.isReady()).length;
    if(loadedCount > 0){
      statusIndicator.textContent = `${loadedCount}/4 loaded`;
    } else {
      statusIndicator.textContent = 'Ready';
    }

    // Update master time display based on active websites
    const times = panes.map(p=> p.website.controller ? p.website.controller.getCurrentTime() : 0).filter(Boolean);
    if(times.length > 0){
      const maxT = Math.max(...times);
      state.lastKnownTime = maxT;
      const dur = state.masterDuration || 0; 
      if(dur > 0){ 
        const val = Math.min(dur, maxT); 
        seek.value = String(val); 
        if(curtime){ curtime.textContent = hhmmss(val); } 
        const pct = Math.max(0, Math.min(100, (val/dur)*100)); 
        seek.style.setProperty('--seek-fill', pct+'%'); 
      }
    }
  }, 1000);

})();