# Jinja2 Prompts Migration Tasks

- [x] 1. `pyproject.toml`: Add `jinja2>=3.1.0`.
- [x] 2. Create `prompt_renderer.py` for rendering using Jinja2.
- [x] 3. Update `prompt_repository.py` to seed all the additional prompts.
- [x] 4. Update `ai_agent.py`, `insight_worker.py`, `ai.py`, `chat.py`, and `planning_studio.py` to use `get_prompt` and `render_prompt` and remove the hardcoded templates.
