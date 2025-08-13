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

// Complete Drone and Spawner System
const MOB_TYPES = {
  drone_l1: {
    name: 'Level 1 Drone',
    speed: 120,
    health: 80,
    attack: 15,
    detectionRange: 200,
    attackRange: 80,
    attackCooldown: 1000,
    personality: {
      courage: 0.9,
      aggression: 0.8,
      caution: 0.2,
      intelligence: 0.4,
      teamwork: 0.3
    },
    combatStyle: 'rush',
    retreatThreshold: 0, // No retreat
    regroupThreshold: 0.3,
    canBoostSpeed: false,
    boostMultiplier: 1.0,
    flankingRange: 150
  },
  drone_l2: {
    name: 'Level 2 Drone',
    speed: 90,
    health: 120,
    attack: 20,
    detectionRange: 250,
    attackRange: 100,
    attackCooldown: 1200,
    personality: {
      courage: 0.7,
      aggression: 0.6,
      caution: 0.5,
      intelligence: 0.6,
      teamwork: 0.5
    },
    combatStyle: 'kite',
    retreatThreshold: 0.4, // Can retreat when low on health
    regroupThreshold: 0.5,
    canBoostSpeed: false,
    boostMultiplier: 1.0,
    flankingRange: 180
  },
  drone_l3: {
    name: 'Level 3 Drone',
    speed: 100,
    health: 150,
    attack: 25,
    detectionRange: 300,
    attackRange: 120,
    attackCooldown: 1000,
    personality: {
      courage: 0.8,
      aggression: 0.7,
      caution: 0.4,
      intelligence: 0.8,
      teamwork: 0.7
    },
    combatStyle: 'ambush',
    retreatThreshold: 0.3,
    regroupThreshold: 0.4,
    canBoostSpeed: true,
    boostMultiplier: 1.5, // Can boost faster than Level 1 when attacking
    flankingRange: 200
  }
};

// Spawner types with drone quotas
const SPAWNER_TYPES = {
  spawner_l1: {
    name: 'Level 1 Spawner',
    maxDrones: { drone_l1: 8 },
    spawnRadius: 150,
    transferRange: 300,
    spawnInterval: 5000,
    color: '#ff6600'
  },
  spawner_l2: {
    name: 'Level 2 Spawner',
    maxDrones: { drone_l1: 12, drone_l2: 4 },
    spawnRadius: 200,
    transferRange: 400,
    spawnInterval: 6000,
    color: '#ff8800'
  },
  spawner_l3: {
    name: 'Level 3 Spawner',
    maxDrones: { drone_l1: 20, drone_l2: 8, drone_l3: 4 },
    spawnRadius: 250,
    transferRange: 500,
    spawnInterval: 7000,
    color: '#ffaa00'
  }
};

// Active spawners map
const SPAWNERS = new Map();

// Mob management
let mobs = new Map();
let lastMobSpawnTime = Date.now();
const MOB_RESPAWN_INTERVAL = 10000; // 10 seconds
const MAX_MOBS = 50; // Increased for spawner system

// Respawn queue for killed mobs
const respawnQueue = [];



