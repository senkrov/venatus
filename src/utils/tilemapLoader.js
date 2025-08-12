const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

// Tile size constant
const TILE_SIZE = 64;

// Tile color definitions (RGB values)
const TILE_COLORS = {
  SPACE: [255, 255, 255], // White = walkable space
  WALL: [0, 0, 0],        // Black = wall
  RED: [255, 0, 0]        // Red = special floor tiles around (0,0)
};

// Tilemaps directory
const TILEMAPS_DIR = path.join(__dirname, '../../tilemaps');

// Ensure tilemaps directory exists
if (!fs.existsSync(TILEMAPS_DIR)) {
  fs.mkdirSync(TILEMAPS_DIR, { recursive: true });
  console.log('Created tilemaps directory:', TILEMAPS_DIR);
}

// Cache for loaded tilemaps
const tilemapCache = new Map();

// Find closest tile type based on RGB values
function findClosestTileType(r, g, b) {
  let bestMatch = 'wall';
  let bestDistance = Infinity;
  
  for (const [tileType, [tr, tg, tb]] of Object.entries(TILE_COLORS)) {
    const distance = Math.sqrt(
      Math.pow(r - tr, 2) + 
      Math.pow(g - tg, 2) + 
      Math.pow(b - tb, 2)
    );
    
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = tileType.toLowerCase();
    }
  }
  
  return bestMatch;
}

// Calculate map origin based on red pixel positions (0,0 markers)
function calculateOriginFromRedPixels(filePath, image) {
  try {
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, image.width, image.height);
    const pixels = imageData.data;
    
    let redPixelCount = 0;
    let totalRedX = 0;
    let totalRedY = 0;
    
    // Find all red pixels
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const pixelIndex = (y * image.width + x) * 4;
        const r = pixels[pixelIndex];
        const g = pixels[pixelIndex + 1];
        const b = pixels[pixelIndex + 2];
        
        // Check if this is a red pixel (marking 0,0)
        if (r > 200 && g < 50 && b < 50) { // Red pixel detection
          redPixelCount++;
          totalRedX += x;
          totalRedY += y;
        }
      }
    }
    
    if (redPixelCount === 0) {
      console.log(`⚠️  No red pixels found in ${filePath}, using default origin (0,0)`);
      return { x: 0, y: 0 };
    }
    
    // Calculate center of red pixels (this will be where 0,0 is)
    const centerRedX = Math.floor(totalRedX / redPixelCount);
    const centerRedY = Math.floor(totalRedY / redPixelCount);
    
    // Calculate origin so that the center of red pixels maps to (0,0)
    const originX = -(centerRedX * TILE_SIZE);
    const originY = -(centerRedY * TILE_SIZE);
    
    console.log(`🎯 Red pixel center: (${centerRedX}, ${centerRedY}) → Origin: (${originX}, ${originY})`);
    
    return { x: originX, y: originY };
    
  } catch (error) {
    console.error(`❌ Error calculating origin from red pixels:`, error.message);
    return { x: 0, y: 0 }; // Fallback to default
  }
}

// Load tilemap from PNG file
async function loadTilemapFromPNG(filePath, realmName, mapOrigin = { x: 0, y: 0 }) {
  try {
    // Load image using canvas
    const image = await loadImage(filePath);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    
    // Draw image to canvas
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, image.width, image.height);
    const pixels = imageData.data;
    
    // Convert pixels to tiles
    const tiles = [];
    let redTileCount = 0;
    
    for (let y = 0; y < image.height; y++) {
      const row = [];
      for (let x = 0; x < image.width; x++) {
        const pixelIndex = (y * image.width + x) * 4;
        const r = pixels[pixelIndex];
        const g = pixels[pixelIndex + 1];
        const b = pixels[pixelIndex + 2];
        
        // Find closest matching tile type
        let tileType = findClosestTileType(r, g, b);
        
        // Count red tiles (they mark where 0,0 coordinate should be centered)
        if (tileType === 'red') {
          redTileCount++;
          tileType = 'space'; // Red tiles become space tiles
        }
        
        row.push(tileType);
      }
      tiles.push(row);
    }
    
    // Create tilemap object
    const tilemap = {
      name: `${realmName} Map`,
      tiles: tiles,
      origin: mapOrigin,
      width: image.width,
      height: image.height,
      source: 'png',
      filePath: filePath,
      lastModified: fs.statSync(filePath).mtime,
      redTileCount: redTileCount
    };
    
    // Cache the tilemap
    tilemapCache.set(realmName, tilemap);
    
    console.log(`✅ Loaded tilemap from PNG: ${realmName}`);
    console.log(`   Size: ${image.width} x ${image.height} tiles`);
    console.log(`   Origin: (${mapOrigin.x}, ${mapOrigin.y})`);
    console.log(`   World size: ${image.width * 64} x ${image.height * 64} pixels`);
    console.log(`   Red tiles found: ${redTileCount} (converted to space tiles around 0,0)`);
    
    return tilemap;
    
  } catch (error) {
    console.error(`❌ Failed to load tilemap from ${filePath}:`, error.message);
    return null;
  }
}

