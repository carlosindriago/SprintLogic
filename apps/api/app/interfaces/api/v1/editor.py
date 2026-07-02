import ast
from fastapi import APIRouter
from pydantic import BaseModel

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
