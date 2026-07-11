import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from app.domain.ports.language_analyzer import LanguageAnalyzerStrategy

logger = logging.getLogger(__name__)


class TypeScriptAnalyzerStrategy(LanguageAnalyzerStrategy):
    """
    Strategy to parse TypeScript/JavaScript projects.
    It calls an external Node.js script to extract the actual AST.
    """

    def is_compatible(self, project_path: Path) -> bool:
        """
        Compatible if package.json or tsconfig.json exists.
        """
        return (project_path / "package.json").exists() or (project_path / "tsconfig.json").exists()

    async def parse_dependencies(self, project_path: Path) -> dict[str, Any]:
        """
        Calls the Node.js ts_parser.js script securely using asyncio to prevent Event Loop blocking.
        """
        # Ruta al micro-script empaquetado (asumiendo que está en la carpeta scripts)
        script_path = Path(__file__).resolve().parent.parent.parent.parent.parent / "scripts" / "ts_parser.js"
        
        if not script_path.exists():
            raise FileNotFoundError(f"No se encontró el parser de Node en: {script_path}")

        logger.info(f"Iniciando subproceso Node.js para analizar TypeScript en: {project_path}")
        
        try:
            # CEDEMOS EL CONTROL AL EVENT LOOP
            # stdin=asyncio.subprocess.DEVNULL evita que el subproceso se cuelgue esperando entrada
            process = await asyncio.create_subprocess_exec(
                "node", str(script_path), str(project_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                stdin=asyncio.subprocess.DEVNULL 
            )

            # COMMUNICATE: La única forma segura de evitar Deadlocks por buffers llenos
            stdout_bytes, stderr_bytes = await process.communicate()

            if process.returncode != 0:
                error_msg = stderr_bytes.decode('utf-8', errors='replace').strip()
                logger.error(f"El parser de Node.js falló (Código {process.returncode}): {error_msg}")
                raise RuntimeError(f"Fallo al analizar TypeScript: {error_msg}")

            # Decodificamos la respuesta JSON del STDOUT
            output_str = stdout_bytes.decode('utf-8')
            return json.loads(output_str)

        except json.JSONDecodeError as e:
            logger.error("Node.js no devolvió un JSON válido. Revisa los console.log errantes en ts_parser.js.")
            raise RuntimeError("Respuesta inválida del parser de TypeScript.") from e
        except Exception as e:
            logger.error(f"Error crítico ejecutando el subproceso de TypeScript: {str(e)}")
            raise
