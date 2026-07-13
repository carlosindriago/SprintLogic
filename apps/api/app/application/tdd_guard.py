import os
from pathlib import Path

import tree_sitter

from app.infrastructure.parser.ast_parser import get_language


class TddGuardValidator:
    def __init__(self, project_path: Path):
        self.project_path = project_path

    def validate_task(self, task_id: str, test_files: list[Path]) -> tuple[bool, list[str]]:
        """
        Valida archivos físicos en disco (usado por el editor en tiempo real).
        """
        files_in_memory = []
        for test_file in test_files:
            if test_file.exists():
                files_in_memory.append((str(test_file), test_file.read_bytes()))
        return self.validate_task_from_memory(task_id, files_in_memory)

    def get_future_state_tests(self) -> list[tuple[str, bytes]]:
        """
        Motor de Fusión (Merge Engine): Lee el estado futuro del repositorio extrayendo
        todos los archivos de test directamente desde el Index (Staging Area) de Git.
        """
        import subprocess
        files_in_memory = []
        try:
            # git ls-files devuelve todo lo que está en el index (staged + tracked no modificados)
            result = subprocess.run(['git', 'ls-files'], cwd=self.project_path, capture_output=True, text=True)
            if result.returncode != 0:
                return []

            all_files = result.stdout.splitlines()
            test_files = [f for f in all_files if ("test" in f or "spec" in f) and f.endswith((".ts", ".tsx", ".py", ".js"))]

            if not test_files:
                return []

            # Modo Batched: Enviar todas las rutas por stdin a git cat-file
            batch_input = "\n".join([f":{f}" for f in test_files]) + "\n"

            process = subprocess.Popen(
                ['git', 'cat-file', '--batch'],
                cwd=self.project_path,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL
            )

            stdout_data, _ = process.communicate(input=batch_input.encode('utf-8'))

            # Parsear la salida de cat-file --batch
            # Formato esperado: <oid> blob <size>\n<contents>\n
            idx = 0
            for file_path in test_files:
                header_end = stdout_data.find(b'\n', idx)
                if header_end == -1:
                    break

                header = stdout_data[idx:header_end].decode('utf-8', errors='ignore')
                parts = header.split()

                if len(parts) >= 3 and parts[1] == "blob":
                    size = int(parts[2])
                    content_start = header_end + 1
                    content = stdout_data[content_start:content_start + size]
                    files_in_memory.append((file_path, content))
                    # Avanzamos el índice saltando el contenido y su salto de línea final
                    idx = content_start + size + 1
                else:
                    # Si el archivo está marcado como "missing", simplemente lo saltamos
                    idx = header_end + 1

        except Exception:
            pass

        return files_in_memory

    def validate_task_from_memory(self, task_id: str, files_in_memory: list[tuple[str, bytes]]) -> tuple[bool, list[str]]:
        """
        Valida si los buffers de memoria proporcionados cumplen con el contrato del TDD Guard.
        Esta es la función clave para leer desde el Git Staging Area (`git show :file`) sin tocar disco.
        """
        errors = []
        found_valid_test = False

        for file_path_str, code in files_in_memory:
            ext = os.path.splitext(file_path_str)[1]
            lang = get_language(ext)
            if not lang:
                continue

            parser = tree_sitter.Parser()
            parser.language = lang

            tree = parser.parse(code)

            if self._check_tree_for_task(tree.root_node, code, task_id):
                found_valid_test = True
                break

        if not found_valid_test:
            errors.append(f"No se encontró un test válido con aserciones para la tarea {task_id}.")
            return False, errors

        return True, []

    def _check_tree_for_task(self, root_node, code: bytes, task_id: str) -> bool:
        """Traverse the AST to find test blocks associated with the task_id containing assertions."""
        valid = False

        def traverse(node):
            nonlocal valid
            if valid:
                return

            is_test_block = False

            if node.type == "call_expression":
                # TS/JS: it('...', () => {}) or test('...', () => {})
                func_node = node.child_by_field_name("function")
                if func_node and func_node.type == "identifier":
                    name = code[func_node.start_byte:func_node.end_byte].decode("utf-8")
                    if name in ("it", "test"):
                        is_test_block = True
            elif node.type == "function_definition":
                # Python: def test_...()
                name_node = node.child_by_field_name("name")
                if name_node:
                    name = code[name_node.start_byte:name_node.end_byte].decode("utf-8")
                    if name.startswith("test_"):
                        is_test_block = True

            if is_test_block:
                # 1. Extraer el docblock precedente
                docblock = self._get_preceding_docblock(node, code)

                # Para Python, el docstring podría estar DENTRO de la función como primer statement
                if not docblock and node.type == "function_definition":
                    body = node.child_by_field_name("body")
                    if body and len(body.children) > 0 and body.children[0].type == "expression_statement":
                        first_expr = body.children[0]
                        if first_expr.children and first_expr.children[0].type == "string":
                            docblock = code[first_expr.start_byte:first_expr.end_byte].decode("utf-8")

                if docblock and f"@sprintlogic-spec {task_id}" in docblock:
                    # 2. Verificar si tiene aserciones
                    if self._has_assertion(node, code):
                        valid = True
                        return

            for child in node.children:
                traverse(child)

        traverse(root_node)
        return valid

    def _get_preceding_docblock(self, node, code: bytes) -> str | None:
        # Subimos al expression_statement si existe, ya que it() es un call_expression envuelto
        target = node
        while target and target.parent and target.parent.type == "expression_statement":
            target = target.parent

        curr = target.prev_named_sibling
        comments = []
        while curr:
            if curr.type == "comment":
                comments.append(code[curr.start_byte:curr.end_byte].decode("utf-8"))
                curr = curr.prev_named_sibling
            else:
                break

        # Unimos todos los comentarios consecutivos encontrados (orden invertido porque fuimos hacia atrás)
        return "\n".join(reversed(comments)) if comments else None

    def _has_assertion(self, node, code: bytes) -> bool:
        has_assert = False

        def traverse(n):
            nonlocal has_assert
            if has_assert:
                return

            # TS/JS: expect(...)
            if n.type == "call_expression":
                func_node = n.child_by_field_name("function")
                if func_node:
                    name = code[func_node.start_byte:func_node.end_byte].decode("utf-8")
                    if name == "expect" or name.startswith("expect."):
                        has_assert = True
                        return

            # Python: assert ...
            if n.type == "assert_statement":
                has_assert = True
                return

            for child in n.children:
                traverse(child)

        traverse(node)
        return has_assert
