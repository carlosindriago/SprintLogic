import tree_sitter_typescript as tsts
from tree_sitter import Language, Parser, Node, Query, QueryCursor
from dataclasses import dataclass

TS_LANGUAGE = Language(tsts.language_typescript())
parser = Parser(TS_LANGUAGE)

@dataclass
class UndocumentedExport:
    name: str
    signature: str
    start_line: int
    start_column: int
    end_line: int
    end_column: int

class ASTAuditor:
    def __init__(self):
        # Query to find all export statements that export a function or arrow function
        # We capture the export_statement as @export_target
        # We capture the function name, parameters, and return type for signature extraction
        self.export_query = Query(TS_LANGUAGE, """
        (export_statement
          declaration: [
            (function_declaration
              name: (identifier) @func.name
              parameters: (formal_parameters) @func.params
              return_type: (type_annotation)? @func.return
            )
            
            (lexical_declaration
              (variable_declarator
                name: (identifier) @var.name
                value: (arrow_function
                  parameters: (formal_parameters) @var.params
                  return_type: (type_annotation)? @var.return
                )
              )
            )
          ]
        ) @export_target
        """)

        # Query to find exports that already have a preceding comment
        self.doc_query = Query(TS_LANGUAGE, """
        (
          (comment)+ @doc
          .
          (export_statement) @exported_with_doc
        )
        """)

    def audit_code(self, source_code: bytes) -> list[UndocumentedExport]:
        tree = parser.parse(source_code)
        
        # 1. Find all exports with comments
        doc_cursor = QueryCursor(self.doc_query)
        doc_matches = doc_cursor.matches(tree.root_node)
        documented_nodes = set()
        for match in doc_matches:
            for capture_name, nodes in match[1].items():
                if capture_name == "exported_with_doc":
                    for node in nodes:
                        documented_nodes.add(node.id)

        # 2. Find all export targets
        export_cursor = QueryCursor(self.export_query)
        export_matches = export_cursor.matches(tree.root_node)
        
        results = []
        for match in export_matches:
            captures = match[1]
            export_nodes = captures.get("export_target")
            export_node = export_nodes[0] if export_nodes else None
            
            if not export_node or export_node.id in documented_nodes:
                continue

            # Extract signature parts
            name = ""
            params = ""
            ret_type = ""
            name_node = None

            if "func.name" in captures:
                name_node = captures["func.name"][0]
                name = name_node.text.decode('utf8')
                params_nodes = captures.get("func.params")
                params = params_nodes[0].text.decode('utf8') if params_nodes else "()"
                ret_nodes = captures.get("func.return")
                ret_type = ret_nodes[0].text.decode('utf8') if ret_nodes else ""
            elif "var.name" in captures:
                name_node = captures["var.name"][0]
                name = name_node.text.decode('utf8')
                params_nodes = captures.get("var.params")
                params = params_nodes[0].text.decode('utf8') if params_nodes else "()"
                ret_nodes = captures.get("var.return")
                ret_type = ret_nodes[0].text.decode('utf8') if ret_nodes else ""

            if not name_node:
                name_node = export_node

            signature = f"{name} = {params}{ret_type}"
            
            # Line is 1-indexed for Monaco, col is 1-indexed
            results.append(UndocumentedExport(
                name=name,
                signature=signature,
                start_line=name_node.start_point.row + 1,
                start_column=name_node.start_point.column + 1,
                end_line=name_node.end_point.row + 1,
                end_column=name_node.end_point.column + 1
            ))
            
        return results

ast_auditor = ASTAuditor()
