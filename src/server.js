const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const { getUser, saveUser } = require('./config/db');
const { createDefaultUser } = require('./models/userModel');
const {
  ACCELERATION,
  FRICTION,
  MAX_SPEED,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  addPlayerFromRecord,
  removePlayer,
  getPlayer,
  setPlayerInput,
  stepRealm,
  travelIfNearPortal,
  getRealmSnapshot,
  moveGear,
  projectiles,
  getProjectileSpeedForItem,
  getEnergyCostForItem,
  getItemProps,
  spawnInitialMobs,
  getDamageForItem,
  fireProjectile,
  REALM_CONFIG,
} = require('./game/gameState');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Debug: return server-side computed gear for a username
app.get('/debug/gear', async (req, res) => {
  try {
    const username = String(req.query.username || '');
    if (!username) return res.status(400).json({ error: 'missing username' });
    const p = getPlayer(username);
    if (!p) return res.status(404).json({ error: 'player not found' });
    res.json({ username: p.username, inventoryLength: p.gear?.inventory?.length || 0, gear: p.gear });
  } catch (e) {
    res.status(500).json({ error: 'debug failed' });
  }
});

app.post('/debug/reload-gear', express.json(), async (req, res) => {
  try {
    const username = String(req.body?.username || '');
    if (!username) return res.status(400).json({ error: 'missing username' });
    const p = getPlayer(username);
    if (!p) return res.status(404).json({ error: 'player not found' });
    const row = await getUser(username);
    if (!row?.gear_data) return res.status(404).json({ error: 'no gear in db' });
    let parsed;
    try { parsed = JSON.parse(row.gear_data); } catch (_) { parsed = {}; }
    const equipment = parsed?.equipment || {};
    const base = 4;
    const extra = equipment?.backpack ? 4 : 0; // simple mirror of gameState for now
    const capacity = base + extra;
    const inv = Array.isArray(parsed?.inventory) ? parsed.inventory.slice(0, capacity) : [];
    while (inv.length < capacity) inv.push(null);
    const hot = Array.isArray(parsed?.hotbar) ? parsed.hotbar.slice(0, 4) : [null, null, null, null];
    p.gear = { inventory: inv, hotbar: hot, equipment };
    res.json({ ok: true, inventoryLength: inv.length, gear: p.gear });
  } catch (e) {
    res.status(500).json({ error: 'reload failed' });
  }
});

app.post('/debug/set-test-gear', express.json(), async (req, res) => {
  try {
    const username = String(req.body?.username || '');
    if (!username) return res.status(400).json({ error: 'missing username' });
    const p = getPlayer(username);
    if (!p) return res.status(404).json({ error: 'player not found' });
    p.gear = {
      inventory: [{ id: 'item_pistol_a' }, { id: 'item_rifle_a' }, null, null],
      hotbar: [{ id: 'item_pistol_a' }, { id: 'item_rifle_a' }, null, null],
      equipment: { head: null, chest: null, boots: null, shoulderLeft: null, shoulderRight: null, backpack: null },
    };
    res.json({ ok: true, gear: p.gear });
  } catch (e) {
    res.status(500).json({ error: 'set failed' });
  }
});

app.post('/debug/give-weapons', express.json(), async (req, res) => {
  try {
    const username = String(req.body?.username || '');
    if (!username) return res.status(400).json({ error: 'missing username' });
    
    const p = getPlayer(username);
    if (!p) return res.status(404).json({ error: 'player not found' });
    
    // Give weapons to the player
    p.gear.inventory[0] = { id: 'item_pistol_a' };
    p.gear.inventory[1] = { id: 'item_rifle_a' };
    p.gear.hotbar[0] = { id: 'item_pistol_a' };
    p.gear.hotbar[1] = { id: 'item_rifle_a' };
    
    res.json({ 
      ok: true, 
      message: `Weapons added to ${username}`,
      gear: p.gear 
    });
  } catch (e) {
    res.status(500).json({ error: 'give weapons failed', details: e.message });
  }
});

app.post('/debug/create-test-player', express.json(), async (req, res) => {
  try {
    const username = String(req.body?.username || 'test');
    
    // Create a test user record
    const testUser = {
      username: username,
      x: 0,
      y: 0,
      current_realm: 'nexus',
      gear: {
        inventory: [{ id: 'item_pistol_a' }, { id: 'item_rifle_a' }, null, null],
        hotbar: [{ id: 'item_pistol_a' }, { id: 'item_rifle_a' }, null, null],
        equipment: { head: null, chest: null, boots: null, shoulderLeft: null, shoulderRight: null, backpack: null }
      }
    };
    
    // Add player to game state
    const player = addPlayerFromRecord(username, testUser);
    
    res.json({ 
      ok: true, 
      message: `Test player '${username}' created with weapons`,
      player: {
        username: player.username,
        x: player.x,
        y: player.y,
        gear: player.gear
      }
    });
  } catch (e) {
    res.status(500).json({ error: 'create failed', details: e.message });
  }
});

