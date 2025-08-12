(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const cursorOverlay = document.getElementById('cursorOverlay');
  const cursorCtx = cursorOverlay.getContext('2d');
  const dragOverlay = document.getElementById('dragOverlay');
  const dragCtx = dragOverlay.getContext('2d');
  const dragState = { active: false, img: null, size: 48, x: 0, y: 0, cleanup: null };

  const messageBox = document.getElementById('messageBox');
  const gearContainer = document.getElementById('gearContainer');
  const inventoryPanel = document.getElementById('inventory');
  const inventoryGrid = document.getElementById('inventoryGrid');
  const equipmentGrid = document.getElementById('equipmentGrid');
  const hotbarPanel = document.getElementById('hotbar');

  let world = 'nexus';
  let worldSize = { width: 2000, height: 2000 };
  let username = null;
  let physics = { ACCELERATION: 0.1, FRICTION: 0.95, MAX_SPEED: 5 };

  const input = { up: false, down: false, left: false, right: false, angle: 0 };
  const camera = { x: 0, y: 0 };

  let localPlayer = { x: 0, y: 0 };
  let portals = [];
  let players = [];
  let gear = { inventory: [], hotbar: [null, null, null, null], equipment: {} };
  let activeHotbarIndex = 0;

  const ITEM_ICONS = {
    item_pistol_a: '/assets/sprites/items/pistol.png',
  };
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

      const worldX = camera.x + virtualMouse.x - canvas.width / 2;
      const worldY = camera.y + virtualMouse.y - canvas.height / 2;
      input.angle = Math.atan2(worldY - localPlayer.y, worldX - localPlayer.x);
      throttledSendInput();
    });
    // Ensure overlay is hidden since we are not using pointer lock
    isPointerLocked = false;
    if (cursorOverlay) cursorOverlay.style.display = 'none';
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background grid
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(0,255,255,0.15)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    const startX = -((camera.x - canvas.width / 2) % gridSize);
    const startY = -((camera.y - canvas.height / 2) % gridSize);
    for (let x = startX; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = startY; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
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

  function updateCamera() {
    camera.x = localPlayer.x;
    camera.y = localPlayer.y;
  }

  function gameLoop() {
    updateCamera();
    draw();
    requestAnimationFrame(gameLoop);
  }

  // Input handling
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyW') input.up = true;
    if (e.code === 'KeyS') input.down = true;
    if (e.code === 'KeyA') input.left = true;
    if (e.code === 'KeyD') input.right = true;
    if (e.code === 'Tab') {
      e.preventDefault();
      gearContainer.classList.toggle('hidden');
      if (!gearContainer.classList.contains('hidden')) {
        renderGearUI();
      }
    }
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
    throttledSendInput();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW') input.up = false;
    if (e.code === 'KeyS') input.down = false;
    if (e.code === 'KeyA') input.left = false;
    if (e.code === 'KeyD') input.right = false;
    throttledSendInput();
  });
  window.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dir = Math.sign(e.deltaY);
    if (dir > 0) activeHotbarIndex = (activeHotbarIndex + 1) % 4;
    if (dir < 0) activeHotbarIndex = (activeHotbarIndex + 3) % 4;
    updateHotbarActive();
  }, { passive: false });

  let lastSentAt = 0;
  function throttledSendInput() {
    const now = performance.now();
    if (now - lastSentAt < 33) return; // ~30 Hz
    lastSentAt = now;
    socket.emit('input', input);
  }

  username = promptUsername();
  const socket = io({ auth: { username } });

  socket.on('connect_error', (err) => {
    showMessage('Connection error: ' + (err?.message || 'unknown'));
  });

  socket.on('errorMessage', (msg) => showMessage(msg));

  socket.on('init', (data) => {
    world = data.world;
    worldSize = data.worldSize;
    physics = data.physics;
    localPlayer.x = data.x;
    localPlayer.y = data.y;
    gear = data.gear || gear;
    renderGearUI();
    updateHotbarActive();
    showMessage(`Connected as ${username} in ${world}`);
  });

  socket.on('worldChanged', (data) => {
    world = data.world;
    localPlayer.x = data.x;
    localPlayer.y = data.y;
    showMessage(`Travelled to ${world}`);
  });

  socket.on('state', (snapshot) => {
    players = snapshot.players || [];
    portals = snapshot.portals || [];
    const me = players.find((p) => p.username === username);
    if (me) {
      localPlayer.x = me.x;
      localPlayer.y = me.y;
    }

    // Portal proximity prompt
    let nearPortal = false;
    for (const p of portals) {
      const d = Math.hypot(p.x - localPlayer.x, p.y - localPlayer.y);
      if (d <= 40) { nearPortal = true; break; }
    }
    if (nearPortal) {
      showMessage('Press [F] to travel');
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
      renderSlotContent(el, gear.inventory[i]);
    }

    // hotbar items
    renderHotbarUI();
  }

  function renderHotbarUI() {
    const hotbarSlots = hotbarPanel.querySelectorAll('.slot');
    hotbarSlots.forEach((el, i) => {
      el.innerHTML = '';
      addDragHandlers(el, { kind: 'hotbar', index: i });
      renderSlotContent(el, gear.hotbar?.[i] || null);
    });
  }

  function renderSlotContent(el, item) {
    el.textContent = '';
    if (!item) return;
    const iconPath = ITEM_ICONS[item.id];
    if (iconPath) {
      const img = document.createElement('img');
      img.src = iconPath;
      img.alt = item.id;
      img.draggable = false;
      img.style.width = '48px';
      img.style.height = '48px';
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

  // ----- Drag and drop -----
  function addDragHandlers(el, originRef) {
    if (el.dataset.dragHandlersAttached === '1') return;
    el.dataset.dragHandlersAttached = '1';
    el.draggable = true;
    el.addEventListener('mousedown', () => { el.draggable = true; });
    el.addEventListener('dragstart', (e) => {
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/json', JSON.stringify(originRef));
        e.dataTransfer.setData('text/plain', 'move');
      } catch (_) {}
      // Custom drag image: the item sprite at 2x, not the box
      const ref = originRef;
      let item = null;
      if (ref.kind === 'inventory') item = gear.inventory[ref.index];
      if (ref.kind === 'equipment') item = gear.equipment[ref.slot];
      if (ref.kind === 'hotbar') item = gear.hotbar[ref.index];
      if (!item) { e.preventDefault(); return; }
      const iconPath = item ? ITEM_ICONS[item.id] : null;
      if (!iconPath) return;

      // Hide default browser ghost by using a transparent 1x1 image
      try {
        const transparent = document.createElement('canvas');
        transparent.width = 1; transparent.height = 1;
        e.dataTransfer.setDragImage(transparent, 0, 0);
      } catch (_) {}

      // Pick the exact same img element if present for visual parity
      const slotImg = el.querySelector('img');
      let imgEl = slotImg || ICON_CACHE.get(item.id);
      if (!imgEl || !imgEl.complete) {
        imgEl = new Image();
        imgEl.src = iconPath;
        ICON_CACHE.set(item.id, imgEl);
      }

      el.classList.add('slot-drag-source');
      dragOverlay.style.display = 'block';
      dragState.active = true;
      dragState.img = imgEl;
      dragState.size = 48; // same as slot icon size

      const onDragMove = (ev) => {
        ev.preventDefault();
        dragState.x = ev.clientX;
        dragState.y = ev.clientY;
      };
      const onDrag = onDragMove;
      document.addEventListener('dragover', onDragMove);
      document.addEventListener('drag', onDrag, { capture: true });

      const render = () => {
        if (!dragState.active) return;
        dragCtx.clearRect(0, 0, dragOverlay.width, dragOverlay.height);
        if (dragState.img) {
          dragCtx.imageSmoothingEnabled = false;
          const s = dragState.size;
          dragCtx.drawImage(dragState.img, dragState.x - s / 2, dragState.y - s / 2, s, s);
        }
        requestAnimationFrame(render);
      };
      requestAnimationFrame(render);

      const cleanup = () => {
        dragState.active = false;
        document.removeEventListener('dragover', onDragMove);
        document.removeEventListener('drag', onDrag, { capture: true });
        dragCtx.clearRect(0, 0, dragOverlay.width, dragOverlay.height);
        dragOverlay.style.display = 'none';
        el.classList.remove('slot-drag-source');
      };
      const endOnce = () => { cleanup(); el.removeEventListener('dragend', endOnce); };
      el.addEventListener('dragend', endOnce);
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      let from = null;
      try { from = JSON.parse(e.dataTransfer.getData('application/json')); } catch (_) {}
      const to = originRef;
      if (!from || !to) return;
      socket.emit('gearMove', { from, to }, (resp) => {
        if (!resp?.ok) {
          showMessage(`Move failed: ${resp?.error || 'unknown'}`);
          return;
        }
        gear = resp.gear;
        renderGearUI();
      });
    });
    // Ensure drops work when releasing outside valid targets (cancel)
    el.addEventListener('dragend', () => {
      dragCtx.clearRect(0, 0, dragOverlay.width, dragOverlay.height);
      el.classList.remove('slot-drag-source');
    });
  }
})();


