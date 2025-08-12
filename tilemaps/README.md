# 🎮 PNG Tilemap System

This system automatically loads tilemaps from PNG files in the `tilemaps/` directory.

## How It Works

1. **Place PNG files** in the `tilemaps/` directory
2. **File naming**: `realmname.png` (e.g., `nexus.png`, `range.png`)
3. **Server automatically detects** and loads the PNG files
4. **Real-time updates** when PNG files change

## PNG Color Scheme

- **White pixels** `#ffffff` = Space tiles (walkable)
- **Black pixels** `#000000` = Wall tiles (impassable)
- **Red pixels** `#ff0000` = Coordinate markers - define where (0,0) is centered on the map (converted to space tiles)

## Example Workflow

1. **Create a PNG image** in any image editor (e.g., GIMP, Photoshop, Paint)
2. **Paint your map layout** using the three colors above
3. **Save as PNG** in the `tilemaps/` directory
4. **Name it** `nexus.png` (or whatever realm you want)
5. **Server automatically loads** the new tilemap
6. **Changes are reflected** immediately in the game

## PNG Requirements

- **Format**: PNG (for transparency support)
- **Size**: Any dimensions (e.g., 16x16, 32x32, 64x64 pixels)
- **Colors**: Use the exact RGB values above for best results
- **Transparency**: Supported (transparent pixels become void)

## Auto-Features

- **Auto-origin calculation**: Maps are automatically centered at (0,0)
- **File watching**: Changes are detected and loaded automatically
- **Caching**: Only reloads when PNG files actually change
- **Error handling**: Graceful fallback if PNG loading fails

## Example PNG Layout

```
Black  White  White  Black
White  Red    Red    White
White  Red    Red    White
Black  White  White  Black
```

This creates a 4x4 map with:
- Walkable white tiles (general space)
- Red tiles marking where (0,0) coordinate is centered (become walkable space tiles)
- Impassable black wall tiles around the edges

## Troubleshooting

- **PNG not loading**: Check file permissions and PNG format
- **Wrong colors**: Ensure exact RGB values are used
- **Server restart needed**: Only if you change the tilemap loader code
- **File watching issues**: Check if your OS supports `fs.watch`

## Performance

- **PNG loading**: Only happens on server start or file changes
- **Runtime**: Uses cached tilemap data (no PNG processing during gameplay)
- **Memory**: Efficient tile arrays, not full image data
- **Updates**: Instant when PNG files change
