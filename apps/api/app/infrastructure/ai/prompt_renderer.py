import jinja2


def render_prompt(template_str: str, **kwargs) -> str:
    """Render a Jinja2 template string with the given variables."""
    try:
        # We use a strict undefined strategy to catch missing variables.
        template = jinja2.Template(template_str, undefined=jinja2.StrictUndefined)
        return template.render(**kwargs)
    except jinja2.exceptions.TemplateError as e:
        raise ValueError(f"Prompt template rendering failed: {e}")
