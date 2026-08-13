def determine_project_type(core_tech: set[str]) -> str:
    """Determines the project type based on detected technologies."""
    if "Java" in core_tech and (
        "Angular" in core_tech or "React" in core_tech or "Vue" in core_tech
    ):
        return "Monorepo (Java + Frontend)"
    elif "Python" in core_tech and (
        "Angular" in core_tech or "React" in core_tech or "Vue" in core_tech
    ):
        return "Monorepo (Python + Frontend)"
    elif "Java" in core_tech:
        return "Java / JVM"
    elif "Python" in core_tech:
        return "Python"
    elif "Tauri" in core_tech:
        return "Tauri App"
    elif (
        "Angular" in core_tech
        or "React" in core_tech
        or "Vue" in core_tech
        or "Next.js" in core_tech
    ):
        return "Node.js / Web"
    return "Unknown"
