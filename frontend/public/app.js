(function(){
  const NUM_PANES = 4;
  const grid = document.getElementById('grid');
  const state = { masterDuration: 0, lastKnownTime: 0, syncing: false, mutedAll: false };

  function createPane(index){
    const pane = document.createElement('div');
    pane.className = 'pane';
    pane.dataset.index = index;

    const topbar = document.createElement('div');
    topbar.className = 'topbar';
    const input = Object.assign(document.createElement('input'), { type:'text', placeholder:'Paste video URL...' });
    const loadBtn = Object.assign(document.createElement('button'), { textContent:'Load' });
    topbar.append(input, loadBtn);

    const status = document.createElement('div');
    status.className = 'status';
    status.textContent = 'Idle';

    const videoWrap = document.createElement('div');
    videoWrap.className = 'video-wrap';

    const small = document.createElement('div');
    small.className = 'small-controls';
    const muteBtn = Object.assign(document.createElement('button'), { textContent:'Mute' });
    const hideBtn = Object.assign(document.createElement('button'), { textContent:'Hide' });
    const gadBtn = Object.assign(document.createElement('button'), { textContent:'GAD' });
    small.append(muteBtn, hideBtn, gadBtn);
    videoWrap.appendChild(small);

    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '0';
    container.style.top = '0';
    container.style.right = '0';
    container.style.bottom = '0';
    videoWrap.appendChild(container);

    // Create individual controls container
    const individualControls = document.createElement('div');
    individualControls.className = 'individual-controls';
    individualControls.style.display = 'none'; // Hidden by default
    
    // Individual control elements
    const indPlayBtn = Object.assign(document.createElement('button'), { textContent:'Play' });
    const indPauseBtn = Object.assign(document.createElement('button'), { textContent:'Pause' });
    const indSeek = Object.assign(document.createElement('input'), { 
      type:'range', min:'0', max:'100', step:'0.01', value:'0', className:'individual-seek'
    });
    const indCurTime = Object.assign(document.createElement('span'), { 
      textContent:'0:00', className:'time-badge'
    });
    const indDurTime = Object.assign(document.createElement('span'), { 
      textContent:'0:00', className:'time-badge' 
    });
    
    // Individual speed control for this video only
    const indSpeedSelect = document.createElement('select');
    indSpeedSelect.innerHTML = `
      <option value="0.5">0.5x</option>
      <option value="1" selected>1x</option>
      <option value="1.5">1.5x</option>
      <option value="2">2x</option>
      <option value="5">5x</option>
    `;
    
    individualControls.append(indPlayBtn, indPauseBtn, indCurTime, indSeek, indDurTime, indSpeedSelect);
    
    pane.append(topbar, status, videoWrap, individualControls);

    const player = buildPlayer(container, status);

    loadBtn.addEventListener('click', async ()=>{
      const url = input.value.trim();
      if(!url){ setStatus(status, 'Please paste a URL'); return; }
      await loadUrlIntoPlayer(url, player, status);
    });

    muteBtn.addEventListener('click', ()=>{
      player.setMuted(!player.isMuted());
      muteBtn.textContent = player.isMuted() ? 'Unmute' : 'Mute';
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

    // Individual control event handlers (only for this video)
    indPlayBtn.addEventListener('click', async ()=>{ 
      await player.play(); 
    });
    
    indPauseBtn.addEventListener('click', ()=>{ 
      player.pause(); 
    });
    
    indSeek.addEventListener('input', ()=>{
      const t = Number(indSeek.value)||0;
      indCurTime.textContent = hhmmss(t);
      const max = Number(indSeek.max)||1; 
      const pct = Math.max(0, Math.min(100, (t/max)*100));
      indSeek.style.setProperty('--seek-fill', pct+'%');
    });
    
    indSeek.addEventListener('change', async ()=>{ 
      const t = Number(indSeek.value)||0; 
      await player.seekTo(t); 
    });

    // Individual speed control event handler (only affects this video)
    indSpeedSelect.addEventListener('change', ()=>{
      const rate = Number(indSpeedSelect.value);
      player.setRate(rate);
    });

    // Update individual controls periodically for this video only
    setInterval(()=>{
      if(individualControls.style.display !== 'none' && player.isReady()){
        const currentTime = player.getCurrentTime() || 0;
        const duration = player.getDuration() || 0;
        
        if(duration > 0){
          const newMax = Math.max(10, Math.ceil(duration));
          indSeek.max = String(newMax);
          indSeek.value = String(Math.min(duration, currentTime));
          indCurTime.textContent = hhmmss(currentTime);
          indDurTime.textContent = hhmmss(duration);
          
          const pct = Math.max(0, Math.min(100, (currentTime/duration)*100));
          indSeek.style.setProperty('--seek-fill', pct+'%');
        }
      }
    }, 1000);

    grid.appendChild(pane);
    return { pane, input, loadBtn, status, player };
  }

  function setStatus(el, text){ el.textContent = text; }
  function hhmmss(sec){ if(!isFinite(sec)) return '0:00'; const s = Math.floor(sec%60).toString().padStart(2,'0'); const m = Math.floor(sec/60)%60; const h = Math.floor(sec/3600); return (h>0? h+':'+String(m).padStart(2,'0') : m)+':'+s; }

  function buildPlayer(mount, statusEl){
    let type = 'empty';
    let video = null; let hls = null; let yt = null; let ready = false; let provider = 'unknown'; let duration = 0; let title = '';

    function destroy(){ if(hls){ hls.destroy(); hls=null; } if(video){ video.src=''; video.remove(); video=null; } if(yt){ try{ yt.destroy(); }catch(e){} yt=null; } ready=false; }

    function ensureVideo(){ if(video) return video; const v = document.createElement('video'); v.playsInline = true; v.controls = false; v.muted = false; v.preload = 'auto'; v.crossOrigin = 'anonymous'; v.disablePictureInPicture = true; v.style.width = '100%'; v.style.height = '100%'; mount.appendChild(v); video = v; return v; }

    return {
      async loadFromSources(meta){
        destroy(); provider = meta.provider || 'unknown'; title = meta.title || ''; duration = meta.duration || 0; const sources = meta.sources || [];
        setStatus(statusEl, `Loading: ${title || provider} (${duration? hhmmss(duration):'--:--'})`);
        // Prefer MP4 (lower CPU) when available
        const mp4Src = sources.find(s=> s.type==='mp4');
        const hlsSrc = sources.find(s=> s.type==='hls');
        return await new Promise((resolve, reject)=>{
          if(mp4Src){
            type='mp4'; const v = ensureVideo();
            const onMeta = ()=>{ v.removeEventListener('loadedmetadata', onMeta); duration = v.duration || duration; ready=true; setStatus(statusEl, `Ready (MP4) ${title}`); resolve(); };
            v.addEventListener('loadedmetadata', onMeta, { once: true });
            v.src = mp4Src.url;
          } else if(hlsSrc){
            type='hls'; const v = ensureVideo(); if(window.Hls && Hls.isSupported()){
              hls = new Hls({
              enableWorker: true,
              lowLatencyMode: false,
              capLevelToPlayerSize: true,
              startLevel: -1,
              backBufferLength: 15,
              maxBufferLength: 10,
              manifestLoadingRetryDelay: 1000,
              levelLoadingRetryDelay: 1000,
              fragLoadingRetryDelay: 1000,
              manifestLoadingMaxRetry: 3,
              levelLoadingMaxRetry: 3,
              fragLoadingMaxRetry: 3,
              });
              hls.loadSource(hlsSrc.url);
              hls.attachMedia(v);
              let mediaErrorRecoveries = 0;
              hls.on(Hls.Events.MANIFEST_PARSED, ()=>{ ready=true; duration = v.duration || duration; setStatus(statusEl, `Ready (HLS) ${title}`); mediaErrorRecoveries = 0; resolve(); });
              hls.on(Hls.Events.ERROR, (evt, data)=>{
              const detail = (data && (data.details || data.type)) || 'unknown';
              if (!data) { setStatus(statusEl, 'HLS error'); return; }
              if (data.fatal) {
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                  setStatus(statusEl, 'HLS network error, retrying...');
                  try { hls.startLoad(); } catch(e){}
                } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaErrorRecoveries < 2) {
                  mediaErrorRecoveries++;
                  setStatus(statusEl, 'HLS media error, recovering...');
                  try { hls.recoverMediaError(); } catch(e){}
                } else {
                  setStatus(statusEl, 'HLS fatal: '+detail); reject(new Error(detail));
                }
              } else {
                // Non-fatal, update status for visibility
                setStatus(statusEl, 'HLS warn: '+detail);
              }
              });
            }
            else if(v.canPlayType('application/vnd.apple.mpegurl')){ v.addEventListener('loadedmetadata', ()=>{ ready=true; duration = v.duration || duration; setStatus(statusEl, `Ready (HLS native) ${title}`); resolve(); }, { once: true }); v.src = hlsSrc.url; }
            else { setStatus(statusEl, 'HLS not supported'); reject(new Error('HLS not supported')); }
          } else if(meta.provider === 'youtube'){
            type='youtube'; const id = extractYouTubeId(meta.originalUrl || ''); if(!id){ setStatus(statusEl, 'YouTube ID not found'); reject(new Error('YouTube ID not found')); return; } const iframe = document.createElement('div'); mount.appendChild(iframe);
            const waitYT = new Promise(res=>{ if(window.YT && window.YT.Player) res(); else { const iv = setInterval(()=>{ if(window.YT && window.YT.Player){ clearInterval(iv); res(); } }, 100); } });
            waitYT.then(()=>{ yt = new YT.Player(iframe, { videoId:id, playerVars:{ controls:0, modestbranding:1, rel:0, disablekb:1 }, events:{ onReady:()=>{ ready=true; setStatus(statusEl, `Ready (YouTube) ${title}`); resolve(); }, onError:(e)=> { setStatus(statusEl, 'YT error '+(e && e.data)); reject(new Error('YT error')); } }}); });
          } else {
            setStatus(statusEl, 'No playable source'); reject(new Error('No playable source'));
          }
        });
      },
      getCurrentTime(){ if(type==='youtube') return yt? (yt.getCurrentTime()||0) : 0; if(video) return video.currentTime||0; return 0; },
      async seekTo(t){ if(!ready) return; if(type==='youtube'){ try{ yt.seekTo(t, true); }catch(e){} } else if(video){ try{ video.currentTime = t; }catch(e){} } },
      async play(){ if(!ready) return; if(type==='youtube'){ try{ yt.playVideo(); }catch(e){} } else if(video){ try{ await video.play(); }catch(e){} } },
      pause(){ if(!ready) return; if(type==='youtube'){ try{ yt.pauseVideo(); }catch(e){} } else if(video){ try{ video.pause(); }catch(e){} } },
      stop(){ if(!ready) return; this.pause(); this.seekTo(0); },
      setRate(r){ if(type==='youtube'){ try{ yt.setPlaybackRate(r); }catch(e){} } else if(video){ video.playbackRate = r; } },
      setVolume(v){ if(type==='youtube'){ try{ yt.setVolume(Math.round(v*100)); }catch(e){} } else if(video){ video.volume = v; } },
      setMuted(m){ if(type==='youtube'){ try{ m? yt.mute(): yt.unMute(); }catch(e){} } else if(video){ video.muted = m; } },
      isMuted(){ if(type==='youtube'){ try{ return yt.isMuted(); }catch(e){ return false; } } else { return !!(video && video.muted); } },
      isReady(){ return ready; },
      getDuration(){ if(type==='youtube'){ try{ return yt.getDuration()||duration||0; }catch(e){ return duration||0; } } return duration || (video? video.duration||0 : 0); },
      getType(){ return type; },
      getProvider(){ return provider; },
    };
  }

  async function apiFetch(url){
    const res = await fetch('/api/fetch', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({url}) });
    if(!res.ok){ throw new Error('HTTP '+res.status); }
    const data = await res.json();
    if(data.status !== 'ok'){ throw new Error(data.message || 'Extraction failed'); }
    data.originalUrl = url; // for YT fallback id parsing
    return data;
  }

  function extractYouTubeId(u){ try{ const m = u.match(/[?&]v=([^&]+)/) || u.match(/youtu\.be\/([^?&]+)/); return m? m[1] : null; }catch(e){ return null; } }

  async function loadUrlIntoPlayer(url, player, statusEl){
    setStatus(statusEl, 'Fetching...');
    try{
      const meta = await apiFetch(url);
      setStatus(statusEl, 'Loading sources...');
      await player.loadFromSources(meta);
      updateMasterDuration();
    }catch(e){ setStatus(statusEl, 'Error: '+e.message); }
  }

  const panes = Array.from({length:NUM_PANES}, (_,i)=> createPane(i));

  function updateMasterDuration(){
    const durations = panes.map(p=> p.player.getDuration() || 0).filter(Boolean);
    const candidateMax = Math.max(0, ...durations);
    // Only grow the master duration; never shrink when a shorter video loads
    const epsilon = 0.25; // seconds tolerance
    if (!isFinite(state.masterDuration) || state.masterDuration <= 0 || candidateMax > state.masterDuration + epsilon) {
      state.masterDuration = candidateMax;
      const seek = document.getElementById('seek');
      const newMax = Math.max(10, Math.ceil(state.masterDuration || 0));
      seek.max = String(newMax);
      if (durtime) { durtime.textContent = hhmmss(state.masterDuration || 0); }
      // Recompute fill based on current value vs new max
      const curVal = Number(seek.value) || 0;
      const pct = newMax > 0 ? Math.max(0, Math.min(100, (curVal / newMax) * 100)) : 0;
      seek.style.setProperty('--seek-fill', pct + '%');
    }
  }

  const btnPlay = document.getElementById('play');
  const btnPause = document.getElementById('pause');
  const btnStop = document.getElementById('stop');
  const seek = document.getElementById('seek');
  const curtime = document.getElementById('curtime');
  const durtime = document.getElementById('durtime');
  const rate = document.getElementById('rate');
  const volume = document.getElementById('volume');
  const muteAll = document.getElementById('mute');
  const resync = document.getElementById('resync');
  const fullscreenBtn = document.getElementById('fullscreen');
  const syncIndicator = document.getElementById('sync-indicator');

  // Fullscreen functionality
  function toggleFullscreen(event){
    event.preventDefault(); // Prevent any form submission or default button behavior
    event.stopPropagation(); // Stop event bubbling
    
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        // Enter fullscreen
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(console.error);
        } else if (document.documentElement.webkitRequestFullscreen) {
          document.documentElement.webkitRequestFullscreen();
        } else {
          console.log('Fullscreen API not supported');
        }
      } else {
        // Exit fullscreen
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

  // Listen for fullscreen changes to update button text
  document.addEventListener('fullscreenchange', ()=>{
    fullscreenBtn.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
  });
  document.addEventListener('webkitfullscreenchange', ()=>{
    fullscreenBtn.textContent = document.webkitFullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
  });

  btnPlay.addEventListener('click', async ()=>{ const target = Number(seek.value)||0; await broadcastSeek(target); await broadcastPlay(); });
  btnPause.addEventListener('click', ()=> broadcastPause());
  btnStop.addEventListener('click', async ()=>{ await broadcastPause(); await broadcastSeek(0); });
  rate.addEventListener('change', ()=> broadcastRate(Number(rate.value)));
  volume.addEventListener('input', ()=> broadcastVolume(Number(volume.value)));
  muteAll.addEventListener('click', ()=>{ state.mutedAll = !state.mutedAll; broadcastMute(state.mutedAll); muteAll.textContent = state.mutedAll? 'Unmute All' : 'Mute All'; });
  seek.addEventListener('input', ()=>{
    const t = Number(seek.value)||0;
    curtime.textContent = hhmmss(t);
    const max = Number(seek.max)||1; const pct = Math.max(0, Math.min(100, (t/max)*100));
    seek.style.setProperty('--seek-fill', pct+'%');
  });
  seek.addEventListener('change', async ()=>{ const t = Number(seek.value)||0; await broadcastSeek(t); });
  resync.addEventListener('click', async ()=>{ const t = state.lastKnownTime||0; await broadcastSeek(t); });
  fullscreenBtn.addEventListener('click', toggleFullscreen);

  async function broadcastPlay(){ await Promise.all(panes.map(async p=> p.player.play())); }
  function broadcastPause(){ panes.forEach(p=> p.player.pause()); }
  async function broadcastSeek(t){ await Promise.all(panes.map(async p=> p.player.seekTo(t))); }
  function broadcastRate(r){ panes.forEach(p=> p.player.setRate(r)); const v = Number(rate.value||'1'); panes.forEach(p=> p.player.setRate(v)); }
  function broadcastVolume(v){ panes.forEach(p=> p.player.setVolume(v)); }
  function broadcastMute(m){ panes.forEach(p=> p.player.setMuted(m)); }

  let lastCorrection = 0;
  setInterval(()=>{
    const times = panes.map(p=> p.player.getCurrentTime()||0);
    if(times.every(t=> t===0)) return;
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const drift = maxT - minT;
    state.lastKnownTime = maxT;
    const threshold = 0.50;
    syncIndicator.textContent = `Sync: drift ${drift.toFixed(2)}s`;
    syncIndicator.className = 'badge'+(drift>threshold? ' warn':'');
    const now = performance.now();
    // Disabled automatic sync correction to allow individual video seeking
    // if(drift>threshold && now - lastCorrection > 1500){
    //   // Only seek lagging players forward; avoid touching the leader to reduce stalls
    //   panes.forEach(p=> { const t = p.player.getCurrentTime()||0; if((maxT - t) > threshold){ p.player.seekTo(maxT - 0.1); } });
    //   lastCorrection = now;
    // }
    const dur = state.masterDuration || 0; if(dur>0){ const val = Math.min(dur, maxT); seek.value = String(val); if(curtime){ curtime.textContent = hhmmss(val); } const pct = Math.max(0, Math.min(100, (val/dur)*100)); seek.style.setProperty('--seek-fill', pct+'%'); }
  }, 1000);
})();
