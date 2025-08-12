const path = require('path');

// Physics constants
const ACCELERATION = 800;
const FRICTION = 0.85;
const MAX_SPEED = 400;
const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 2400;

// Player management
const playersByUsername = new Map();
const projectiles = [];

// Simple item registry
const itemsRegistry = {
  item_pistol_a: {
    id: 'item_pistol_a',
    name: 'Pistol A',
    description: 'A reliable sidearm with burst fire capability',
    type: 'weapon',
    class: 'pistol',
    capacity: 0,
    projectileSpeed: 1200,
    energyCost: 0.33,
    energyCostType: 'fraction',
    ROF: 10,
    auto: false,
    burstShots: 3,
    burstToMax: true,
    damage: 25
  },
  item_rifle_a: {
    id: 'item_rifle_a',
    name: 'Rifle A',
    description: 'An automatic rifle with high rate of fire',
    type: 'weapon',
    class: 'rifle',
    capacity: 0,
    projectileSpeed: 1400,
    energyCost: 0.06,
    energyCostType: 'flat',
    ROF: 10,
    auto: true,
    burstShots: 0,
    burstToMax: false,
    damage: 35
  },
  item_backpack_tier1: { id: 'item_backpack_tier1', name: 'Backpack T1', type: 'backpack', capacity: 4 },
  item_helmet_basic: { id: 'item_helmet_basic', name: 'Helmet', type: 'head' },
  item_chest_basic: { id: 'item_chest_basic', name: 'Chest Armor', type: 'chest' },
  item_boots_basic: { id: 'item_boots_basic', name: 'Boots', type: 'boots' },
  item_shoulder_left: { id: 'item_shoulder_left', name: 'Left Shoulder', type: 'shoulderLeft' },
  item_shoulder_right: { id: 'item_shoulder_right', name: 'Right Shoulder', type: 'shoulderRight' }
};

// Realm configuration
const REALM_CONFIG = {
  nexus: {
    name: 'Nexus',
    size: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    center: { x: 0, y: 0 },
    features: {
      mobSpawning: false,
      spawners: false
    },
    specialAreas: []
  }
};

// Portal system (empty for now)
const PORTALS = {};

// Realms map
const realms = new Map();
realms.set('nexus', {
  name: 'Nexus',
  players: new Set(),
  portals: new Set()
});

// Player functions
function addPlayerFromRecord(username, record) {
  const player = {
    username,
    x: record.x || 0,
    y: record.y || 0,
    vx: 0,
    vy: 0,
    realm: record.current_realm || 'nexus',
    input: { up: false, down: false, left: false, right: false, angle: 0 },
    lastInputAt: Date.now(),
    gear: record.gear || {
      inventory: [null, null, null, null],
      hotbar: [null, null, null, null],
      equipment: {
        head: null,
        chest: null,
        boots: null,
        shoulderLeft: null,
        shoulderRight: null,
        backpack: null
      }
    },
    socketId: null,
    // Energy/heat system
    energy: 1.0,
    maxEnergy: 1.0,
    energyRegenRate: 0.1, // per second
    lastEnergyRegen: Date.now(),
    // Shooting mechanics
    lastShotTime: 0,
    currentWeapon: null
  };
  
  playersByUsername.set(username, player);
  realms.get(player.realm).players.add(username);
  return player;
}

function removePlayer(username) {
  const player = playersByUsername.get(username);
  if (player) {
    realms.get(player.realm).players.delete(username);
    playersByUsername.delete(username);
  }
}

function getPlayer(username) {
  return playersByUsername.get(username);
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
  player.lastInputAt = Date.now();
}

