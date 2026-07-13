import sys
import json
import os
import stat
from pathlib import Path
from app.application.tdd_guard import TddGuardValidator

def run_pre_commit():
    """
    Punto de entrada para el Git Hook. Lee el estado activo sin recibir parámetros,
    y ejecuta el Motor de Fusión.
    """
    # En un entorno real, project_root sería el directorio desde donde se llama a Git.
    project_root = Path.cwd()
    state_file = project_root / ".sprintlogic" / "active_state.json"
    
    if not state_file.exists():
        # Modo exploratorio, sin tarea activa. Permitimos el commit.
        sys.exit(0)
        
    try:
        with open(state_file, "r") as f:
            state = json.load(f)
    except Exception:
        sys.exit(0)
        
    active_task = state.get("active_task")
    strict_tdd = state.get("strict_tdd_mode", False)
    
    if not active_task or not strict_tdd:
        sys.exit(0)
        
    validator = TddGuardValidator(project_root)
    # Extraemos el estado futuro (Index)
    files_in_memory = validator.get_future_state_tests()
    
    is_valid, errors = validator.validate_task_from_memory(active_task, files_in_memory)
    
    if not is_valid:
        print("\n" + "="*50)
        print("❌ SPRINTLOGIC TDD GUARD: COMMIT RECHAZADO")
        print("="*50)
        print(f"No se detectó cumplimiento del contrato para: {active_task}")
        for err in errors:
            print(f"  - {err}")
        print("Solución: Asegúrate de que el test con '@sprintlogic-spec' tenga un 'expect/assert'.")
        print("="*50 + "\n")
        sys.exit(1)
        
    print(f"✅ SprintLogic TDD Guard: Contrato verificado para {active_task}.")
    sys.exit(0)

def inject_git_hook(project_root: Path):
    """
    Inyecta físicamente el archivo bash en .git/hooks/pre-commit
    """
    hooks_dir = project_root / ".git" / "hooks"
    if not hooks_dir.exists():
        hooks_dir.mkdir(parents=True, exist_ok=True)
        
    pre_commit_path = hooks_dir / "pre-commit"
    
    # El script Bash usa heurística para invocar a SprintLogic de forma segura
    # dependiendo de si está empaquetado (PyInstaller) o corriendo en desarrollo.
    hook_content = """#!/usr/bin/env bash
# ==========================================
# SprintLogic TDD Guard - Pre-Commit Hook
# ==========================================
# Este hook lee el Staging Area y valida los contratos AST.

# Buscamos el binario compilado o usamos el entorno virtual
if [ -f "./SprintLogic-CLI" ]; then
    ./SprintLogic-CLI tdd-guard
    exit $?
elif [ -f "./.venv/bin/python" ]; then
    # Añadimos apps/api al PYTHONPATH para que encuentre el modulo app
    PYTHONPATH=apps/api ./.venv/bin/python -m app.application.cli tdd-guard
    exit $?
elif [ -f "./apps/api/.venv/bin/python" ]; then
    PYTHONPATH=apps/api ./apps/api/.venv/bin/python -m app.application.cli tdd-guard
    exit $?
else
    # Fallback silencioso si no encontramos el entorno
    echo "⚠️ SprintLogic TDD Guard: No se encontró entorno. Ignorando validación."
    exit 0
fi
"""

    pre_commit_path.write_text(hook_content, encoding="utf-8")
    
    # Hacer el script ejecutable (chmod +x)
    st = os.stat(pre_commit_path)
    os.chmod(pre_commit_path, st.st_mode | stat.S_IEXEC)
    
if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "tdd-guard":
        run_pre_commit()