// Complete Mob class with advanced AI
class Mob {
  constructor(type, x, y, spawnerId = null) {
    const config = MOB_TYPES[type];
    if (!config) throw new Error(`Unknown mob type: ${type}`);
    
    this.id = `mob_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.type = type;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.health = config.health;
    this.maxHealth = config.health;
    this.attack = config.attack;
    this.speed = config.speed;
    this.detectionRange = config.detectionRange;
    this.attackRange = config.attackRange;
    this.attackCooldown = config.attackCooldown;
    this.lastAttackTime = 0;
    this.personality = config.personality;
    this.combatStyle = config.combatStyle;
    this.retreatThreshold = config.retreatThreshold;
    this.regroupThreshold = config.regroupThreshold;
    this.canBoostSpeed = config.canBoostSpeed;
    this.boostMultiplier = config.boostMultiplier;
    this.flankingRange = config.flankingRange;
    this.spawnerId = spawnerId;
    
    // AI state
    this.state = 'PATROL';
    this.target = null;
    this.targetDistance = Infinity;
    this.lastStateChange = Date.now();
    this.stateDuration = 0;
    
    // Patrol system - straight line movement with random decisions
    this.patrolDirection = Math.random() * Math.PI * 2;
    this.patrolDistance = 0;
    this.maxPatrolDistance = 200 + Math.random() * 200;
    this.lastDecisionTime = Date.now();
    this.decisionInterval = 3000 + Math.random() * 4000; // 3-7 seconds
    
    // Advanced flanking system (for Level 3 drones)
    this.flankPhase = null; // 'assessment', 'cover', 'swooping'
    this.flankTarget = null;
    this.flankWaypoints = [];
    this.flankPhaseStart = 0;
    
    // Combat tracking
    this.lastDamageTaken = 0;
    this.damageTaken = 0;
    this.retreatTimer = 0;
    this.regroupTimer = 0;
    
    // Combat AI
    this.lastShotTime = 0;
    this.shotCooldown = config.attackCooldown;
    this.isAttacking = false;
    this.attackTarget = null;
  }
  
  // Generate patrol route for straight-line movement
  generatePatrolRoute() {
    this.patrolDirection = Math.random() * Math.PI * 2;
    this.patrolDistance = 0;
    this.maxPatrolDistance = 200 + Math.random() * 200;
    this.lastDecisionTime = Date.now();
    this.decisionInterval = 3000 + Math.random() * 4000;
  }
  
  // Straight-line patrol with random idle/direction changes
  behavePatrol(dtSeconds) {
    const now = Date.now();
    
    // Check if it's time to make a decision
    if (now - this.lastDecisionTime > this.decisionInterval) {
      this.lastDecisionTime = now;
      
      // Random decision: 50% chance to idle, 50% chance to change direction
      if (Math.random() < 0.5) {
        // Choose to idle
        this.state = 'IDLE';
        this.stateDuration = 2000 + Math.random() * 3000; // 2-5 seconds idle
        this.lastStateChange = now;
        return;
      } else {
        // Choose to change direction
        this.generatePatrolRoute();
        return;
      }
    }
    
    // Move in current direction
    const targetVx = Math.cos(this.patrolDirection) * this.speed;
    const targetVy = Math.sin(this.patrolDirection) * this.speed;
    
    // Smooth movement
    const SPEED_LERP = 0.1;
    this.vx = this.vx + (targetVx - this.vx) * SPEED_LERP;
    this.vy = this.vy + (targetVy - this.vy) * SPEED_LERP;
    
    // Update position
    this.x += this.vx * dtSeconds;
    this.y += this.vy * dtSeconds;
    
    // Track distance traveled
    this.patrolDistance += Math.hypot(this.vx * dtSeconds, this.vy * dtSeconds);
    
    // If we've traveled max distance, choose new direction
    if (this.patrolDistance >= this.maxPatrolDistance) {
      this.generatePatrolRoute();
    }
  }
  
  // Take damage from projectile
  takeDamage(damage, attacker) {
    this.health -= damage;
    this.lastDamageTaken = Date.now();
    this.damageTaken += damage;
    
    // Set attacker as target if we don't have one
    if (!this.target) {
      this.target = attacker;
      this.state = 'CHASE';
      this.lastStateChange = Date.now();
    }
    
    // Check if we should retreat
    if (this.health <= this.maxHealth * this.retreatThreshold) {
      this.state = 'RETREAT';
      this.lastStateChange = Date.now();
      this.retreatTimer = 5000; // 5 seconds of retreat
    }
    
    // Check if dead
    if (this.health <= 0) {
      this.die();
      return true; // Return true if mob died
    }
    
    return false;
  }
  
  // Handle mob death
  die() {
    console.log(`${this.type} died`);
    
    // Remove from spawner
    if (this.spawnerId && SPAWNERS.has(this.spawnerId)) {
      const spawner = SPAWNERS.get(this.spawnerId);
      spawner.drones.delete(this.id);
    }
    
    // Remove from mobs collection
    mobs.delete(this.id);
    
    // Could add loot drops here later
  }
  
  // Shoot projectile at player
  shootAtPlayer(player) {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distance = Math.hypot(dx, dy);
    
    if (distance > this.attackRange) return;
    
    // Calculate projectile velocity
    const speed = 300; // Projectile speed
    const angle = Math.atan2(dy, dx);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    
    // Create projectile
    const projectile = {
      id: `mob_projectile_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      x: this.x,
      y: this.y,
      vx: vx,
      vy: vy,
      life: 3.0, // 3 seconds lifetime
      owner: this.id,
      itemId: 'mob_attack', // Special ID for mob attacks
      realm: 'nexus'
    };
    
