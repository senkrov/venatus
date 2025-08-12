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
  stepWorld,
  travelIfNearPortal,
  getWorldSnapshot,
  moveGear,
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
    socket.join(player.world);

    socket.emit('init', {
      username: player.username,
      world: player.world,
      x: player.x,
      y: player.y,
      physics: { ACCELERATION, FRICTION, MAX_SPEED },
      worldSize: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
      gear: player.gear,
    });

    socket.on('input', (inputState) => {
      setPlayerInput(player.username, inputState || {});
    });

    socket.on('requestTravel', () => {
      const beforeWorld = getPlayer(player.username)?.world;
      const result = travelIfNearPortal(player.username);
      const afterWorld = getPlayer(player.username)?.world;
      if (result && beforeWorld && afterWorld && beforeWorld !== afterWorld) {
        socket.leave(beforeWorld);
        socket.join(afterWorld);
        socket.emit('worldChanged', { world: afterWorld, x: result.x, y: result.y });
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

    socket.on('disconnect', async () => {
      const p = getPlayer(player.username);
      if (p) {
        try {
          await saveUser({
            username: p.username,
            x_position: p.x,
            y_position: p.y,
            current_world: p.world,
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

// Broadcast world snapshots ~30 times per second
setInterval(() => {
  try {
    stepWorld(1 / 60);
    for (const room of io.sockets.adapter.rooms.keys()) {
      // Skip rooms that are actually socket IDs
      if (io.sockets.sockets.has(room)) continue;
      const snapshot = getWorldSnapshot(room);
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
        current_world: p.world,
        gear_data: JSON.stringify(p.gear || {}),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Periodic save failed:', err);
    }
  }
}, 30_000);

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});


