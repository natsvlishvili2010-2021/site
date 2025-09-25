(function(){
  const NUM_PANES = 4;
  const grid = document.getElementById('grid');
  const state = { loaded: 0 };

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
    small.append(refreshBtn, hideBtn, gadBtn);
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
    
    // Individual control elements for websites
    const indRefreshBtn = Object.assign(document.createElement('button'), { textContent:'Refresh' });
    const indBackBtn = Object.assign(document.createElement('button'), { textContent:'← Back' });
    const indForwardBtn = Object.assign(document.createElement('button'), { textContent:'Forward →' });
    const indHomeBtn = Object.assign(document.createElement('button'), { textContent:'Home' });
    
    individualControls.append(indRefreshBtn, indBackBtn, indForwardBtn, indHomeBtn);
    
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

    // Individual control event handlers (only for this website)
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

    grid.appendChild(pane);
    return { pane, input, loadBtn, status, website };
  }

  function setStatus(el, text){ el.textContent = text; }

  function buildWebsitePlayer(mount, statusEl){
    let iframe = null;
    let ready = false;
    let currentUrl = '';
    let homeUrl = '';

    function destroy(){ 
      if(iframe){ 
        iframe.remove(); 
        iframe = null; 
      } 
      ready = false; 
    }

    function ensureIframe(){ 
      if(iframe) return iframe; 
      const frame = document.createElement('iframe'); 
      frame.style.width = '100%'; 
      frame.style.height = '100%'; 
      frame.style.border = 'none';
      frame.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation';
      mount.appendChild(frame); 
      iframe = frame; 
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
              setStatus(statusEl, `Ready: ${url}`);
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
        } 
      },
      
      goBack(){ 
        if(iframe){ 
          try {
            iframe.contentWindow.history.back();
          } catch(e) {
            setStatus(statusEl, 'Cannot navigate back (cross-origin)');
          }
        } 
      },
      
      goForward(){ 
        if(iframe){ 
          try {
            iframe.contentWindow.history.forward();
          } catch(e) {
            setStatus(statusEl, 'Cannot navigate forward (cross-origin)');
          }
        } 
      },
      
      goHome(){ 
        if(iframe && homeUrl){ 
          iframe.src = homeUrl;
          setStatus(statusEl, `Going home: ${homeUrl}`);
        } 
      },
      
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

  // Event listeners
  refreshAllBtn.addEventListener('click', ()=>{ 
    panes.forEach(p=> p.website.refresh()); 
    statusIndicator.textContent = 'Refreshing all...';
    setTimeout(()=> statusIndicator.textContent = 'Ready', 2000);
  });
  
  fullscreenBtn.addEventListener('click', toggleFullscreen);

  // Update status indicator
  setInterval(()=>{
    const loadedCount = panes.filter(p=> p.website.isReady()).length;
    if(loadedCount > 0){
      statusIndicator.textContent = `${loadedCount}/4 loaded`;
    } else {
      statusIndicator.textContent = 'Ready';
    }
  }, 2000);

})();