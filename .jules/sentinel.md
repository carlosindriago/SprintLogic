# Sentinel Learnings

## API Error Handling
- Never leak internal system details (like exception strings or stack traces) directly to the user in HTTP responses (e.g. `raise HTTPException(status_code=500, detail=str(e))`).
- Instead, log the detailed error using `logger.error("Context message: %s", e, exc_info=True)` and return a generic `HTTPException(status_code=500, detail="An internal error occurred")`.

## Git Operations & File Management
- Be extremely careful to not commit generated build artifacts like `apps/api/sprintlogic_api.egg-info` or temporary scripts (e.g. `fix_sec.py`).
- Always run `rm -rf` on temporary files and build artifacts before running git commands.
- Never use `git add .`; explicitly specify paths.
