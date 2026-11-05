# OmniSight

Upload videos, turn them into a searchable knowledge base, and chat with them. Answers cite the exact moments they come from: click a timestamp to open the YouTube video at that second, or the built-in player if the video isn't linked to YouTube.

## Lint & format

GitHub Actions runs these on every push to `main` and on pull requests that touch each folder (`.github/workflows/`).

Backend ([Ruff](https://docs.astral.sh/ruff/), config in `backend/pyproject.toml`):

```bash
docker compose exec backend sh -c "pip install -q -r requirements-dev.txt && ruff check --fix . && ruff format ."
```

Frontend (ESLint + Prettier with Tailwind class sorting; shadcn's generated `components/ui` is left as shipped):

```bash
docker compose exec frontend sh -c "npm run lint && npm run format && npm run typecheck"
```
