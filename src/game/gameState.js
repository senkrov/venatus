const ACCELERATION = 0.18; // increased for snappier movement
const FRICTION = 0.92;     // slightly lower friction to maintain momentum
const MAX_SPEED = 7.5;     // higher top speed

const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 2000;

const playersByUsername = new Map();

// Simple item registry with type metadata and optional capacity modifiers
const itemsRegistry = {
  item_pistol_a: { id: 'item_pistol_a', name: 'Pistol A', type: 'weapon' },
  item_backpack_tier1: { id: 'item_backpack_tier1', name: 'Backpack T1', type: 'backpack', capacity: 4 },
  item_helmet_basic: { id: 'item_helmet_basic', name: 'Helmet', type: 'head' },
  item_suit_basic: { id: 'item_suit_basic', name: 'Suit', type: 'chest' },
  item_boots_basic: { id: 'item_boots_basic', name: 'Boots', type: 'boots' },
};

const worlds = {
  nexus: {
    name: 'nexus',
    players: new Set(),
    portals: [
      { x: 300, y: 300, toWorld: 'range', toX: 300, toY: 300 },
    ],
  },
  range: {
    name: 'range',
    players: new Set(),
    portals: [
      { x: 300, y: 300, toWorld: 'nexus', toX: 300, toY: 300 },
    ],
  },
};

function addPlayerFromRecord(userRecord, socketId) {
  const parsedGear = safeParseGearData(userRecord.gear_data);

  const player = {
    username: userRecord.username,
    x: Number(userRecord.x_position) || 0,
    y: Number(userRecord.y_position) || 0,
    vx: 0,
    vy: 0,
    world: userRecord.current_world || 'nexus',
    input: { up: false, down: false, left: false, right: false, angle: 0 },
    gear: normalizeGear(parsedGear),
    socketId,
  };

  playersByUsername.set(player.username, player);
  worlds[player.world]?.players.add(player.username);
  return player;
}

function removePlayer(username) {
  const player = playersByUsername.get(username);
  if (!player) return;
  worlds[player.world]?.players.delete(username);
  playersByUsername.delete(username);
}

function getPlayer(username) {
  return playersByUsername.get(username) || null;
}

function setPlayerInput(username, inputState) {
  const player = playersByUsername.get(username);
  if (!player) return;
  player.input.up = Boolean(inputState.up);
  player.input.down = Boolean(inputState.down);
  player.input.left = Boolean(inputState.left);
  player.input.right = Boolean(inputState.right);
  if (typeof inputState.angle === 'number') {
    player.input.angle = inputState.angle;
  }
}

function stepWorld(dtSeconds) {
  for (const player of playersByUsername.values()) {
    const accelerationX = (player.input.right ? 1 : 0) - (player.input.left ? 1 : 0);
    const accelerationY = (player.input.down ? 1 : 0) - (player.input.up ? 1 : 0);

    player.vx += ACCELERATION * accelerationX;
    player.vy += ACCELERATION * accelerationY;

    player.vx *= FRICTION;
    player.vy *= FRICTION;

    const speed = Math.hypot(player.vx, player.vy);
    if (speed > MAX_SPEED) {
      const scale = MAX_SPEED / speed;
      player.vx *= scale;
      player.vy *= scale;
    }

    player.x += player.vx;
    player.y += player.vy;

    player.x = Math.max(0, Math.min(WORLD_WIDTH, player.x));
    player.y = Math.max(0, Math.min(WORLD_HEIGHT, player.y));
  }
}

function findNearbyPortal(player, distanceThreshold = 40) {
  const world = worlds[player.world];
  if (!world) return null;
  for (const portal of world.portals) {
    const d = Math.hypot(portal.x - player.x, portal.y - player.y);
    if (d <= distanceThreshold) return portal;
  }
  return null;
}

function travelIfNearPortal(username) {
  const player = playersByUsername.get(username);
  if (!player) return null;
  const portal = findNearbyPortal(player);
  if (!portal) return null;

  worlds[player.world]?.players.delete(player.username);
  player.world = portal.toWorld;
  player.x = portal.toX;
  player.y = portal.toY;
  player.vx = 0;
  player.vy = 0;
  worlds[player.world]?.players.add(player.username);

  return { world: player.world, x: player.x, y: player.y };
}

