# Phase 0: Docker Structure

**Goal:** a reproducible containerised environment for development and production, so every later phase runs the same way on any machine.

## Tasks
1. `Dockerfile` with multi-stage builds:
   - `base`: a pinned Node LTS alpine image, with the working directory set and dependency manifests copied in.
   - `dev`: installs all dependencies and runs the Vite dev server with `--host 0.0.0.0`.
   - `build`: runs `npm ci` and `npm run build` to produce `dist/`.
   - `prod`: a pinned nginx alpine image that serves `dist/` as static files on port 80, with an SPA-safe config and gzip enabled.
2. `docker-compose.yml`:
   - `dev` service: builds the `dev` target, bind-mounts the source for hot reload (with an anonymous volume for `node_modules`), publishes port 5173, and enables file-watch polling for WSL2/Docker Desktop (`CHOKIDAR_USEPOLLING` or Vite `server.watch.usePolling`).
   - `prod` service: builds the `prod` target and publishes port 8080, behind a compose profile so it doesn't start by default.
3. `.dockerignore`: `node_modules`, `dist`, `.git`, `docs`, and logs.
4. `nginx.conf`: static serving, gzip for JS/CSS, long cache headers for hashed assets and no-cache for `index.html`.
5. A `Makefile` or npm scripts as shortcuts: `up` (dev), `build`, `prod`, `down`, `logs`.
6. A README section with the Docker commands. Note that the Node version and the three.js version are pinned in one place each.

## Deliverables
- `docker compose up` starts the Vite dev server at `http://localhost:5173` with hot reload.
- `docker compose --profile prod up --build` serves the production build at `http://localhost:8080`.

## Acceptance criteria
- A fresh clone needs only Docker to run the project, with no local Node install.
- Editing a file on the host triggers a reload in the browser, including on WSL2.
- The prod image contains only nginx and the built assets, and is small (nginx alpine plus a few hundred KB of assets; about 93 MB on disk).
- The build is reproducible: it uses `npm ci` and a committed lockfile, and the base images are pinned.
- The container runs without errors on an empty project scaffold (it can be verified against the Phase 1 scaffold).

## Notes
- The Phase 1 scaffold (`package.json`, `vite.config.ts`) is needed to fully exercise these images. Either create a minimal scaffold here or run the first Docker check once Phase 1 task 1 is done.
- The deploy in Phase 4 can use the `prod` image or the GitHub Pages workflow. Keep `base` in `vite.config.ts` configurable via an environment variable so both work.

## Depends on
Nothing. Phase 1 builds on it.