    projectiles.push(projectile);
    console.log(`${this.type} shot at ${player.username}`);
  }
  
  // Idle behavior - stop moving and face same direction
  behaveIdle(dtSeconds) {
    const now = Date.now();
    
    // Gradually slow down
    this.vx *= 0.95;
    this.vy *= 0.95;
    
    // Update position with reduced movement
    this.x += this.vx * dtSeconds;
    this.y += this.vy * dtSeconds;
    
    // Check if idle time is up
    if (now - this.lastStateChange > this.stateDuration) {
      this.state = 'PATROL';
      this.generatePatrolRoute();
    }
  }
  
  // Chase behavior
  behaveChase(dtSeconds, players) {
    if (!this.target) return;
    
    const targetPlayer = players.find(p => p.username === this.target);
    if (!targetPlayer) {
      this.state = 'PATROL';
      this.target = null;
      return;
    }
    
    const dx = targetPlayer.x - this.x;
    const dy = targetPlayer.y - this.y;
    const distance = Math.hypot(dx, dy);
    
    if (distance > this.detectionRange * 1.5) {
      // Lost target
      this.state = 'PATROL';
      this.target = null;
      return;
    }
    
    if (distance <= this.attackRange) {
      // In attack range
      this.state = 'ATTACK';
      return;
    }
    
    // Move towards target
    const angle = Math.atan2(dy, dx);
    const speed = this.canBoostSpeed ? this.speed * this.boostMultiplier : this.speed;
    
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    
    this.x += this.vx * dtSeconds;
    this.y += this.vy * dtSeconds;
  }
  
  // Attack behavior
  behaveAttack(dtSeconds, players) {
    if (!this.target) return;
    
    const targetPlayer = players.find(p => p.username === this.target);
    if (!targetPlayer) {
      this.state = 'PATROL';
      this.target = null;
      return;
    }
    
    const dx = targetPlayer.x - this.x;
    const dy = targetPlayer.y - this.y;
    const distance = Math.hypot(dx, dy);
    
    if (distance > this.attackRange) {
      this.state = 'CHASE';
      return;
    }
    
    // Attack if cooldown is ready
    const now = Date.now();
    if (now - this.lastAttackTime > this.attackCooldown) {
      this.lastAttackTime = now;
      
      // Shoot projectile at player
      this.shootAtPlayer(targetPlayer);
      
      // Check if we should flank (Level 3 drones)
      if (this.type === 'drone_l3' && Math.random() < 0.3) {
        this.state = 'FLANK';
        this.flankPhase = 'assessment';
        this.flankPhaseStart = now;
        return;
      }
    }
    
    // Face target
    this.patrolDirection = Math.atan2(dy, dx);
  }
  
  // Retreat behavior
  behaveRetreat(dtSeconds, players) {
    if (!this.target) return;
    
    const targetPlayer = players.find(p => p.username === this.target);
    if (!targetPlayer) {
      this.state = 'PATROL';
      this.target = null;
      return;
    }
    
    // Move away from target
    const dx = this.x - targetPlayer.x;
    const dy = this.y - targetPlayer.y;
    const angle = Math.atan2(dy, dx);
    
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
    
    this.x += this.vx * dtSeconds;
    this.y += this.vy * dtSeconds;
    
    // Check if we should stop retreating
    const distance = Math.hypot(dx, dy);
    if (distance > this.detectionRange * 0.8) {
      this.state = 'REGROUP';
      this.regroupTimer = 3000; // 3 seconds to regroup
    }
  }
  
  // Regroup behavior
  behaveRegroup(dtSeconds) {
    this.regroupTimer -= dtSeconds * 1000;
    
    if (this.regroupTimer <= 0) {
      this.state = 'PATROL';
      this.generatePatrolRoute();
      return;
    }
    
    // Slow movement while regrouping
    this.vx *= 0.9;
    this.vy *= 0.9;
    
    this.x += this.vx * dtSeconds;
    this.y += this.vy * dtSeconds;
  }
  
  // Flanking behavior - dispatch to appropriate method
  behaveFlank(dtSeconds, players) {
    if (this.type === 'drone_l3') {
      this.behaveAdvancedFlank(dtSeconds, players);
    } else {
      this.behaveBasicFlank(dtSeconds, players);
    }
  }
  
  // Basic flanking for lower-level drones
  behaveBasicFlank(dtSeconds, players) {
    if (!this.target) return;
    
    const targetPlayer = players.find(p => p.username === this.target);
    if (!targetPlayer) {
      this.state = 'ATTACK';
      this.target = null;
      return;
    }
    
    // Simple side movement
    const dx = targetPlayer.x - this.x;
    const dy = targetPlayer.y - this.y;
    const distance = Math.hypot(dx, dy);
    
    if (distance > this.attackRange * 1.5) {
      this.state = 'CHASE';
      return;
    }
    
    // Move perpendicular to target direction
    const targetAngle = Math.atan2(dy, dx);
    const flankAngle = targetAngle + (Math.random() < 0.5 ? Math.PI/2 : -Math.PI/2);
    
    this.vx = Math.cos(flankAngle) * this.speed * 0.7;
    this.vy = Math.sin(flankAngle) * this.speed * 0.7;
    
    this.x += this.vx * dtSeconds;
    this.y += this.vy * dtSeconds;
    
    // Return to attack after a short time
    if (Math.random() < 0.1) {
      this.state = 'ATTACK';
    }
  }
  
  // Advanced flanking for Level 3 drones
  behaveAdvancedFlank(dtSeconds, players) {
    const now = Date.now();
    
    switch (this.flankPhase) {
      case 'assessment':
        // Step back to assess the battle
        if (!this.target) {
          this.state = 'ATTACK';
          return;
        }
        
        const targetPlayer = players.find(p => p.username === this.target);
        if (!targetPlayer) {
          this.state = 'ATTACK';
          this.target = null;
          return;
        }
        
        // Move away from target
        const dx = this.x - targetPlayer.x;
        const dy = this.y - targetPlayer.y;
        const angle = Math.atan2(dy, dx);
        
        this.vx = Math.cos(angle) * this.speed * 0.5;
        this.vy = Math.sin(angle) * this.speed * 0.5;
        
        this.x += this.vx * dtSeconds;
        this.y += this.vy * dtSeconds;
        
        // After 1 second, move to cover phase
        if (now - this.flankPhaseStart > 1000) {
          this.flankPhase = 'cover';
          this.flankPhaseStart = now;
        }
        break;
        
      case 'cover':
        // Find cover position behind friendly drones
        const coverPos = this.findCoverPosition(players);
        if (coverPos) {
          const dx = coverPos.x - this.x;
          const dy = coverPos.y - this.y;
          const distance = Math.hypot(dx, dy);
          
          if (distance < 10) {
            // In cover, start swooping
            this.flankPhase = 'swooping';
            this.flankPhaseStart = now;
            this.flankWaypoints = this.calculateSwoopingPath(targetPlayer);
          } else {
            // Move to cover
            const angle = Math.atan2(dy, dx);
            this.vx = Math.cos(angle) * this.speed * 0.8;
            this.vy = Math.sin(angle) * this.speed * 0.8;
            
            this.x += this.vx * dtSeconds;
            this.y += this.vy * dtSeconds;
          }
        } else {
          // No cover available, go straight to swooping
          this.flankPhase = 'swooping';
          this.flankPhaseStart = now;
          this.flankWaypoints = this.calculateSwoopingPath(targetPlayer);
        }
        break;
        
      case 'swooping':
        // Execute swooping motion
        if (this.flankWaypoints.length === 0) {
          // Swooping complete, return to attack
          this.state = 'ATTACK';
          this.flankPhase = null;
          return;
        }
        
        const waypoint = this.flankWaypoints[0];
        const wx = waypoint.x - this.x;
        const wy = waypoint.y - this.y;
        const waypointDistance = Math.hypot(wx, wy);
        
        if (waypointDistance < 10) {
          // Reached waypoint, move to next
          this.flankWaypoints.shift();
        } else {
          // Move towards waypoint at high speed
          const angle = Math.atan2(wy, wx);
          this.vx = Math.cos(angle) * this.speed * this.boostMultiplier;
          this.vy = Math.sin(angle) * this.speed * this.boostMultiplier;
          
          this.x += this.vx * dtSeconds;
          this.y += this.vy * dtSeconds;
        }
        
        // Timeout for swooping
        if (now - this.flankPhaseStart > 5000) {
          this.state = 'ATTACK';
          this.flankPhase = null;
        }
        break;
    }
  }
  
  // Helper: find cover position behind friendly drones
  findCoverPosition(players) {
    const friendlyDrones = Array.from(mobs.values()).filter(m => 
      m.type.startsWith('drone_') && m.id !== this.id
    );
    
    if (friendlyDrones.length === 0) return null;
    
    // Find the drone closest to the target
    let closestDrone = null;
    let closestDistance = Infinity;
    
    for (const drone of friendlyDrones) {
      const distance = Math.hypot(drone.x - this.x, drone.y - this.y);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestDrone = drone;
      }
    }
    
    if (!closestDrone) return null;
    
    // Position behind the friendly drone
    const dx = this.target.x - closestDrone.x;
    const dy = this.target.y - closestDrone.y;
    const angle = Math.atan2(dy, dx);
    
    return {
      x: closestDrone.x - Math.cos(angle) * 30,
      y: closestDrone.y - Math.sin(angle) * 30
    };
  }
  
  // Helper: calculate swooping path
  calculateSwoopingPath(targetPlayer) {
    const waypoints = [];
    
    // Calculate a curved path around the target
    const startAngle = Math.atan2(this.y - targetPlayer.y, this.x - targetPlayer.x);
    const arcLength = Math.PI * 0.75; // 135 degrees
    const radius = 80;
    
    for (let i = 1; i <= 5; i++) {
      const angle = startAngle + (arcLength * i / 5);
      waypoints.push({
        x: targetPlayer.x + Math.cos(angle) * radius,
        y: targetPlayer.y + Math.sin(angle) * radius
      });
    }
    
    return waypoints;
  }
  
  // Update AI behavior
  update(dtSeconds, players) {
    // Update state duration
    this.stateDuration = Date.now() - this.lastStateChange;
    
    // Check health-based state changes
    const healthRatio = this.health / this.maxHealth;
    
    if (healthRatio <= this.retreatThreshold && this.state !== 'RETREAT') {
      this.state = 'RETREAT';
      this.lastStateChange = Date.now();
      return;
    }
    
    if (healthRatio <= this.regroupThreshold && this.state !== 'REGROUP') {
      this.state = 'REGROUP';
      this.lastStateChange = Date.now();
      return;
    }
    
    // Execute behavior based on state
    switch (this.state) {
      case 'PATROL':
        this.behavePatrol(dtSeconds);
        break;
      case 'IDLE':
        this.behaveIdle(dtSeconds);
        break;
      case 'CHASE':
        this.behaveChase(dtSeconds, players);
        break;
      case 'ATTACK':
        this.behaveAttack(dtSeconds, players);
        break;
      case 'RETREAT':
        this.behaveRetreat(dtSeconds, players);
        break;
      case 'REGROUP':
        this.behaveRegroup(dtSeconds);
        break;
      case 'FLANK':
        this.behaveFlank(dtSeconds, players);
        break;
    }
    
    // Keep mob within realm bounds
    this.x = Math.max(-WORLD_WIDTH/2, Math.min(WORLD_WIDTH/2, this.x));
    this.y = Math.max(-WORLD_HEIGHT/2, Math.min(WORLD_HEIGHT/2, this.y));
  }
}