// Shooting mechanics
function fireProjectile(username, angle) {
  const player = getPlayer(username);
  if (!player) return null;
  
  // Check if player has a weapon equipped
  if (!player.currentWeapon) {
    // Try to get weapon from hotbar
    for (let i = 0; i < player.gear.hotbar.length; i++) {
      const item = player.gear.hotbar[i];
      if (item && itemsRegistry[item.id] && itemsRegistry[item.id].type === 'weapon') {
        player.currentWeapon = item.id;
        break;
      }
    }
  }
  
  if (!player.currentWeapon) {
    console.log(`Player ${username} has no weapon equipped`);
    return null;
  }
  
  const weapon = itemsRegistry[player.currentWeapon];
  if (!weapon) return null;
  
  // Check energy cost
  const energyCost = getEnergyCostForItem(player.currentWeapon, player.maxEnergy);
  if (player.energy < energyCost) {
    console.log(`Player ${username} insufficient energy: ${player.energy}/${energyCost}`);
    return null;
  }
  
  // Check rate of fire
  const now = Date.now();
  const timeSinceLastShot = now - player.lastShotTime;
  const shotInterval = 1000 / weapon.ROF; // Convert ROF to milliseconds
  
  if (timeSinceLastShot < shotInterval) {
    console.log(`Player ${username} shot on cooldown: ${timeSinceLastShot}ms < ${shotInterval}ms`);
    return null;
  }
  
  // Consume energy
  player.energy -= energyCost;
  player.lastShotTime = now;
  
  // Create projectile
  const projectileSpeed = getProjectileSpeedForItem(player.currentWeapon);
  const projectile = {
    id: `projectile_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    x: player.x,
    y: player.y,
    vx: Math.cos(angle) * projectileSpeed,
    vy: Math.sin(angle) * projectileSpeed,
    damage: getDamageForItem(player.currentWeapon),
    owner: username,
    ownerType: 'player',
    life: 3.0, // 3 seconds lifetime
    size: 4,
    realm: player.realm
  };
  
  projectiles.push(projectile);
  console.log(`Player ${username} fired ${weapon.name} projectile`);
  
  return projectile;
}

// Movement and physics
function stepRealm(dtSeconds) {
  for (const player of playersByUsername.values()) {
    // Energy regeneration
    const now = Date.now();
    if (now - player.lastEnergyRegen >= 100) { // Update every 100ms
      const timeDiff = (now - player.lastEnergyRegen) / 1000;
      player.energy = Math.min(player.maxEnergy, player.energy + player.energyRegenRate * timeDiff);
      player.lastEnergyRegen = now;
    }
    
    // If inputs are stale, stop movement
    if (Date.now() - (player.lastInputAt || 0) > 1000) {
      player.input.up = false;
      player.input.down = false;
      player.input.left = false;
      player.input.right = false;
    }

    let targetVx = 0;
    let targetVy = 0;

    if (player.input.left) targetVx -= MAX_SPEED;
    if (player.input.right) targetVx += MAX_SPEED;
    if (player.input.up) targetVy -= MAX_SPEED;
    if (player.input.down) targetVy += MAX_SPEED;

    const targetSpeed = Math.hypot(targetVx, targetVy);
    if (targetSpeed > 0) {
      const scale = MAX_SPEED / targetSpeed;
      targetVx *= scale;
      targetVy *= scale;
    }

    // Smooth movement
    const SPEED_LERP = 0.1;
    player.vx = player.vx + (targetVx - player.vx) * SPEED_LERP;
    player.vy = player.vy + (targetVy - player.vy) * SPEED_LERP;

    // Apply friction only when no input on that axis
    if (!player.input.left && !player.input.right) player.vx *= FRICTION;
    if (!player.input.up && !player.input.down) player.vy *= FRICTION;

    // Zero-out tiny velocities
    if (Math.abs(player.vx) < 0.02) player.vx = 0;
    if (Math.abs(player.vy) < 0.02) player.vy = 0;

    // Update position
    player.x += player.vx * dtSeconds;
    player.y += player.vy * dtSeconds;

    // Keep player within world bounds
    player.x = Math.max(-WORLD_WIDTH/2, Math.min(WORLD_WIDTH/2, player.x));
    player.y = Math.max(-WORLD_HEIGHT/2, Math.min(WORLD_HEIGHT/2, player.y));
  }
  
  // Update projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const projectile = projectiles[i];
    
    // Update position
    projectile.x += projectile.vx * dtSeconds;
    projectile.y += projectile.vy * dtSeconds;
    
    // Update lifetime
    projectile.life -= dtSeconds;
    
    // Remove expired projectiles
    if (projectile.life <= 0) {
      projectiles.splice(i, 1);
      continue;
    }
    
    // Remove projectiles that go out of world bounds
    if (projectile.x < -WORLD_WIDTH/2 || projectile.x > WORLD_WIDTH/2 ||
        projectile.y < -WORLD_HEIGHT/2 || projectile.y > WORLD_HEIGHT/2) {
      projectiles.splice(i, 1);
      continue;
    }
  }
}

// Portal travel
function travelIfNearPortal(player) {
  for (const portal of Object.values(PORTALS)) {
    const distance = Math.hypot(player.x - portal.x, player.y - portal.y);
    if (distance < 32) { // 32 pixel radius
      const targetRealm = portal.toRealm;
      if (targetRealm && realms.has(targetRealm)) {
        // Remove from current realm
        realms.get(player.realm).players.delete(player.username);
        
        // Add to new realm
        player.realm = targetRealm;
        realms.get(targetRealm).players.add(player.username);
        
        // Set position in new realm
        player.x = portal.toX || 0;
        player.y = portal.toY || 0;
        
        return { realm: targetRealm, x: player.x, y: player.y };
      }
    }
  }
  return null;
}

// Gear management
function moveGear(username, fromSlot, toSlot) {
  const player = getPlayer(username);
  if (!player || !player.gear) return false;
  
  const { inventory, hotbar } = player.gear;
  
  // Handle inventory to hotbar
  if (fromSlot >= 0 && fromSlot < inventory.length && toSlot >= 100 && toSlot < 104) {
    const hotbarIndex = toSlot - 100;
    const temp = inventory[fromSlot];
    inventory[fromSlot] = hotbar[hotbarIndex];
    hotbar[hotbarIndex] = temp;
    return true;
  }
  
  // Handle hotbar to inventory
  if (fromSlot >= 100 && fromSlot < 104 && toSlot >= 0 && toSlot < inventory.length) {
    const hotbarIndex = fromSlot - 100;
    const temp = hotbar[hotbarIndex];
    hotbar[hotbarIndex] = inventory[toSlot];
    inventory[toSlot] = temp;
    return true;
  }
  
  // Handle hotbar to hotbar
  if (fromSlot >= 100 && fromSlot < 104 && toSlot >= 100 && toSlot < 104) {
    const fromIndex = fromSlot - 100;
    const toIndex = toSlot - 100;
    const temp = hotbar[fromIndex];
    hotbar[fromIndex] = hotbar[toIndex];
    hotbar[toIndex] = temp;
    return true;
  }
  
  // Handle inventory to inventory
  if (fromSlot >= 0 && fromSlot < inventory.length && toSlot >= 0 && toSlot < inventory.length) {
    const temp = inventory[fromSlot];
    inventory[fromSlot] = inventory[toSlot];
    inventory[toSlot] = temp;
    return true;
  }
  
  return false;
}

// Projectile functions
function getProjectileSpeedForItem(itemId) {
  return itemsRegistry[itemId]?.projectileSpeed || 1000;
}

function getEnergyCostForItem(itemId, maxEnergy = 1) {
  const item = itemsRegistry[itemId];
  if (!item) return 0.1 * maxEnergy;
  
  if (item.energyCostType === 'fraction') {
    return item.energyCost * maxEnergy;
  } else {
    return item.energyCost;
  }
}

function getItemProps(itemId) {
  return itemsRegistry[itemId] || null;
}

function getDamageForItem(itemId) {
  return itemsRegistry[itemId]?.damage || 25;
}

// Realm snapshot
function getRealmSnapshot(realmName) {
  const realm = realms.get(realmName);
  if (!realm) return null;
  
  const players = Array.from(realm.players).map(username => {
    const player = playersByUsername.get(username);
    if (!player) return null;
    
    return {
      username: player.username,
      x: player.x,
      y: player.y,
      realm: player.realm,
      gear: player.gear,
      energy: player.energy,
      maxEnergy: player.maxEnergy,
      currentWeapon: player.currentWeapon
    };
  }).filter(Boolean);
  
  const portals = Array.from(realm.portals).map(portalId => PORTALS[portalId]).filter(Boolean);
  
  return {
    players,
    portals,
    projectiles: projectiles.filter(p => p.realm === realmName),
    mobs: [],
    spawners: []
  };
}

// Initialize realm
async function spawnInitialMobs() {
  // Clear any existing entities
  projectiles.length = 0;
  

  
  // Get current realm config
  const realmConfig = REALM_CONFIG.nexus;
  
  console.log('Initializing clean void world with shooting mechanics...');
  console.log(`Realm "${realmConfig.name}" initialized:`);
  console.log(`  - Features: mobSpawning=${realmConfig.features.mobSpawning}, spawners=${realmConfig.features.spawners}`);
  console.log(`  - Size: ${realmConfig.size.width}x${realmConfig.size.height}`);
  console.log(`  - Center: ${realmConfig.center.x}, ${realmConfig.center.y}`);
  console.log(`  - Special areas: ${realmConfig.specialAreas.length}`);
  console.log(`  - Items available: ${Object.keys(itemsRegistry).length}`);

}

// Export functions
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
  PORTALS,
  itemsRegistry
};


