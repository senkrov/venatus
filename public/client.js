(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  // Ensure canvas can receive focus so Tab handling works
  if (!canvas.hasAttribute('tabindex')) {
    canvas.setAttribute('tabindex', '0');
  }
  canvas.addEventListener('click', () => {
    try { canvas.focus(); } catch (_) {}
  });
  const cursorOverlay = document.getElementById('cursorOverlay');
  const cursorCtx = cursorOverlay.getContext('2d');
  const dragOverlay = document.getElementById('dragOverlay');
  const dragCtx = dragOverlay.getContext('2d');
  const dragState = { active: false, img: null, size: 48, x: 0, y: 0, cleanup: null };

  const messageBox = document.getElementById('messageBox');
  const coordinateDisplay = document.getElementById('coordinateDisplay');
  const gearContainer = document.getElementById('gearContainer');
  const inventoryPanel = document.getElementById('inventory');
  const inventoryGrid = document.getElementById('inventoryGrid');
  const equipmentGrid = document.getElementById('equipmentGrid');
  const hotbarPanel = document.getElementById('hotbar');
  const energyIndicator = document.getElementById('heatIndicator'); // Keep same HTML element
  const energyFill = document.createElement('div');
  energyFill.className = 'heatFill'; // Keep same CSS class
  energyIndicator.appendChild(energyFill);

  let realm = 'nexus';
  let realmSize = { width: 2000, height: 2000 };
  let realmConfig = null;
  let username = null;
  let physics = { ACCELERATION: 0.1, FRICTION: 0.95, MAX_SPEED: 5 };

  const input = { up: false, down: false, left: false, right: false, angle: 0 };
  const camera = { x: 0, y: 0 };

  let localPlayer = { x: 0, y: 0 };
  let portals = [];
  let players = [];
  let mobs = []; // Add mobs array
  let spawners = []; // Add spawners array
  let gear = { inventory: [], hotbar: [null, null, null, null], equipment: {} };
  let activeHotbarIndex = 0;
  
  // Simple Minimap System
  let minimap;
  let minimapCanvas;
  let minimapCtx;
  let minimapTooltip;
  let minimapHoveredElement = null;
  
  // Hit effects and damage numbers
  let hitEffects = [];
  let damageNumbers = [];

  const ITEM_ICONS = {
    item_pistol_a: '/assets/sprites/items/pistol.png',
    item_rifle_a: '/assets/sprites/items/rifle.png',
  };
  const SLOT_ICON_SIZE = 64; // keep drag ghost and slot icons consistent
  const ICON_CACHE = new Map();
  // Preload icons
  for (const id in ITEM_ICONS) {
    const img = new Image();
    img.src = ITEM_ICONS[id];
    ICON_CACHE.set(id, img);
  }

  // Software cursor for pointer lock
  const cursorImg = new Image();
  cursorImg.src = '/assets/sprites/cursor0.png';
  let cursorImgLoaded = false;
  cursorImg.onload = () => { cursorImgLoaded = true; };
  const virtualMouse = { x: 0, y: 0 };
  let isPointerLocked = false;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    cursorOverlay.width = window.innerWidth;
    cursorOverlay.height = window.innerHeight;
    dragOverlay.width = window.innerWidth;
    dragOverlay.height = window.innerHeight;
    // Recenter virtual mouse on resize
    virtualMouse.x = canvas.width / 2;
    virtualMouse.y = canvas.height / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  // Initialize Simple Minimap System
  function initMinimap() {
    minimap = document.getElementById('minimap');
    minimapCanvas = document.getElementById('minimapCanvas');
    minimapCtx = minimapCanvas.getContext('2d');
    
    // Set canvas size
    minimapCanvas.width = 200;
    minimapCanvas.height = 200;
    
    // Create tooltip element
    minimapTooltip = document.createElement('div');
    minimapTooltip.className = 'minimap-tooltip';
    document.body.appendChild(minimapTooltip);
    
    // Setup minimap interaction
    setupMinimapInteraction();
    
    console.log('Simple Minimap System initialized');
  }
  
  function setupMinimapInteraction() {
    minimapCanvas.addEventListener('mousemove', (e) => {
      const rect = minimapCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Check what element is under cursor
      const element = getMinimapElementAt(x, y);
      if (element !== minimapHoveredElement) {
        minimapHoveredElement = element;
        updateMinimapTooltip(element, x, y);
      }
    });
    
    minimapCanvas.addEventListener('click', (e) => {
      const rect = minimapCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Handle minimap clicks for navigation
      handleMinimapClick(x, y);
    });
    
    minimapCanvas.addEventListener('mouseleave', () => {
      minimapHoveredElement = null;
      minimapTooltip.classList.remove('visible');
    });
  }
  
  function getMinimapElementAt(x, y) {
    const canvasX = (x / minimapCanvas.width) * 2 - 1; // -1 to 1
    const canvasY = (y / minimapCanvas.height) * 2 - 1; // -1 to 1
    
    // Convert to world coordinates
    const worldX = canvasX * (realmSize.width / 2) * minimapZoom;
    const worldY = canvasY * (realmSize.height / 2) * minimapZoom;
    
    // Check players
    for (const player of players) {
      const distance = Math.hypot(player.x - worldX, player.y - worldY);
      if (distance < 20) return { type: 'player', data: player };
    }
    
    // Check spawners
    for (const spawner of spawners) {
      const distance = Math.hypot(spawner.x - worldX, spawner.y - worldY);
      if (distance < 30) return { type: 'spawner', data: spawner };
    }
    
    // Check drones
    for (const mob of mobs) {
      const distance = Math.hypot(mob.x - worldX, mob.y - worldY);
      if (distance < 15) return { type: 'drone', data: mob };
    }
    
    // Check portals
    for (const portal of portals) {
      const distance = Math.hypot(portal.x - worldX, portal.y - worldY);
      if (distance < 25) return { type: 'portal', data: portal };
    }
    
    return null;
  }
  
  function updateMinimapTooltip(element, x, y) {
    if (!element) {
      minimapTooltip.classList.remove('visible');
      return;
    }
    
    const rect = minimap.getBoundingClientRect();
    minimapTooltip.style.left = (rect.left + x + 10) + 'px';
    minimapTooltip.style.top = (rect.top + y - 10) + 'px';
    
    let text = '';
    switch (element.type) {
      case 'player':
        text = `${element.data.username} (${Math.round(element.data.x)}, ${Math.round(element.data.y)})`;
        break;
      case 'spawner':
        text = `${element.data.config.name} - ${element.data.droneCount} drones`;
        break;
      case 'drone':
        text = `${element.data.type} - ${element.data.state} (${Math.round(element.data.health)}/${element.data.maxHealth})`;
        break;
      case 'portal':
        text = `Portal to ${element.data.toRealm || 'Unknown'}`;
        break;
    }
    
    minimapTooltip.textContent = text;
    minimapTooltip.classList.add('visible');
  }
  
  function handleMinimapClick(x, y) {
    const canvasX = (x / minimapCanvas.width) * 2 - 1;
    const canvasY = (y / minimapCanvas.height) * 2 - 1;
    
    const worldX = canvasX * (realmSize.width / 2) * minimapZoom;
    const worldY = canvasY * (realmSize.height / 2) * minimapZoom;
    
    // Center camera on clicked location
    camera.x = worldX;
    camera.y = worldY;
    
    // Show message
    showMessage(`Moved to (${Math.round(worldX)}, ${Math.round(worldY)})`);
  }
  
  // Render the simple minimap
  function renderMinimap() {
    if (!minimapCtx) return;
    
    // Clear canvas
    minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    
    // Draw background grid
    drawMinimapGrid();
    
    // Draw realm boundary
    drawMinimapBoundary();
    
    // Draw portals
    drawMinimapPortals();
    
    // Draw spawners
    drawMinimapSpawners();
    
    // Draw drones
    drawMinimapDrones();
    
    // Draw players
    drawMinimapPlayers();
  }
  
  function drawMinimapGrid() {
    const gridSize = 32;
    const gridColor = 'rgba(0, 255, 255, 0.1)';
    
    minimapCtx.strokeStyle = gridColor;
    minimapCtx.lineWidth = 0.5;
    
    for (let x = 0; x <= minimapCanvas.width; x += gridSize) {
      minimapCtx.beginPath();
      minimapCtx.moveTo(x, 0);
      minimapCtx.lineTo(x, minimapCanvas.height);
      minimapCtx.stroke();
    }
    
    for (let y = 0; y <= minimapCanvas.height; y += gridSize) {
      minimapCtx.beginPath();
      minimapCtx.moveTo(0, y);
      minimapCtx.lineTo(minimapCanvas.width, y);
      minimapCtx.stroke();
    }
  }
  
  function drawMinimapBoundary() {
    const boundaryColor = 'rgba(0, 255, 255, 0.3)';
    const boundaryWidth = 2;
    
    minimapCtx.strokeStyle = boundaryColor;
    minimapCtx.lineWidth = boundaryWidth;
    minimapCtx.strokeRect(0, 0, minimapCanvas.width, minimapCanvas.height);
  }
  
  function drawMinimapPortals() {
    for (const portal of portals) {
      const x = worldToMinimapX(portal.x);
      const y = worldToMinimapY(portal.y);
      
      if (x >= 0 && x < minimapCanvas.width && y >= 0 && y < minimapCanvas.height) {
        // Draw portal icon
        minimapCtx.fillStyle = '#0066ff';
        minimapCtx.strokeStyle = '#ffffff';
        minimapCtx.lineWidth = 1;
        
        minimapCtx.beginPath();
        minimapCtx.arc(x, y, 6, 0, Math.PI * 2);
        minimapCtx.fill();
        minimapCtx.stroke();
        
        // Draw portal label
        minimapCtx.fillStyle = '#ffffff';
        minimapCtx.font = '8px Roboto Mono';
        minimapCtx.textAlign = 'center';
        minimapCtx.fillText('P', x, y + 3);
      }
    }
  }
  
  function drawMinimapSpawners() {
    for (const spawner of spawners) {
      const x = worldToMinimapX(spawner.x);
      const y = worldToMinimapY(spawner.y);
      
      if (x >= 0 && x < minimapCanvas.width && y >= 0 && y < minimapCanvas.height) {
        // Draw spawner icon
        minimapCtx.fillStyle = '#ff6600';
        minimapCtx.strokeStyle = '#ffffff';
        minimapCtx.lineWidth = 1;
        
        minimapCtx.beginPath();
        minimapCtx.arc(x, y, 8, 0, Math.PI * 2);
        minimapCtx.fill();
        minimapCtx.stroke();
        
        // Draw spawner label
        minimapCtx.fillStyle = '#ffffff';
        minimapCtx.font = '8px Roboto Mono';
        minimapCtx.textAlign = 'center';
        minimapCtx.fillText('S', x, y + 3);
        
        // Draw spawn radius
        const radius = worldToMinimapDistance(spawner.config.spawnRadius);
        minimapCtx.strokeStyle = 'rgba(255, 102, 0, 0.3)';
        minimapCtx.lineWidth = 1;
        minimapCtx.beginPath();
        minimapCtx.arc(x, y, radius, 0, Math.PI * 2);
        minimapCtx.stroke();
      }
    }
  }
  
  function drawMinimapDrones() {
    for (const mob of mobs) {
      const x = worldToMinimapX(mob.x);
      const y = worldToMinimapY(mob.y);
      
      if (x >= 0 && x < minimapCanvas.width && y >= 0 && y < minimapCanvas.height) {
        // Choose color based on drone type and state
        let color = '#ff0066';
        if (mob.type === 'drone_l1') color = '#ff0066';
        else if (mob.type === 'drone_l2') color = '#ff6600';
        else if (mob.type === 'drone_l3') color = '#ff0066';
        
        // Dim if not in combat
        if (mob.state === 'PATROL' || mob.state === 'IDLE') {
          color = color + '80'; // Add transparency
        }
        
        minimapCtx.fillStyle = color;
        minimapCtx.strokeStyle = '#ffffff';
        minimapCtx.lineWidth = 1;
        
        minimapCtx.beginPath();
        minimapCtx.arc(x, y, 4, 0, Math.PI * 2);
        minimapCtx.fill();
        minimapCtx.stroke();
        
        // Draw direction indicator for moving drones
        if (mob.vx !== 0 || mob.vy !== 0) {
          const angle = Math.atan2(mob.vy, mob.vx);
          const endX = x + Math.cos(angle) * 8;
          const endY = y + Math.sin(angle) * 8;
          
          minimapCtx.strokeStyle = '#ffffff';
          minimapCtx.lineWidth = 1;
          minimapCtx.beginPath();
          minimapCtx.moveTo(x, y);
          minimapCtx.lineTo(endX, endY);
          minimapCtx.stroke();
        }
      }
    }
  }
  
  function drawMinimapPlayers() {
    // Draw other players
    for (const player of players) {
      if (player.username === localPlayer.username) continue;
      
      const x = worldToMinimapX(player.x);
      const y = worldToMinimapY(player.y);
      
      if (x >= 0 && x < minimapCanvas.width && y >= 0 && y < minimapCanvas.height) {
        minimapCtx.fillStyle = '#00ff00';
        minimapCtx.strokeStyle = '#ffffff';
        minimapCtx.lineWidth = 1;
        
        minimapCtx.beginPath();
        minimapCtx.arc(x, y, 4, 0, Math.PI * 2);
        minimapCtx.fill();
        minimapCtx.stroke();
      }
    }
    
    // Draw local player (centered)
    const centerX = minimapCanvas.width / 2;
    const centerY = minimapCanvas.height / 2;
    
    minimapCtx.fillStyle = '#00ff00';
    minimapCtx.strokeStyle = '#ffffff';
    minimapCtx.lineWidth = 2;
    
    minimapCtx.beginPath();
    minimapCtx.arc(centerX, centerY, 6, 0, Math.PI * 2);
    minimapCtx.fill();
    minimapCtx.stroke();
    
    // Simple direction indicator
    const angle = input.angle;
    const endX = centerX + Math.cos(angle) * 10;
    const endY = centerY + Math.sin(angle) * 10;
    
    minimapCtx.strokeStyle = '#ffffff';
    minimapCtx.lineWidth = 2;
    minimapCtx.beginPath();
    minimapCtx.moveTo(centerX, centerY);
    minimapCtx.lineTo(endX, endY);
    minimapCtx.stroke();
  }
  

  
  // Coordinate conversion helpers
  function worldToMinimapX(worldX) {
    return (worldX / (realmSize.width / 2)) * (minimapCanvas.width / 2) + (minimapCanvas.width / 2);
  }
  
  function worldToMinimapY(worldY) {
    return (worldY / (realmSize.height / 2)) * (minimapCanvas.height / 2) + (minimapCanvas.height / 2);
  }
  
  function worldToMinimapDistance(worldDistance) {
    return (worldDistance / (realmSize.width / 2)) * (minimapCanvas.width / 2);
  }

  function promptUsername() {
    let name = localStorage.getItem('venatus_username') || '';
    if (!name) {
      name = window.prompt('Enter username');
    }
    if (!name) {
      name = `guest_${Math.random().toString(36).slice(2, 8)}`;
    }
    localStorage.setItem('venatus_username', name);
    return name;
  }

  function setupPointerLock() {
    // No pointer lock; use system cursor and absolute mouse coordinates
    document.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      virtualMouse.x = e.clientX - rect.left;
      virtualMouse.y = e.clientY - rect.top;

        const realmX = camera.x + virtualMouse.x - canvas.width / 2;
  const realmY = camera.y + virtualMouse.y - canvas.height / 2;
  input.angle = Math.atan2(realmY - localPlayer.y, realmX - localPlayer.x);
      throttledSendInput();
    });
    // Ensure overlay is hidden since we are not using pointer lock
    isPointerLocked = false;
    if (cursorOverlay) cursorOverlay.style.display = 'none';
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background tiles - only render tiles that actually exist in the map
    const tileSize = 64; // Match TILE_SIZE from server
    
    // Render simple void world with grid lines
    const gridSize = 64; // 64x64 pixel grid
    const worldRadius = 1200; // 1200 pixel radius around center
    
    // Calculate visible world bounds
    const visibleStartX = Math.max(-worldRadius, camera.x - canvas.width / 2);
    const visibleEndX = Math.min(worldRadius, camera.x + canvas.width / 2);
    const visibleStartY = Math.max(-worldRadius, camera.y - canvas.height / 2);
    const visibleEndY = Math.min(worldRadius, camera.y + canvas.height / 2);
    
    // Render grid lines
    ctx.strokeStyle = '#333333'; // Dark gray grid lines
    ctx.lineWidth = 1;
    
    // Vertical grid lines
    for (let x = Math.floor(visibleStartX / gridSize) * gridSize; x <= visibleEndX; x += gridSize) {
      const screenX = (x - camera.x) + canvas.width / 2;
      ctx.beginPath();
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, canvas.height);
      ctx.stroke();
    }
    
    // Horizontal grid lines
    for (let y = Math.floor(visibleStartY / gridSize) * gridSize; y <= visibleEndY; y += gridSize) {
      const screenY = (y - camera.y) + canvas.height / 2;
      ctx.beginPath();
      ctx.moveTo(0, screenY);
      ctx.lineTo(canvas.width, screenY);
      ctx.stroke();
    }

    // Draw spawners
    for (const spawner of spawners) {
      renderSpawner(ctx, spawner);
    }
    
    // Draw drones/mobs
    for (const mob of mobs) {
      drawMob(ctx, mob);
    }

    // Portals
    ctx.fillStyle = 'rgba(0,255,255,0.25)';
    ctx.strokeStyle = '#00ffff';
    for (const p of portals) {
      const sx = (p.x - camera.x) + canvas.width / 2;
      const sy = (p.y - camera.y) + canvas.height / 2;
      ctx.beginPath();
      ctx.rect(sx - 8, sy - 8, 16, 16);
      ctx.fill();
      ctx.stroke();
    }

    // Players
    for (const p of players) {
      const isLocal = p.username === username;
      const sx = (p.x - camera.x) + canvas.width / 2;
      const sy = (p.y - camera.y) + canvas.height / 2;
      ctx.beginPath();
      ctx.fillStyle = isLocal ? '#00ffff' : '#66ffff';
      ctx.arc(sx, sy, isLocal ? 10 : 8, 0, Math.PI * 2);
      ctx.fill();

      // Nameplate
      ctx.fillStyle = '#e6faff';
      ctx.font = '12px Roboto Mono';
      ctx.textAlign = 'center';
      ctx.fillText(p.username, sx, sy - 14);

      // Position energy bar above hotbar (not following player)
      if (isLocal) {
        // Position above the hotbar area
        const hotbarTop = window.innerHeight - 120; // Hotbar is at bottom, move up 120px
        energyIndicator.style.left = '50%';
        energyIndicator.style.top = `${hotbarTop - 40}px`; // 40px above hotbar
        energyIndicator.style.transform = 'translateX(-50%)'; // Center horizontally
      }
    }

    // Projectiles
    const projs = window.__projectiles || [];
    ctx.fillStyle = '#00ffff';
    for (const pr of projs) {
      const sx = (pr.x - camera.x) + canvas.width / 2;
      const sy = (pr.y - camera.y) + canvas.height / 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }


    
    // Hit effects and damage numbers
    renderHitEffects(ctx);

    // Debug info - show mob count and positions
    if (mobs.length > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px Roboto Mono';
      ctx.textAlign = 'left';
      ctx.fillText(`Mobs: ${mobs.length}`, 10, 30);
      
      // Show first few mob positions
      for (let i = 0; i < Math.min(3, mobs.length); i++) {
        const mob = mobs[i];
        const sx = (mob.x - camera.x) + canvas.width / 2;
        const sy = (mob.y - camera.y) + canvas.height / 2;
        
        // Draw a small indicator if mob is off-screen
        if (sx < -50 || sx > canvas.width + 50 || sy < -50 || sy > canvas.height + 50) {
          const edgeX = Math.max(50, Math.min(canvas.width - 50, sx));
          const edgeY = Math.max(50, Math.min(canvas.height - 50, sy));
          
          ctx.fillStyle = '#ff6b6b';
          ctx.beginPath();
          ctx.arc(edgeX, edgeY, 8, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.fillStyle = '#ffffff';
          ctx.font = '10px Roboto Mono';
          ctx.textAlign = 'center';
          ctx.fillText(`${mob.type}`, edgeX, edgeY + 20);
        }
      }
    }

    // Cursor rendered above everything only when pointer locked
    if (isPointerLocked) {
      cursorCtx.clearRect(0, 0, cursorOverlay.width, cursorOverlay.height);
      if (cursorImgLoaded) {
        const size = 32; // draw at 32x32
        cursorCtx.imageSmoothingEnabled = false;
        cursorCtx.drawImage(cursorImg, virtualMouse.x - size / 2, virtualMouse.y - size / 2, size, size);
      } else {
        cursorCtx.beginPath();
        cursorCtx.strokeStyle = '#00ffff';
        cursorCtx.lineWidth = 2;
        cursorCtx.moveTo(virtualMouse.x - 10, virtualMouse.y);
        cursorCtx.lineTo(virtualMouse.x + 10, virtualMouse.y);
        cursorCtx.moveTo(virtualMouse.x, virtualMouse.y - 10);
        cursorCtx.lineTo(virtualMouse.x, virtualMouse.y + 10);
        cursorCtx.stroke();
      }
    }
  }
  // Simple muzzle flash effect for local player
  let lastFiredAt = 0;
  let lastFrameTime = performance.now();

  function updateCamera() {
    camera.x = localPlayer.x;
    camera.y = localPlayer.y;
  }
  
  function updateCoordinateDisplay() {
    if (coordinateDisplay) {
      coordinateDisplay.textContent = `X: ${localPlayer.x.toFixed(1)} Y: ${localPlayer.y.toFixed(1)}`;
    }
    
    // Update minimap location display
    if (minimap) {
      const locationElement = minimap.querySelector('.minimap-location');
      if (locationElement) {
        locationElement.textContent = `(${Math.round(localPlayer.x)}, ${Math.round(localPlayer.y)})`;
      }
    }
  }

  function gameLoop() {
    updateCamera();
    updateCoordinateDisplay();
    
    // Update hit effects with delta time
    const now = performance.now();
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    updateHitEffects(dt);
    
    draw();
    
    // Render simple minimap
    renderMinimap();
    
    requestAnimationFrame(gameLoop);
  }

  // Input handling
  function toggleGear() {
    gearContainer.classList.toggle('hidden');
    if (!gearContainer.classList.contains('hidden')) {
      renderGearUI();
    }
  }

  // Ensure Tab toggles gear (now that CSS specificity is fixed)
  function isTabEvent(e) {
    return e.code === 'Tab' || e.key === 'Tab' || e.keyCode === 9;
  }
  // Only use window listener to avoid duplicate handling
  window.addEventListener('keydown', (e) => {
    if (isTabEvent(e)) {
      e.preventDefault();
      toggleGear();
    }
  }, true);

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyW') input.up = true;
    if (e.code === 'KeyS') input.down = true;
    if (e.code === 'KeyA') input.left = true;
    if (e.code === 'KeyD') input.right = true;
    // Tab handled above. Remove KeyI shortcut per request.
    if (e.code === 'KeyF') {
      socket.emit('requestTravel');
    }
    if (e.code === 'BracketLeft') {
      activeHotbarIndex = (activeHotbarIndex + 3) % 4;
      updateHotbarActive();
    }
    if (e.code === 'BracketRight') {
      activeHotbarIndex = (activeHotbarIndex + 1) % 4;
      updateHotbarActive();
    }
    sendInputImmediate();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW') input.up = false;
    if (e.code === 'KeyS') input.down = false;
    if (e.code === 'KeyA') input.left = false;
    if (e.code === 'KeyD') input.right = false;
    sendInputImmediate();
  });
  window.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dir = Math.sign(e.deltaY);
    if (dir > 0) activeHotbarIndex = (activeHotbarIndex + 1) % 4;
    if (dir < 0) activeHotbarIndex = (activeHotbarIndex + 3) % 4;
    updateHotbarActive();
    socket.emit('activeHotbar', { index: activeHotbarIndex });
  }, { passive: false });

  let lastSentAt = 0;
  function throttledSendInput() {
    const now = performance.now();
    if (now - lastSentAt < 33) return; // ~30 Hz
    lastSentAt = now;
    socket.emit('input', input);
  }

  function sendInputImmediate() {
    socket.emit('input', input);
  }

  // For testing: automatically use test_builder to get weapons
  username = 'test_builder';
  
  // Clear any stored username to ensure we always use test_builder
  localStorage.removeItem('venatus_username');
  
  const socket = io({ auth: { username } });
  socket.on('fired', () => { lastFiredAt = performance.now(); });
  


  socket.on('connect_error', (err) => {
    showMessage('Connection error: ' + (err?.message || 'unknown'));
  });
  
  socket.on('disconnect', () => {
    showMessage('Disconnected from server');
  });
  
  socket.on('reconnect', () => {
    showMessage('Reconnected to server');
    // Force gear refresh on reconnect
    if (gear && gear.inventory && gear.inventory.some(item => item !== null)) {
      console.log('Reconnect: Refreshing gear UI');
      renderGearUI();
      updateHotbarActive();
    }
  });

  socket.on('errorMessage', (msg) => showMessage(msg));

  socket.on('init', (data) => {
    realm = data.realm;
    realmSize = data.realmSize;
    realmConfig = data.realmConfig;
    physics = data.physics;
    localPlayer.x = data.x;
    
    // Update minimap title
    if (minimap) {
      const titleElement = minimap.querySelector('.minimap-title');
      if (titleElement) {
        titleElement.textContent = realm.charAt(0).toUpperCase() + realm.slice(1);
      }
    }
    localPlayer.y = data.y;
    
    gear = data.gear || gear;
    
    renderGearUI();
    updateHotbarActive();
    showMessage(`Connected as ${username} in ${realm}`);
    
    // Fallback: if gear exists but UI isn't showing it, force refresh
    setTimeout(() => {
      if (gear && gear.inventory && gear.inventory.some(item => item !== null)) {
        const inventorySlots = document.querySelectorAll('#inventory .slot');
        const hasVisibleItems = Array.from(inventorySlots).some(slot => slot.children.length > 0);
        
        if (!hasVisibleItems) {
          console.log('Fallback: Gear exists but not visible, forcing refresh');
          renderGearUI();
          updateHotbarActive();
        }
      }
    }, 1000); // Wait 1 second after init
  });

  socket.on('realmChanged', (data) => {
    realm = data.realm;
    localPlayer.x = data.x;
    localPlayer.y = data.y;
    showMessage(`Travelled to ${realm}`);
  });

  socket.on('state', (snapshot) => {
    players = snapshot.players || [];
    portals = snapshot.portals || [];
    mobs = snapshot.mobs || []; // Update mobs array
    spawners = snapshot.spawners || []; // Update spawners array
    
    // Debug: check mob types being received
    if (mobs.length > 0) {
      console.log('Mob types received:', mobs.map(m => ({ id: m.id, type: m.type, shape: m.shape, angle: m.angle, currentFace: m.currentFace })));
    }
    
    console.log('Received state update:', { 
      players: players.length, 
      portals: portals.length, 
      mobs: mobs.length,
      spawners: snapshot.spawners.length,
      mobsData: mobs 
    });
    
    const me = players.find((p) => p.username === username);
    if (me) {
      localPlayer.x = me.x;
      localPlayer.y = me.y;
      
      // Update realm if it changed
      if (me.realm && me.realm !== realm) {
        realm = me.realm;
        if (minimap) {
          const titleElement = minimap.querySelector('.minimap-title');
          if (titleElement) {
            titleElement.textContent = realm.charAt(0).toUpperCase() + realm.slice(1);
          }
        }
      }
      
      // Update gear if it changed
      if (me.gear && JSON.stringify(me.gear) !== JSON.stringify(gear)) {
        gear = me.gear;
        renderGearUI();
        updateHotbarActive();
      }
    }

    // Projectiles snapshot
    window.__projectiles = Array.isArray(snapshot.projectiles) ? snapshot.projectiles : [];

    // Portal proximity prompt
    let nearPortal = false;
    let currentPortal = null;
    for (const p of portals) {
      const d = Math.hypot(p.x - localPlayer.x, p.y - localPlayer.y);
      if (d <= 40) { 
        nearPortal = true; 
        currentPortal = p;
        break; 
      }
    }
    if (nearPortal && currentPortal) {
      showMessage(`Press [F] to travel to ${currentPortal.toRealm} realm`);
    }
  });

  function showMessage(text) {
    messageBox.textContent = text;
  }

  setupPointerLock();
  requestAnimationFrame(gameLoop);

  // ----- UI rendering for inventory/equipment -----
  function updateHotbarActive() {
    const slots = hotbarPanel.querySelectorAll('.slot');
    slots.forEach((el, i) => {
      if (i === activeHotbarIndex) el.classList.add('active');
      else el.classList.remove('active');
    });
  }

  function renderGearUI() {
    // Debug logging removed - system is working correctly
    
    // equipment grid (7 slots)
    const eqOrder = ['shoulderLeft', 'head', 'shoulderRight', 'chest', 'backpack', 'boots'];
    equipmentGrid.innerHTML = '';
    for (const slot of eqOrder) {
      const el = document.createElement('div');
      el.className = `slot eq-${slot}`;
      el.dataset.eq = slot;
      addDragHandlers(el, { kind: 'equipment', slot });
      equipmentGrid.appendChild(el);
      renderSlotContent(el, gear.equipment?.[slot] || null);
    }

    // inventory grid (dynamic capacity)
    inventoryGrid.innerHTML = '';
    const capacity = gear.inventory?.length || 0;
    for (let i = 0; i < capacity; i += 1) {
      const el = document.createElement('div');
      el.className = 'slot';
      el.dataset.index = String(i);
      addDragHandlers(el, { kind: 'inventory', index: i });
      inventoryGrid.appendChild(el);
      const item = gear.inventory[i];
      renderSlotContent(el, item);
    }

    // hotbar items
    renderHotbarUI();

    // Disable native dragstart on all slots/images to avoid browser ghosts
    document.querySelectorAll('#inventory .slot, #hotbar .slot, #equipmentGrid .slot, #inventory .slot img, #hotbar .slot img, #equipmentGrid .slot img')
      .forEach((n) => n.addEventListener('dragstart', (ev) => ev.preventDefault()));
  }

  function renderHotbarUI() {
    const hotbarSlots = hotbarPanel.querySelectorAll('.slot');
    
    hotbarSlots.forEach((el, i) => {
      el.innerHTML = '';
      el.dataset.kind = 'hotbar';
      el.dataset.index = String(i);
      addDragHandlers(el, { kind: 'hotbar', index: i });
      
      const item = gear.hotbar?.[i] || null;
      renderSlotContent(el, item);
    });
  }

  function renderSlotContent(el, item) {
    el.textContent = '';
    if (!item) return;
    
    const iconPath = ITEM_ICONS[item.id];
    if (iconPath) {
      const img = document.createElement('img');
      img.src = iconPath + `?v=${Date.now()}`; // bust cache during dev
      img.alt = item.id;
      img.draggable = false;
      img.style.width = `${SLOT_ICON_SIZE}px`;
      img.style.height = `${SLOT_ICON_SIZE}px`;
      img.style.pointerEvents = 'none';
      el.appendChild(img);
    } else {
      const label = document.createElement('div');
      label.style.fontSize = '9px';
      label.style.color = '#e6faff';
      label.style.textAlign = 'center';
      label.style.paddingTop = '16px';
      label.textContent = item.id;
      el.appendChild(label);
    }
  }

  // ----- Pointer-based drag and drop -----
  function addDragHandlers(el, originRef) {
    if (el.dataset.pointerHandlersAttached === '1') return;
    el.dataset.pointerHandlersAttached = '1';
    el.addEventListener('pointerdown', (e) => {
      // Do not start drag when clicking inside empty slot
      const ref = originRef;
      let item = null;
      if (ref.kind === 'inventory') item = gear.inventory[ref.index];
      if (ref.kind === 'equipment') item = gear.equipment[ref.slot];
      if (ref.kind === 'hotbar') item = gear.hotbar[ref.index];
      if (!item) return;
      const iconPath = ITEM_ICONS[item.id];
      if (!iconPath) return;
      e.preventDefault();

      const slotImg = el.querySelector('img');
      let imgEl = slotImg || ICON_CACHE.get(item.id);
      if (!imgEl || !imgEl.complete) {
        imgEl = new Image();
        imgEl.src = iconPath;
        ICON_CACHE.set(item.id, imgEl);
      }

      el.classList.add('slot-drag-source');
      document.documentElement.classList.add('dragging-cursor');
      dragOverlay.style.display = 'block';

      const move = (ev) => {
        dragCtx.clearRect(0, 0, dragOverlay.width, dragOverlay.height);
        dragCtx.imageSmoothingEnabled = false;
        const half = SLOT_ICON_SIZE / 2;
        dragCtx.drawImage(imgEl, ev.clientX - half, ev.clientY - half, SLOT_ICON_SIZE, SLOT_ICON_SIZE);
      };
      const cleanupAll = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up, true);
        window.removeEventListener('blur', cancelDrag, true);
        document.documentElement.classList.remove('dragging-cursor');
        dragCtx.clearRect(0, 0, dragOverlay.width, dragOverlay.height);
        dragOverlay.style.display = 'none';
        el.classList.remove('slot-drag-source');
      };
      const cancelDrag = () => {
        cleanupAll();
      };
      const up = (ev) => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up, true);
        window.removeEventListener('blur', cancelDrag, true);
        document.documentElement.classList.remove('dragging-cursor');
        dragCtx.clearRect(0, 0, dragOverlay.width, dragOverlay.height);
        dragOverlay.style.display = 'none';
        el.classList.remove('slot-drag-source');

        // Determine drop target
        const dropTarget = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.slot');
        if (!dropTarget) return;
        const kind = dropTarget.dataset.kind || (dropTarget.closest('#inventory') ? 'inventory' : dropTarget.closest('#hotbar') ? 'hotbar' : dropTarget.dataset.eq ? 'equipment' : undefined);
        let to = null;
        if (kind === 'inventory') to = { kind: 'inventory', index: Number(dropTarget.dataset.index) };
        else if (kind === 'hotbar') to = { kind: 'hotbar', index: Number(dropTarget.dataset.index) };
        else if (dropTarget.dataset.eq) to = { kind: 'equipment', slot: dropTarget.dataset.eq };
        if (!to) return;

        socket.emit('gearMove', { from: originRef, to }, (resp) => {
          if (!resp?.ok) {
            showMessage(`Move failed: ${resp?.error || 'unknown'}`);
            return;
          }
          gear = resp.gear;
          renderGearUI();
        });
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up, true);
      window.addEventListener('blur', cancelDrag, true);
    });
  }

  // Fire on left click if active hotbar item is a weapon
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const active = gear.hotbar?.[activeHotbarIndex];
    if (!active) return;
    // Allow firing regardless of cursor over UI because canvas is underneath UI
    socket.emit('fire');
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    socket.emit('fireStop');
  });

  // Energy indicator management (0..1)
  socket.on('heat', (payload) => {
    const v = Math.max(0, Math.min(1, Number(payload?.value) || 0));
    const oh = Boolean(payload?.overheated);
    energyFill.style.width = `${v * 100}%`;
    energyIndicator.classList.toggle('overheated', oh);
  });

  // Mob rendering functions
  function renderMob(ctx, mob) {
    console.log('Rendering mob:', mob);
    const screenX = mob.x - camera.x + canvas.width / 2;
    const screenY = mob.y - camera.y + canvas.height / 2;
    
    // Skip if off-screen
    if (screenX < -100 || screenX > canvas.width + 100 || 
        screenY < -100 || screenY > canvas.height + 100) {
      console.log('Mob off-screen, skipping:', { screenX, screenY, mobX: mob.x, mobY: mob.y });
      return;
    }
    
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(mob.angle);
    
    // Render based on shape
    if (mob.shape === 'triangle') {
      renderTriangleMob(ctx, mob);
    } else if (mob.shape === 'square') {
      renderSquareMob(ctx, mob);
    } else if (mob.shape === 'hexagon') {
      renderHexagonMob(ctx, mob);
    } else {
      console.log('Unknown mob shape:', mob.shape);
    }
    
    // Render health bar
    renderMobHealthBar(ctx, mob);
    
    // Render AI state indicator
    renderAIStateIndicator(ctx, mob);
    
    ctx.restore();
  }
  
  function renderTriangleMob(ctx, mob) {
    const size = mob.size;
    const halfSize = size / 2;
    
    // Draw triangle
    ctx.fillStyle = mob.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    ctx.moveTo(0, -halfSize); // Top point
    ctx.lineTo(-halfSize, halfSize); // Bottom left
    ctx.lineTo(halfSize, halfSize); // Bottom right
    ctx.closePath();
    
    ctx.fill();
    ctx.stroke();
    
    // No face indicators - clean mob appearance
  }
  
  function renderSquareMob(ctx, mob) {
    const size = mob.size;
    const halfSize = size / 2;
    
    // Draw square
    ctx.fillStyle = mob.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    
    ctx.fillRect(-halfSize, -halfSize, size, size);
    ctx.strokeRect(-halfSize, -halfSize, size, size);
    
    // No face indicators - clean mob appearance
  }
  
  function renderHexagonMob(ctx, mob) {
    const size = mob.size;
    const halfSize = size / 2;
    
    // Draw hexagon
    ctx.fillStyle = mob.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * 2 * Math.PI;
      const x = Math.cos(angle) * halfSize;
      const y = Math.sin(angle) * halfSize;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    
    ctx.fill();
    ctx.stroke();
    
    // No face indicators - clean mob appearance
  }
  
  function renderMobHealthBar(ctx, mob) {
    const barWidth = mob.size;
    const barHeight = 6;
    const barY = -mob.size / 2 - 15;
    
    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(-barWidth / 2, barY, barWidth, barHeight);
    
    // Health bar
    const healthPercent = mob.health / mob.maxHealth;
    ctx.fillStyle = healthPercent > 0.5 ? '#4CAF50' : healthPercent > 0.25 ? '#FF9800' : '#F44336';
    ctx.fillRect(-barWidth / 2, barY, barWidth * healthPercent, barHeight);
    
    // Border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(-barWidth / 2, barY, barWidth, barHeight);
  }
  
  function renderAIStateIndicator(ctx, mob) {
    const indicatorY = -mob.size / 2 - 35;
    
    // AI State text
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px Roboto Mono';
    ctx.textAlign = 'center';
    ctx.fillText(mob.aiState || 'unknown', 0, indicatorY);
    
    // Behavior type
    ctx.fillStyle = '#cccccc';
    ctx.font = '8px Roboto Mono';
    ctx.fillText(`${mob.behavior} ${mob.combatStyle}`, 0, indicatorY + 12);
  }
  
  // Hit effect system
  function createHitEffect(x, y, damage) {
    hitEffects.push({
      x: x,
      y: y,
      damage: damage,
      life: 1.0, // 1 second
      scale: 1.0,
      alpha: 1.0
    });
    
    // Add damage number
    damageNumbers.push({
      x: x + (Math.random() - 0.5) * 40, // Randomize position slightly
      y: y - 30,
      damage: damage,
      life: 2.0, // 2 seconds
      velocity: { x: (Math.random() - 0.5) * 50, y: -100 }, // Float upward
      alpha: 1.0
    });
  }
  
  function updateHitEffects(dt) {
    // Update hit effects
    for (let i = hitEffects.length - 1; i >= 0; i--) {
      const effect = hitEffects[i];
      effect.life -= dt;
      effect.scale = 1.0 + (1.0 - effect.life) * 0.5; // Grow slightly
      effect.alpha = effect.life;
      
      if (effect.life <= 0) {
        hitEffects.splice(i, 1);
      }
    }
    
    // Update damage numbers
    for (let i = damageNumbers.length - 1; i >= 0; i--) {
      const number = damageNumbers[i];
      number.life -= dt;
      number.x += number.velocity.x * dt;
      number.y += number.velocity.y * dt;
      number.velocity.y += 200 * dt; // Gravity
      number.alpha = Math.min(1.0, number.life * 2); // Fade out
      
      if (number.life <= 0) {
        damageNumbers.splice(i, 1);
      }
    }
  }
  
  function renderHitEffects(ctx) {
    // Render hit effects
    for (const effect of hitEffects) {
      const screenX = effect.x - camera.x + canvas.width / 2;
      const screenY = effect.y - camera.y + canvas.height / 2;
      
      ctx.save();
      ctx.globalAlpha = effect.alpha;
      ctx.translate(screenX, screenY);
      ctx.scale(effect.scale, effect.scale);
      
      // Draw hit effect (expanding circle)
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, 2 * Math.PI);
      ctx.stroke();
      
      ctx.restore();
    }
    
    // Render damage numbers
    for (const number of damageNumbers) {
      const screenX = number.x - camera.x + canvas.width / 2;
      const screenY = number.y - camera.y + canvas.height / 2;
      
      ctx.save();
      ctx.globalAlpha = number.alpha;
      ctx.fillStyle = '#ff0000';
      ctx.font = 'bold 16px Roboto Mono';
      ctx.textAlign = 'center';
      ctx.fillText(number.damage.toString(), screenX, screenY);
      ctx.restore();
    }
  }
  
  // Spawner rendering
  function renderSpawner(ctx, spawner) {
    const screenX = spawner.x - camera.x + canvas.width / 2;
    const screenY = spawner.y - camera.y + canvas.height / 2;
    
    // Only render if on screen
    if (screenX < -100 || screenX > canvas.width + 100 || 
        screenY < -100 || screenY > canvas.height + 100) {
      return;
    }
    
    // Draw spawner base (large circle)
    ctx.save();
    ctx.strokeStyle = spawner.config.color;
    ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    
    // Main spawner circle
    ctx.beginPath();
    ctx.arc(screenX, screenY, 40, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    
    // Inner circle
    ctx.strokeStyle = spawner.config.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screenX, screenY, 25, 0, 2 * Math.PI);
    ctx.stroke();
    
    // Spawner type indicator
    ctx.fillStyle = spawner.config.color;
    ctx.font = 'bold 12px Roboto Mono';
    ctx.textAlign = 'center';
    ctx.fillText(spawner.config.name.split(' ')[2], screenX, screenY + 5); // "Level X"
    
    // Drone count
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px Roboto Mono';
    ctx.fillText(`${spawner.droneCount} drones`, screenX, screenY + 25);
    
    // Spawn radius indicator (faint)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(screenX, screenY, spawner.config.spawnRadius, 0, 2 * Math.PI);
    ctx.stroke();
    
    ctx.restore();
  }
  
  // Drone/mob rendering
  function drawMob(ctx, mob) {
    const screenX = mob.x - camera.x + canvas.width / 2;
    const screenY = mob.y - camera.y + canvas.height / 2;
    
    // Only render if on screen
    if (screenX < -50 || screenX > canvas.width + 50 || 
        screenY < -50 || screenY > canvas.height + 50) {
      return;
    }
    
    ctx.save();
    
    // Choose color based on drone type
    let color = '#ff0066';
    if (mob.type === 'drone_l1') color = '#ff0066';
    else if (mob.type === 'drone_l2') color = '#ff6600';
    else if (mob.type === 'drone_l3') color = '#ff0066';
    
    // Dim if not in combat
    if (mob.state === 'PATROL' || mob.state === 'IDLE') {
      color = color + '80'; // Add transparency
    }
    
    // Draw drone body
    ctx.fillStyle = color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    ctx.arc(screenX, screenY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Draw drone type indicator
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px Roboto Mono';
    ctx.textAlign = 'center';
    ctx.fillText(mob.type.split('_')[1].toUpperCase(), screenX, screenY + 4);
    
    // Draw health bar
    const healthBarWidth = 24;
    const healthBarHeight = 4;
    const healthPercent = mob.health / mob.maxHealth;
    
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(screenX - healthBarWidth/2, screenY - 20, healthBarWidth, healthBarHeight);
    
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(screenX - healthBarWidth/2, screenY - 20, healthBarWidth * healthPercent, healthBarHeight);
    
    // Draw state indicator
    ctx.fillStyle = '#ffffff';
    ctx.font = '8px Roboto Mono';
    ctx.textAlign = 'center';
    ctx.fillText(mob.state, screenX, screenY + 25);
    
    // Draw direction indicator for moving drones
    if (mob.vx !== 0 || mob.vy !== 0) {
      const angle = Math.atan2(mob.vy, mob.vx);
      const endX = screenX + Math.cos(angle) * 20;
      const endY = screenY + Math.sin(angle) * 20;
      
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(screenX, screenY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
    
    ctx.restore();
  }
  
  // Initialize minimap system
  initMinimap();
  
      // Debug: Add manual gear refresh button
    const debugButton = document.createElement('button');
    debugButton.textContent = 'Refresh Gear (Debug)';
    debugButton.style.position = 'fixed';
    debugButton.style.top = '10px';
    debugButton.style.right = '10px';
    debugButton.style.zIndex = '1000';
    debugButton.style.padding = '5px 10px';
    debugButton.style.backgroundColor = '#ff6600';
    debugButton.style.color = 'white';
    debugButton.style.border = 'none';
    debugButton.style.borderRadius = '3px';
    debugButton.style.cursor = 'pointer';
    
    debugButton.onclick = () => {
      console.log('Manual gear refresh triggered');
      console.log('Current gear state:', gear);
      
          // Test gear creation removed - system is working correctly
      
      renderGearUI();
      updateHotbarActive();
    };
    
    document.body.appendChild(debugButton);
    
    // Debug panels removed - system is working correctly
})();