// Complete Spawner Management System
function createSpawner(spawnerType, x, y) {
  const config = SPAWNER_TYPES[spawnerType];
  if (!config) throw new Error(`Unknown spawner type: ${spawnerType}`);
  
  const spawner = {
    id: `spawner_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type: spawnerType,
    x: x,
    y: y,
    config: config,
    drones: new Map(), // Map of drone ID to drone object
    lastSpawnTime: 0,
    lastTransferTime: 0
  };
  
  SPAWNERS.set(spawner.id, spawner);
  return spawner;
}

function spawnMob(type, x, y, spawnerId = null) {
  if (mobs.size >= MAX_MOBS) return null;
  
  const mob = new Mob(type, x, y, spawnerId);
  mobs.set(mob.id, mob);
  
  // Associate with spawner if provided
  if (spawnerId && SPAWNERS.has(spawnerId)) {
    const spawner = SPAWNERS.get(spawnerId);
    spawner.drones.set(mob.id, mob);
  }
  
  return mob;
}

function removeMob(mobId) {
  const mob = mobs.get(mobId);
  if (!mob) return;
  
  // Remove from spawner
  if (mob.spawnerId && SPAWNERS.has(mob.spawnerId)) {
    const spawner = SPAWNERS.get(mob.spawnerId);
    spawner.drones.delete(mobId);
  }
  
  mobs.delete(mobId);
}

function getMob(mobId) {
  return mobs.get(mobId);
}

function getAllMobs() {
  return Array.from(mobs.values());
}

// Spawn initial drones for a spawner
function spawnInitialDronesForSpawner(spawner) {
  const config = spawner.config;
  
  for (const [droneType, maxCount] of Object.entries(config.maxDrones)) {
    for (let i = 0; i < maxCount; i++) {
      // Random position within spawn radius
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * config.spawnRadius;
      const x = spawner.x + Math.cos(angle) * distance;
      const y = spawner.y + Math.sin(angle) * distance;
      
      spawnMob(droneType, x, y, spawner.id);
    }
  }
}

// Advanced Spawner Management Update
function updateSpawnerManagement(now) {
  for (const spawner of SPAWNERS.values()) {
    const config = spawner.config;
    
    // Check if spawner needs to spawn new drones
    for (const [droneType, maxCount] of Object.entries(config.maxDrones)) {
      const currentCount = Array.from(spawner.drones.values()).filter(d => d.type === droneType).length;
      
      if (currentCount < maxCount && now - spawner.lastSpawnTime > config.spawnInterval) {
        // Spawn new drone
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * config.spawnRadius;
        const x = spawner.x + Math.cos(angle) * distance;
        const y = spawner.y + Math.sin(angle) * distance;
        
        const newDrone = spawnMob(droneType, x, y, spawner.id);
        if (newDrone) {
          spawner.drones.set(newDrone.id, newDrone);
          spawner.lastSpawnTime = now;
          console.log(`Spawner ${spawner.config.name} spawned new ${droneType}`);
        }
      }
    }
    
    // Check if spawner has excess drones and can transfer them
    for (const [droneType, maxCount] of Object.entries(config.maxDrones)) {
      const currentCount = Array.from(spawner.drones.values()).filter(d => d.type === droneType).length;
      
      if (currentCount > maxCount) {
        // Look for nearby spawners that need this type of drone
        const excessDrones = Array.from(spawner.drones.values())
          .filter(d => d.type === droneType)
          .slice(maxCount); // Get the excess drones
        
        for (const excessDrone of excessDrones) {
          const targetSpawner = findSpawnerNeedingDrones(droneType, spawner);
          if (targetSpawner) {
            // Transfer drone to new spawner
            transferDroneToSpawner(excessDrone, targetSpawner);
            break; // Only transfer one at a time
          }
        }
      }
    }
  }
}

function findSpawnerNeedingDrones(droneType, sourceSpawner) {
  for (const spawner of SPAWNERS.values()) {
    if (spawner.id === sourceSpawner.id) continue;
    
    const distance = Math.hypot(spawner.x - sourceSpawner.x, spawner.y - sourceSpawner.y);
    if (distance > sourceSpawner.config.transferRange) continue;
    
    const config = spawner.config;
    if (config.maxDrones[droneType]) {
      const currentCount = Array.from(spawner.drones.values()).filter(d => d.type === droneType).length;
      if (currentCount < config.maxDrones[droneType]) {
        return spawner;
      }
    }
  }
  return null;
}

function transferDroneToSpawner(drone, targetSpawner) {
  // Remove from old spawner
  if (drone.spawnerId && SPAWNERS.has(drone.spawnerId)) {
    const oldSpawner = SPAWNERS.get(drone.spawnerId);
    oldSpawner.drones.delete(drone.id);
  }
  
  // Add to new spawner
  drone.spawnerId = targetSpawner.id;
  targetSpawner.drones.set(drone.id, drone);
  
  console.log(`Transferred ${drone.type} from spawner to ${targetSpawner.config.name}`);
}

// Update all mobs
function updateMobs(dtSeconds) {
  const players = Array.from(playersByUsername.values());
  
  for (const mob of mobs.values()) {
    // Update AI behavior
    mob.update(dtSeconds, players);
    
    // Check for player detection
    for (const player of players) {
      const distance = Math.hypot(player.x - mob.x, player.y - mob.y);
      if (distance <= mob.detectionRange && !mob.target) {
        mob.target = player.username;
        mob.state = 'CHASE';
        mob.lastStateChange = Date.now();
        break;
      }
    }
  }
}

// Realm configuration
const REALM_CONFIG = {
  nexus: {
    name: 'Nexus',
    size: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    center: { x: 0, y: 0 },
    features: {
      mobSpawning: true,
      spawners: true
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
    socketId: record.socketId || null,
    // Overheat system
    heat: 0.0,
    maxHeat: 1.0,
    heatDecayRate: 0.2, // per second
    lastHeatDecay: Date.now(),
    // Shooting mechanics
    lastShotTime: 0,
    currentWeapon: null,
    burstShotsRemaining: 0,
    burstCooldownUntil: 0
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
  
  const now = Date.now();
  
  // Check if weapon is overheated
  if (player.heat >= player.maxHeat) {
    console.log(`Player ${username} weapon overheated: ${player.heat}/${player.maxHeat}`);
    return null;
  }
  
  // Check burst cooldown for burst weapons
  if (weapon.burstShots > 0 && now < player.burstCooldownUntil) {
    console.log(`Player ${username} burst on cooldown until ${player.burstCooldownUntil}`);
    return null;
  }
  
  // Check rate of fire for non-burst weapons
  if (weapon.burstShots === 0) {
    const timeSinceLastShot = now - player.lastShotTime;
    const shotInterval = 1000 / weapon.ROF;
    if (timeSinceLastShot < shotInterval) {
      console.log(`Player ${username} shot on cooldown: ${timeSinceLastShot}ms < ${shotInterval}ms`);
      return null;
    }
  }
  
  // Add heat
  const heatPerShot = weapon.energyCost || 0.1;
  player.heat = Math.min(player.maxHeat, player.heat + heatPerShot);
  
  // Update burst tracking
  if (weapon.burstShots > 0) {
    if (player.burstShotsRemaining <= 0) {
      player.burstShotsRemaining = weapon.burstShots;
    }
    player.burstShotsRemaining--;
    
    if (player.burstShotsRemaining <= 0) {
      // Start burst cooldown (1 second)
      player.burstCooldownUntil = now + 1000;
    }
  }
  
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
  console.log(`Player ${username} fired ${weapon.name} projectile (heat: ${player.heat.toFixed(2)})`);
  
  return projectile;
}

// Movement and physics
function stepRealm(dtSeconds) {
  const now = Date.now();
  
  for (const player of playersByUsername.values()) {
    // Heat decay
    if (now - player.lastHeatDecay >= 100) { // Update every 100ms
      const timeDiff = (now - player.lastHeatDecay) / 1000;
      player.heat = Math.max(0, player.heat - player.heatDecayRate * timeDiff);
      player.lastHeatDecay = now;
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

    // Keep player within realm bounds
    player.x = Math.max(-WORLD_WIDTH/2, Math.min(WORLD_WIDTH/2, player.x));
    player.y = Math.max(-WORLD_HEIGHT/2, Math.min(WORLD_HEIGHT/2, player.y));
  }
  
  // Update mobs
  updateMobs(dtSeconds);
  
  // Update spawner management
  updateSpawnerManagement(now);
  
  // Update projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const projectile = projectiles[i];
    
    // Update position
    projectile.x += projectile.vx * dtSeconds;
    projectile.y += projectile.vy * dtSeconds;
    
    // Update lifetime
    projectile.life -= dtSeconds;
    
    // Check collision with mobs (player projectiles)
    if (projectile.owner && !projectile.owner.startsWith('mob_')) {
      let hitMob = false;
      for (const mob of mobs.values()) {
        const dx = projectile.x - mob.x;
        const dy = projectile.y - mob.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance < 20) { // 20 pixel collision radius
          // Hit mob!
          const damage = getDamageForItem(projectile.itemId);
          const mobDied = mob.takeDamage(damage, projectile.owner);
          
          if (mobDied) {
            console.log(`Projectile killed ${mob.type}`);
          } else {
            console.log(`Projectile hit ${mob.type} for ${damage} damage`);
          }
          
          hitMob = true;
          break;
        }
      }
      
      if (hitMob) {
        projectiles.splice(i, 1);
        continue;
      }
    }
    
    // Check collision with players (mob projectiles)
    if (projectile.owner && projectile.owner.startsWith('mob_')) {
      let hitPlayer = false;
      for (const player of playersByUsername.values()) {
        const dx = projectile.x - player.x;
        const dy = projectile.y - player.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance < 20) { // 20 pixel collision radius
          // Hit player!
          const damage = getDamageForItem(projectile.itemId);
          console.log(`Mob projectile hit ${player.username} for ${damage} damage`);
          
          // Could add player health system here later
          hitPlayer = true;
          break;
        }
      }
      
      if (hitPlayer) {
        projectiles.splice(i, 1);
        continue;
      }
    }
    
    // Remove expired projectiles
    if (projectile.life <= 0) {
      projectiles.splice(i, 1);
      continue;
    }
    
    // Remove projectiles that go out of realm bounds
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
function moveGear(username, action) {
  const player = getPlayer(username);
  if (!player || !player.gear) return { ok: false, error: 'player not found' };
  
  const { from, to } = action;
  if (!from || !to) return { ok: false, error: 'invalid action' };
  
  const { inventory, hotbar, equipment } = player.gear;
  
  // Get source item
  let sourceItem = null;
  if (from.kind === 'inventory') sourceItem = inventory[from.index];
  else if (from.kind === 'hotbar') sourceItem = hotbar[from.index];
  else if (from.kind === 'equipment') sourceItem = equipment[from.slot];
  
  if (!sourceItem) return { ok: false, error: 'source item not found' };
  
  // Get destination item
  let destItem = null;
  if (to.kind === 'inventory') destItem = inventory[to.index];
  else if (to.kind === 'hotbar') destItem = hotbar[to.index];
  else if (to.kind === 'equipment') destItem = equipment[to.slot];
  
  // Swap items
  if (from.kind === 'inventory') inventory[from.index] = destItem;
  else if (from.kind === 'hotbar') hotbar[from.index] = destItem;
  else if (from.kind === 'equipment') equipment[from.slot] = destItem;
  
  if (to.kind === 'inventory') inventory[to.index] = sourceItem;
  else if (to.kind === 'hotbar') hotbar[to.index] = sourceItem;
  else if (to.kind === 'equipment') equipment[to.slot] = sourceItem;
  
  return { ok: true, gear: player.gear };
}

// Projectile functions
function getProjectileSpeedForItem(itemId) {
  return itemsRegistry[itemId]?.projectileSpeed || 1000;
}

function getHeatPerShot(itemId) {
  const item = itemsRegistry[itemId];
  if (!item) return 0.1;
  return item.energyCost || 0.1; // energyCost field now represents heat per shot
}

function getItemProps(itemId) {
  return itemsRegistry[itemId] || null;
}

function getDamageForItem(itemId) {
  // Handle mob attacks
  if (itemId === 'mob_attack') {
    return 15; // Base mob damage
  }
  
  // Handle player weapons
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
      heat: player.heat,
      maxHeat: player.maxHeat,
      currentWeapon: player.currentWeapon
    };
  }).filter(Boolean);
  
  const portals = Array.from(realm.portals).map(portalId => PORTALS[portalId]).filter(Boolean);
  
  // Get mobs in this realm
  const realmMobs = Array.from(mobs.values()).map(mob => ({
    id: mob.id,
    type: mob.type,
    x: mob.x,
    y: mob.y,
    vx: mob.vx,
    vy: mob.vy,
    health: mob.health,
    maxHealth: mob.maxHealth,
    state: mob.state,
    target: mob.target,
    spawnerId: mob.spawnerId
  }));
  
  // Get spawners in this realm
  const realmSpawners = Array.from(SPAWNERS.values()).map(spawner => ({
    id: spawner.id,
    type: spawner.type,
    x: spawner.x,
    y: spawner.y,
    config: spawner.config,
    droneCount: spawner.drones.size
  }));
  
  return {
    players,
    portals,
    projectiles: projectiles.filter(p => p.realm === realmName),
    mobs: realmMobs,
    spawners: realmSpawners
  };
}

// Initialize realm with complete drone system
async function spawnInitialMobs() {
  // Clear any existing entities
  projectiles.length = 0;
  mobs.clear();
  SPAWNERS.clear();
  
  // Get current realm config
  const realmConfig = REALM_CONFIG.nexus;
  
  console.log('Initializing complete drone and spawner system...');
  console.log(`Realm "${realmConfig.name}" initialized:`);
  console.log(`  - Features: mobSpawning=${realmConfig.features.mobSpawning}, spawners=${realmConfig.features.spawners}`);
  console.log(`  - Size: ${realmConfig.size.width}x${realmConfig.size.height}`);
  console.log(`  - Center: ${realmConfig.center.x}, ${realmConfig.center.y}`);
  console.log(`  - Special areas: ${realmConfig.specialAreas.length}`);
  console.log(`  - Items available: ${Object.keys(itemsRegistry).length}`);
  console.log(`  - Drone types: ${Object.keys(MOB_TYPES).length}`);
  console.log(`  - Spawner types: ${Object.keys(SPAWNER_TYPES).length}`);
  
  // Create test spawners for demonstration
  const spawner1 = createSpawner('spawner_l1', -200, -200);
  const spawner2 = createSpawner('spawner_l2', 200, -200);
  const spawner3 = createSpawner('spawner_l3', 0, 200);
  
  // Spawn initial drones for each spawner
  spawnInitialDronesForSpawner(spawner1);
  spawnInitialDronesForSpawner(spawner2);
  spawnInitialDronesForSpawner(spawner3);
  
  console.log(`Created ${SPAWNERS.size} spawners with ${mobs.size} total drones`);
  console.log('Complete drone system ready for testing!');
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
  getHeatPerShot,
  getItemProps,
  spawnInitialMobs,
  getDamageForItem,
  fireProjectile,
  REALM_CONFIG,
  PORTALS,
  itemsRegistry,
  // Complete drone and spawner system
  MOB_TYPES,
  SPAWNER_TYPES,
  SPAWNERS,
  createSpawner,
  spawnMob,
  removeMob,
  getMob,
  getAllMobs,
  updateMobs,
  updateSpawnerManagement,
  spawnInitialDronesForSpawner,
  findSpawnerNeedingDrones,
  transferDroneToSpawner
};