function getWorldSnapshot(worldName) {
  const world = worlds[worldName];
  if (!world) return { players: [], portals: [] };
  const players = [];
  for (const username of world.players) {
    const p = playersByUsername.get(username);
    if (!p) continue;
    players.push({ username: p.username, x: p.x, y: p.y });
  }
  return { players, portals: world.portals };
}

function safeParseGearData(gearDataText) {
  if (!gearDataText) return { inventory: [], hotbar: [], equipment: {} };
  try {
    const obj = JSON.parse(gearDataText);
    return obj && typeof obj === 'object' ? obj : { inventory: [], hotbar: [], equipment: {} };
  } catch (_) {
    return { inventory: [], hotbar: [], equipment: {} };
  }
}

function normalizeGear(gear) {
  const equipment = {
    head: gear?.equipment?.head ?? null,
    chest: gear?.equipment?.chest ?? null,
    boots: gear?.equipment?.boots ?? null,
    shoulderLeft: gear?.equipment?.shoulderLeft ?? null,
    shoulderRight: gear?.equipment?.shoulderRight ?? null,
    backpack: gear?.equipment?.backpack ?? null,
  };
  const inventory = Array.isArray(gear?.inventory) ? gear.inventory.slice(0) : [];
  const hotbar = Array.isArray(gear?.hotbar) ? gear.hotbar.slice(0, 4) : [null, null, null, null];

  const capacity = getInventoryCapacity(equipment);
  while (inventory.length < capacity) inventory.push(null);
  if (inventory.length > capacity) inventory.length = capacity;

  return { inventory, hotbar, equipment };
}

function getInventoryCapacity(equipment) {
  const base = 4;
  const backpackItem = equipment?.backpack && itemsRegistry[equipment.backpack.id];
  const extra = backpackItem?.capacity ?? 0;
  return base + extra;
}

function canEquipItemToSlot(item, slotName) {
  if (!item) return true;
  const meta = itemsRegistry[item.id];
  if (!meta) return false; // unknown items are not allowed
  if (slotName === 'backpack') return meta.type === 'backpack';
  if (slotName === 'head') return meta.type === 'head';
  if (slotName === 'chest') return meta.type === 'chest';
  if (slotName === 'boots') return meta.type === 'boots';
  if (slotName === 'shoulderLeft' || slotName === 'shoulderRight') return meta.type === 'shoulder';
  return false;
}

function moveGear(username, action) {
  // action: { type: 'equip'|'unequip'|'swap'|'move', from: {kind, index|slot}, to: {kind, index|slot} }
  const player = playersByUsername.get(username);
  if (!player) return { ok: false, error: 'not_found' };
  const gear = player.gear;

  const resolveRef = (ref) => {
    if (ref.kind === 'inventory') return { kind: 'inventory', get: () => gear.inventory[ref.index], set: (v) => (gear.inventory[ref.index] = v) };
    if (ref.kind === 'hotbar') return { kind: 'hotbar', get: () => gear.hotbar[ref.index], set: (v) => (gear.hotbar[ref.index] = v) };
    if (ref.kind === 'equipment') return { kind: 'equipment', get: () => gear.equipment[ref.slot], set: (v) => (gear.equipment[ref.slot] = v), slot: ref.slot };
    return null;
  };

  const from = resolveRef(action.from);
  const to = resolveRef(action.to);
  if (!from || !to) return { ok: false, error: 'bad_ref' };

  const itemFrom = from.get();
  const itemTo = to.get();

  // Validate equipment constraints (inventory and hotbar accept all types)
  if (to.kind === 'equipment' && !canEquipItemToSlot(itemFrom, to.slot)) {
    return { ok: false, error: 'invalid_slot' };
  }

  // Execute swap/move
  from.set(itemTo);
  to.set(itemFrom);

  // Recalculate inventory capacity after potential backpack change
  if (from.kind === 'equipment' && from.slot === 'backpack' || to.kind === 'equipment' && to.slot === 'backpack') {
    const capacity = getInventoryCapacity(gear.equipment);
    while (gear.inventory.length < capacity) gear.inventory.push(null);
    if (gear.inventory.length > capacity) {
      // Trim overflow items into a drop list (for now, move overflow to end and drop nulls)
      gear.inventory = gear.inventory.slice(0, capacity);
    }
  }

  return { ok: true, gear };
}

module.exports = {
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
};


