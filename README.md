# Venatus

2D top-down real-time multiplayer browser game (Node.js + Express + Socket.IO + SQLite3) with automated Docker + GitHub Actions deployment.

## Quick start (dev)

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Project layout

```
src/
  server.js          # Express + Socket.IO server
  config/db.js       # SQLite3 setup and helper functions
  models/userModel.js
  game/gameState.js  # server-authoritative world + movement + portals
public/
  index.html
  style.css
  client.js
data/
  game.db            # created at runtime
Dockerfile           # multi-stage build
docker-compose.yml   # single service, persists data
.github/workflows/deploy.yml
Caddyfile.example    # sample reverse proxy config
```

## Deployment notes

- Configure Caddy on the host with `Caddyfile.example` (update domain).
- On the VPS, keep a copy of `docker-compose.yml` and run:
  - `docker compose up -d` to start
  - `docker compose pull && docker compose up -d --force-recreate` to redeploy
- In GitHub repo secrets, set: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, optional `VPS_PORT`.


