import ast

from fastapi import APIRouter
from pydantic import BaseModel

from app.application.ast_auditor import ast_auditor

router = APIRouter()


class LintRequest(BaseModel):
    code: str
    language: str = "python"


class LintDiagnostic(BaseModel):
    line: int
    column: int
    message: str
    severity: str = "error"


@router.post("/lint", response_model=list[LintDiagnostic])
async def lint_code(request: LintRequest):
    if request.language != "python":
        return []

    try:
        ast.parse(request.code)
    except SyntaxError as e:
        return [
            LintDiagnostic(
                line=e.lineno or 1,
                column=e.offset or 1,
                message=e.msg,
                severity="error",
            )
        ]

    return []


class AuditRequest(BaseModel):
    code: str
    language: str = "typescript"


class UndocumentedExportResponse(BaseModel):
    name: str
    signature: str
    start_line: int
    start_column: int
    end_line: int
    end_column: int


@router.post("/audit", response_model=list[UndocumentedExportResponse])
async def audit_code(request: AuditRequest):
    if request.language not in ["typescript", "javascript", "ts", "js"]:
        return []

    try:
        results = ast_auditor.audit_code(request.code.encode('utf8'))
        return [
            UndocumentedExportResponse(
                name=r.name,
                signature=r.signature,
                start_line=r.start_line,
                start_column=r.start_column,
                end_line=r.end_line,
                end_column=r.end_column
            ) for r in results
        ]
    except Exception as e:
        print(f"Error auditing code: {e}")
        return []

class GenerateDocRequest(BaseModel):
    signature: str

class GenerateDocResponse(BaseModel):
    jsdoc: str

@router.post("/generate_docs", response_model=GenerateDocResponse)
async def generate_docs(request: GenerateDocRequest):
    try:
        from app.application.ai_agent import agent

        prompt = f"""Escribe ÚNICAMENTE un comentario JSDoc válido y profesional para la siguiente firma de función/variable exportada.
NO inventes lógica interna. Usa el formato /** ... */.
Firma: {request.signature}
Solo devuelve el bloque JSDoc, sin bloques de código markdown, sin texto adicional."""

        response = await agent.chat([{"role": "user", "content": prompt}])
        # Clean up markdown code blocks if the LLM adds them
        jsdoc = response.strip()
        if jsdoc.startswith("```"):
            lines = jsdoc.split("\n")
            if len(lines) > 2:
                jsdoc = "\n".join(lines[1:-1])

        # Ensure it ends with a newline so it formats well
        if not jsdoc.endswith("\n"):
            jsdoc += "\n"

        return GenerateDocResponse(jsdoc=jsdoc)
    except Exception as e:
        print(f"Error generating docs: {e}")
        return GenerateDocResponse(jsdoc="/**\n * Falló la generación de documentación.\n */\n")
