# Contributing

This repo follows Gitflow.

## Branches

| Branch | Branches from | Merges into | Purpose |
|---|---|---|---|
| `main` | n/a | n/a | Released code. Every push deploys to GitHub Pages. Tagged `vX.Y.Z`. |
| `develop` | `main` | n/a | Integration branch for the next release. |
| `feature/<name>` | `develop` | `develop` | New work. |
| `release/<x.y.z>` | `develop` | `main` and `develop` | Release stabilisation (version bump, last fixes). |
| `hotfix/<name>` | `main` | `main` and `develop` | Urgent production fixes. |

## Workflow

```sh
# feature
git switch develop && git pull
git switch -c feature/my-change
# ...commit, push, open a PR into develop

# release
git switch -c release/1.2.0 develop
# bump version, fix, PR into main; after merge:
git tag v1.2.0 && git push --tags
# merge main back into develop

# hotfix
git switch -c hotfix/crash-on-start main
# fix, PR into main; then merge main back into develop
```

## Rules

- Never commit directly to `main` or `develop`; open a PR. CI (`npm run build`) must pass.
- Features are squash-merged into `develop`. Releases and hotfixes are merged with a merge commit so history stays connected.
- Delete topic branches after merging.
- Commit messages: short imperative summary (`Add hint cooldown`).

## Recommended GitHub settings

Protect `main` and `develop`: require a PR and the `CI / build` check, and block force pushes.