// Auto-detect and load tilemaps from PNG files
async function autoLoadTilemaps() {
  try {
    const files = fs.readdirSync(TILEMAPS_DIR);
    const pngFiles = files.filter(file => file.endsWith('.png'));
    
    console.log(`🔍 Found ${pngFiles.length} PNG files in tilemaps directory`);
    
    for (const pngFile of pngFiles) {
      const filePath = path.join(TILEMAPS_DIR, pngFile);
      const realmName = pngFile.replace('.png', '').toLowerCase();
      
      // Check if file has changed
      const stats = fs.statSync(filePath);
      const cached = tilemapCache.get(realmName);
      
      if (!cached || stats.mtime > cached.lastModified) {
        console.log(`🔄 Loading/updating tilemap for ${realmName}...`);
        
        // Calculate origin based on red pixel positions (0,0 markers)
        const image = await loadImage(filePath);
        const origin = calculateOriginFromRedPixels(filePath, image);
        
        await loadTilemapFromPNG(filePath, realmName, origin);
      } else {
        console.log(`✅ Tilemap ${realmName} is up to date`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error auto-loading tilemaps:', error.message);
  }
}

// Watch for file changes and auto-reload
function watchTilemapFiles() {
  console.log('👀 Watching tilemap files for changes...');
  
  fs.watch(TILEMAPS_DIR, { recursive: false }, async (eventType, filename) => {
    if (filename && filename.endsWith('.png')) {
      console.log(`🔄 PNG file changed: ${filename}`);
      
      // Wait a moment for file to finish writing
      setTimeout(async () => {
        const realmName = filename.replace('.png', '').toLowerCase();
        const filePath = path.join(TILEMAPS_DIR, filename);
        
        if (fs.existsSync(filePath)) {
          console.log(`🔄 Reloading tilemap for ${realmName}...`);
          
          // Calculate origin from red pixels for file watching updates
          const image = await loadImage(filePath);
          const origin = calculateOriginFromRedPixels(filePath, image);
          await loadTilemapFromPNG(filePath, realmName, origin);
        }
      }, 100);
    }
  });
}

// Get all loaded tilemaps
function getAllTilemaps() {
  return Object.fromEntries(tilemapCache);
}

// Get specific tilemap
function getTilemap(realmName) {
  return tilemapCache.get(realmName);
}

// Export tilemap as optimized JavaScript code
function exportTilemapAsCode(realmName) {
  const tilemap = tilemapCache.get(realmName);
  if (!tilemap) return null;
  
  let code = `// Auto-generated tilemap for ${realmName}\n`;
  code += `const ${realmName.toUpperCase()}_TILEMAP = {\n`;
  code += `  name: '${tilemap.name}',\n`;
  code += `  tiles: [\n`;
  
  for (let y = 0; y < tilemap.height; y++) {
    code += `    ['${tilemap.tiles[y].join("', '")}'],\n`;
  }
  
  code += `  ],\n`;
  code += `  origin: { x: ${tilemap.origin.x}, y: ${tilemap.origin.y} },\n`;
  code += `  width: ${tilemap.width},\n`;
  code += `  height: ${tilemap.height}\n`;
  code += `};\n\n`;
  
  code += `// Usage: REALM_TILE_MAPS.${realmName} = ${realmName.toUpperCase()}_TILEMAP;\n`;
  
  return code;
}

module.exports = {
  TILEMAPS_DIR,
  autoLoadTilemaps,
  watchTilemapFiles,
  getAllTilemaps,
  getTilemap,
  exportTilemapAsCode,
  loadTilemapFromPNG
};
