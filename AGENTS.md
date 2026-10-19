# Agent instructions

## Git workflow (Gitflow)

See `CONTRIBUTING.md` for the full description. Rules for agents:

- Branches: `main` (released, deploys to GitHub Pages), `develop` (integration), `feature/<name>`, `release/<x.y.z>`, `hotfix/<name>`.
- Branch features from `develop` and merge them back into `develop` via PR (squash).
- Branch releases from `develop`; merge into `main` and back into `develop`; tag `vX.Y.Z` on `main`.
- Branch hotfixes from `main`; merge into `main` and back into `develop`.
- Never commit directly to `main` or `develop`, and never force-push them. Work on a topic branch and open a PR.
- CI (`npm run build`) must pass before merging.
- Commit messages: short imperative summary (`Add hint cooldown`).
- Only commit or push when the user asks.