io.on('connection', async (socket) => {
  try {
    const username = socket.handshake?.auth?.username;
    if (!username || typeof username !== 'string') {
      socket.emit('errorMessage', 'Missing username in auth handshake');
      socket.disconnect(true);
      return;
    }

    let userRecord = await getUser(username);
    if (!userRecord) {
      userRecord = createDefaultUser(username);
    }

    const player = addPlayerFromRecord(userRecord, socket.id);
    socket.join(player.realm);

          socket.emit('init', {
        username: player.username,
        realm: player.realm,
        x: player.x,
        y: player.y,
        physics: { ACCELERATION, FRICTION, MAX_SPEED },
        realmSize: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
        gear: player.gear,
        realmConfig: REALM_CONFIG[player.realm],
      });

    socket.on('input', (inputState) => {
      setPlayerInput(player.username, inputState || {});
    });

    socket.on('requestTravel', () => {
      const beforeRealm = getPlayer(player.username)?.realm;
      const result = travelIfNearPortal(player.username);
      const afterRealm = getPlayer(player.username)?.realm;
      if (result && beforeRealm && afterRealm && beforeRealm !== afterRealm) {
        socket.leave(beforeRealm);
        socket.join(afterRealm);
        socket.emit('realmChanged', { realm: afterRealm, x: result.x, y: result.y });
      }
    });

    // Gear/inventory moves with server-side validation
    socket.on('gearMove', (action, cb) => {
      try {
        const result = moveGear(player.username, action || {});
        if (!result.ok) {
          cb && cb({ ok: false, error: result.error });
          return;
        }
        cb && cb({ ok: true, gear: result.gear });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('gearMove error:', err);
        cb && cb({ ok: false, error: 'server_error' });
      }
    });

    socket.on('activeHotbar', (payload) => {
      const idx = Number(payload?.index);
      if (Number.isFinite(idx)) {
        const p2 = getPlayer(player.username);
        if (p2) p2.activeHotbarIndex = Math.max(0, Math.min(3, idx));
      }
    });

    // Energy-based firing: each shot consumes energy; energy regenerates over time; if no energy, can't fire
    const weaponState = { heat: 0, overheated: false, holdFullUntil: 0, lastTick: Date.now() };
    function spawnShot(p) {
      // Use the new fireProjectile system
      const projectile = fireProjectile(p.username, p.input.angle);
      if (projectile) {
        // Notify shooter for client-side muzzle flash/recoil
        try { socket.emit('fired', { angle: p.input.angle, ts: Date.now() }); } catch (_) {}
      }
    }
    // Energy display loop per connection
    setInterval(() => {
      const p = getPlayer(player.username);
      if (!p) return;
      
      // Send current energy status to client
      const energyPercent = p.energy / p.maxEnergy;
      const payload = { value: energyPercent, overheated: p.energy <= 0 };
      socket.emit('heat', payload);
    }, 100);

    let autoInterval = null;
    function stopAuto() {
      if (autoInterval) { 
        clearInterval(autoInterval); 
        autoInterval = null; 
      }
    }
    socket.on('fire', () => {
      const p = getPlayer(player.username);
      if (!p) return;
      
      // Check if player has enough energy
      if (p.energy <= 0) return;
      
      const activeItem = p.gear?.hotbar?.[p.activeHotbarIndex || 0] || null;
      if (!activeItem?.id) return;
      
      const props = getItemProps(activeItem.id) || {};
      const shots = Number.isFinite(props.burstShots) ? Math.max(1, Math.floor(props.burstShots)) : 1;

      // Automatic weapon handling: start interval until mouseup or no energy
      if (props.auto) {
        if (autoInterval) return; // already firing
        const intervalMs = Math.max(50, Math.floor(1000 / (props.rof || 10)));
        autoInterval = setInterval(() => {
          const latest = getPlayer(player.username);
          if (!latest || latest.energy <= 0) { stopAuto(); return; }
          spawnShot(latest);
        }, intervalMs);
        return;
      }

      // Single shot or burst
      let fired = 0;
      const fireOnce = () => {
        const latest = getPlayer(player.username);
        if (!latest || latest.energy <= 0) return;
        spawnShot(latest);
        fired += 1;
        
        if (fired < shots && latest.energy > 0) {
          setTimeout(fireOnce, 90);
        }
      };
      fireOnce();
    });

    socket.on('fireStop', () => {
      stopAuto();
    });

    socket.on('disconnect', async () => {
      const p = getPlayer(player.username);
      if (p) {
        try {
          await saveUser({
            username: p.username,
            x_position: p.x,
            y_position: p.y,
            current_realm: p.realm,
            gear_data: JSON.stringify(p.gear || {}),
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Failed saving user on disconnect:', err);
        }
      }
      removePlayer(player.username);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Connection error:', error);
    socket.emit('errorMessage', 'Connection failed on server');
    socket.disconnect(true);
  }
});

// Broadcast realm snapshots ~30 times per second
setInterval(() => {
  try {
    stepRealm(1 / 60);
    
    // Always broadcast nexus realm state (for mob visibility)
    const nexusSnapshot = getRealmSnapshot('nexus');
    io.emit('state', nexusSnapshot);
    
    // Also broadcast to any specific realm rooms
    for (const room of io.sockets.adapter.rooms.keys()) {
      // Skip rooms that are actually socket IDs
      if (io.sockets.sockets.has(room)) continue;
      const snapshot = getRealmSnapshot(room);
      io.to(room).emit('state', snapshot);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Tick error:', err);
  }
}, 1000 / 30);

// Periodic persistence of all connected players
setInterval(async () => {
  const sockets = await io.fetchSockets();
  for (const s of sockets) {
    const username = s.handshake?.auth?.username;
    const p = username ? getPlayer(username) : null;
    if (!p) continue;
    try {
      await saveUser({
        username: p.username,
        x_position: p.x,
        y_position: p.y,
        current_realm: p.realm,
        gear_data: JSON.stringify(p.gear || {}),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Periodic save failed:', err);
    }
  }
}, 30_000);

// Spawn initial mobs for testing
spawnInitialMobs();
console.log('Initial mobs spawned');

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});


