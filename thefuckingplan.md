# project venatus - blueprint

## project goal & technology stack

your primary goal is to create a 2d top-down, real-time multiplayer browser game from scratch. the final project must be architected for a professional, automated deployment pipeline using Docker and GitHub actions to an Ubuntu VPS, making the game accessible at a public domain.

### technology stack:

  * **backend:** node.js with the express framework.
  * **real-time communication:** `socket.io` for all client-server communication.
  * **frontend:** plain html5, css, and modern javaScript (es6+). use a single html `<canvas>` element for rendering the game world. **do not use any frontend frameworks (like react) or game engines (like phaser).**
  * **data persistence:** use `sqlite3` for storing all persistent player data. the database file should be located at `data/game.db`.
  * **server & deployment:** docker, docker compose, and a gitHub actions workflow.
  * **reverse proxy:** the setup should be designed to work with caddy as a reverse proxy on the host server for automatic https.

-----

## project structure & deployment automation

please generate a logical file structure. most importantly, create all the necessary configuration files for a seamless, automated deployment.

1.  **`Dockerfile`**: create a multi-stage `Dockerfile`. the build stage should install dependencies and build any necessary assets. the final stage should copy from the build stage into a slim `node` image, creating a lightweight, production-ready container.

2.  **`docker-compose.yml`**:

      * define a single service for the game server.
      * use the docker image built from the `Dockerfile`.
      * set `restart: always` to ensure the service automatically restarts on crash or server reboot.
      * map the container's internal port (e.g., 3000) to a port on the host.
      * mount a volume for persistent data: `./data:/usr/src/app/data`. this ensures the sqlite database file persists outside the container.

3.  **`.github/workflows/deploy.yml`**: create a gitHub actions workflow file that automates deployment.

      * **trigger:** on a `push` to the `main` branch.
      * **jobs:**
          * **`build-and-push`**: logs into a container registry (use gitHub container registry placeholders), builds the docker image, tags it with the gitHub sha, and pushes it.
          * **`deploy`**: requires `build-and-push` to complete. it should contain a placeholder script for securely connecting to a vps and redeploying the service. provide detailed comments explaining where i need to add my vps `host`, `username`, and `ssh_key` secrets. the ssh script should perform these actions on the vps:
            ```bash
            # navigate to the application directory on the vps
            cd /path/to/my/game/app

            # pull the new image version from the container registry
            docker-compose pull

            # restart the service with the new image in detached mode
            docker-compose up -d --force-recreate

            # clean up old, unused docker images to save disk space
            docker image prune -f
            ```

4.  **`Caddyfile.example`**: provide an example caddy configuration file. this file will be used on the vps to set up a reverse proxy with automatic https.

    ```
    play.senkrov.com {
        # caddy will automatically provision and renew ssl certificates for this domain.
        reverse_proxy localhost:3000 # proxy traffic to the docker container's mapped port.
    }
    ```

-----

## player data persistence & model

using the `sqlite3` package, create a `users` table to store player data. the server should load a player's data upon connection and save it periodically and upon disconnection.

### schema:

  * `username` (text, primary key)
  * `x_position` (real)
  * `y_position` (real)
  * `current_world` (text, e.g., 'nexus' or 'range')
  * `gear_data` (text — this will store a single JSON string)

the `gear_data` JSON object must contain all inventory, hotbar, and equipped items, structured as follows. use `null` to represent an empty slot.

```json
{
  "inventory": [null, {"id": "item_pistol_a"}, null, null, null, null, null, null],
  "hotbar": [{"id": "item_pistol_a"}, null, null, null],
  "equipment": {
    "weapon": {"id": "item_pistol_a"},
    "armor": null
  }
}
```

-----

## core gameplay features

### multiplayer environment

  * real-time multiplayer using the `socket.io` server.
  * two always-on interconnected worlds: `nexus` and `range`. players can travel between them using portals.
  * server authoritatively manages and synchronizes game state (player positions, items, projectiles) to all clients in the same world.

### character movement and controls

  * `WASD` keyboard controls for movement.
  * implement physics with `acceleration = 0.1` and `friction = 0.95`. velocity is updated each frame and capped at a maximum of `5.0`.
  * enforce world boundaries to prevent players from leaving the map area.
  * implement the pointer lock api for immersive mouse control when the user clicks the game canvas.

### combat system

  * weapon-based combat with projectiles.
  * implement a 3-shot burst firing mode with a 1-second cooldown after each burst.
  * the player's weapon sprite should sway to follow the mouse cursor's angle relative to the player.
  * create a visual muzzle flash effect at the weapon's tip when firing.
  * show an ammo indicator on the ui representing the 3 shots available in the current burst.

### inventory management

  * create a ui for a dual-layer inventory system based on the `gear_data` JSON object:
      * 8-slot main inventory grid.
      * 4-slot hotbar grid. one slot is always active/highlighted.
  * implement a drag-and-drop interface for managing items between inventory, hotbar, and equipment slots.
  * pressing the `tab` key toggles the main inventory's visibility.
  * mouse wheel scrolling cycles through the active hotbar slot.
  * dropping an item from the inventory ui onto the game world should send an event to the server to drop the item on the ground near the player.

### item system

  * items can exist in the world and be picked up by players who are nearby.
  * create a system for defining items with metadata (e.g., `id`, `name`, `description`, `type`, `class`). define a few sample items (e.g., a pistol, a rifle).
  * use simple placeholder sprites for items. all asset paths should be clearly defined (e.g., `/assets/sprites/items/item_pistol_a.png`).

### portal system

  * render portals in the world. when a player is near a portal, display a message "press [f] to travel."
  * pressing the `f` key near a portal should transport the player to the corresponding coordinates in the connected world.

-----

## visual design & aesthetics

### ui elements

  * **general theme:** use a dark theme (background `#1a1a1a`) with neon blue accents (`#00ffff`) for outlines and highlights. use the 'roboto mono' font.
  * **crosshair:** use a custom crosshair sprite for aiming.
  * **message box:** a fixed box in the bottom-left corner for contextual messages (e.g., portal proximity, item pickup info).
  * **minimap:** a small map in the top-right corner showing player positions (dots), portal locations (squares), and world boundaries.
  * **inventory/hotbar:** position the hotbar at the bottom-center. the main inventory should appear in the bottom-right when toggled. both should be rounded rectangle panels with outlines.

### world rendering

  * render a grid-based tile map for the world floor.
  * the camera should smoothly follow and remain centered on the local player.
  * projectiles should be rendered as glowing particle effects.
  * player characters should have a subtle glow effect to stand out from the background.

-----

## technical & user experience features

  * **responsive design:** the canvas should fill the entire browser window and resize dynamically.
  * **performance:** use `requestanimationframe` for the main game loop. the server should handle state management, with the client interpolating for smoothness.
  * **feedback:** provide clear visual feedback for all interactions (firing, item drops, etc.). the codebase should include a placeholder `playsound()` function where audio effects can be easily added later.
