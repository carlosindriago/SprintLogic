import os
import shutil
import subprocess
from pathlib import Path

def main():
    root_dir = Path(__file__).resolve().parent.parent
    web_dir = root_dir / "apps" / "web"
    api_dir = root_dir / "apps" / "api"
    
    print("🚀 Iniciando ensamblaje de SprintLogic...")
    
    # 1. Compilar Next.js
    print("\n📦 [1/4] Compilando Frontend (Next.js)...")
    subprocess.run(["npm", "install"], cwd=web_dir, check=True)
    subprocess.run(["npm", "run", "build"], cwd=web_dir, check=True)
    
    # 2. Copiar archivos estáticos
    print("\n🚚 [2/4] Transfiriendo assets estáticos al Backend...")
    out_dir = web_dir / "out"
    static_dir = api_dir / "static"
    
    if static_dir.exists():
        shutil.rmtree(static_dir)
    
    shutil.copytree(out_dir, static_dir)
    print(f"✅ Archivos copiados a {static_dir}")
    
    # 3. Construir el Ejecutable con PyInstaller
    print("\n🔨 [3/4] Empaquetando Binario con PyInstaller (--onedir)...")
    
    # Lista de gramáticas que deben incluirse obligatoriamente
    grammars = [
        "tree_sitter_go",
        "tree_sitter_python",
        "tree_sitter_javascript",
        "tree_sitter_typescript",
        "tree_sitter_php",
        "tree_sitter_java"
    ]
    
    pyinstaller_args = [
        os.path.join(api_dir, ".venv", "bin", "pyinstaller"),
        "--noconfirm",
        "--onedir",
        "--windowed",
        "--name", "SprintLogic",
        "--add-data", f"static{os.pathsep}static",
    ]
    
    for grammar in grammars:
        pyinstaller_args.extend(["--collect-data", grammar])
        pyinstaller_args.extend(["--collect-binaries", grammar])
        
    pyinstaller_args.append("app/main.py")
    
    # Ejecutamos PyInstaller usando el entorno virtual de python/uv si existe, 
    # asumiendo que el comando 'pyinstaller' está disponible en el entorno activo
    subprocess.run(pyinstaller_args, cwd=api_dir, check=True)
    
    print("\n🎉 [4/4] ¡Monolito ensamblado con éxito!")
    print(f"👉 Revisa la carpeta: {api_dir / 'dist' / 'SprintLogic'}")

if __name__ == "__main__":
    main()
