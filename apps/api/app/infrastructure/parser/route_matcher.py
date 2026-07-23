import re


def normalize_backend_route(route: str) -> str:
    """
    Convierte rutas de backend como /api/v1/users/{id} a /api/v1/users/*
    Soporta {algo}, :algo
    """
    # Reemplaza los placeholders de tipo {id} o {variableName}
    normalized = re.sub(r'\{[^}]+\}', '*', route)
    # Reemplaza params de tipo :id
    normalized = re.sub(r':[a-zA-Z0-9_]+', '*', normalized)
    # Limpia dobles slashes
    normalized = re.sub(r'/+', '/', normalized)
    return normalized.rstrip('/')

def normalize_frontend_route(route: str) -> str:
    """
    Convierte rutas extraídas de frontend (con comodines de template o variables)
    a formato de asterisco, ej. /api/v1/users/${userId} -> /api/v1/users/*
    Las variables dinámicas ya deberían venir del AST como '*' o '${VAR}'
    """
    # Reemplaza cualquier interpolación explícita (ej ${userId}) por *
    normalized = re.sub(r'\$\{[^}]+\}', '*', route)
    # Limpia comodines seguidos ej ** -> *
    normalized = re.sub(r'\*+', '*', normalized)
    normalized = re.sub(r'/+', '/', normalized)
    return normalized.rstrip('/')

def do_routes_match(consumer_route: str, exposer_route: str) -> bool:
    """
    Evalúa si la ruta del frontend (consumer) hace match con la del backend (exposer).
    Ambas deben estar normalizadas.
    El consumer_route a veces incluye un baseUrl desconocido. Así que verificamos si
    el exposer_route es un sufijo exacto de consumer_route.
    """
    if not consumer_route or not exposer_route:
        return False

    c = normalize_frontend_route(consumer_route)
    e = normalize_backend_route(exposer_route)

    if c == e:
        return True
    if c.endswith(e):
        return True

    # Matching con comodines básicos:
    # c = */api/users/*
    # e = /api/users/*
    e_regex = re.escape(e).replace('\\*', '.*')

    # Comprobar si el e_regex matchea el sufijo del consumer
    if re.search(f"{e_regex}$", c):
        return True

    return False
