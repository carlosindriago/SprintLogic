import logging
from pathlib import Path

import sqlglot
from sqlglot import exp

from app.domain.models.schema_ir import ColumnIR, SchemaIR, TableIR

logger = logging.getLogger(__name__)

EXCLUDE_DIRS = {".git", ".venv", "venv", "node_modules", ".next", "dist", "build", "__pycache__"}


def extract_schema_from_sql(sql_content: str, dialect: str = "postgres") -> list[TableIR]:
    """
    Parses SQL string containing DDL statements and extracts TableIR definitions.
    """
    tables_map: dict[str, TableIR] = {}

    try:
        statements = sqlglot.parse(sql_content, read=dialect)
    except Exception:
        try:
            statements = sqlglot.parse(sql_content)
        except Exception as e:
            logger.warning("Failed to parse SQL content: %s", e)
            return []

    for stmt in statements:
        if not stmt or not isinstance(stmt, exp.Create):
            continue

        kind = stmt.args.get("kind")
        schema = stmt.this

        # Handle CREATE TABLE
        if isinstance(schema, exp.Schema):
            table_name = schema.this.name if hasattr(schema.this, "name") else str(schema.this)
            if not table_name:
                continue

            pk_cols: set[str] = set()
            fk_map: dict[str, str | None] = {}

            # Pre-pass: check table-level constraints
            for expr in schema.expressions:
                if isinstance(expr, exp.PrimaryKey):
                    for col in expr.expressions:
                        if hasattr(col, "name"):
                            pk_cols.add(col.name)
                elif isinstance(expr, exp.ForeignKey):
                    ref = expr.find(exp.Reference)
                    target_table = (
                        ref.this.this.name
                        if (ref and hasattr(ref, "this") and hasattr(ref.this, "this"))
                        else None
                    )
                    for col in expr.expressions:
                        if hasattr(col, "name"):
                            fk_map[col.name] = target_table

            columns: list[ColumnIR] = []
            for expr in schema.expressions:
                if isinstance(expr, exp.ColumnDef):
                    col_name = expr.this.name if hasattr(expr.this, "name") else str(expr.this)
                    col_type = expr.kind.sql() if expr.kind else "VARCHAR"

                    constraints_sql = [c.sql().upper() for c in expr.constraints]
                    is_nullable = not any("NOT NULL" in c for c in constraints_sql)
                    is_pk = col_name in pk_cols or any("PRIMARY KEY" in c for c in constraints_sql)

                    ref = expr.find(exp.Reference)
                    target_table = fk_map.get(col_name)
                    if not target_table and ref and hasattr(ref, "this") and hasattr(ref.this, "this"):
                        target_table = ref.this.this.name if hasattr(ref.this.this, "name") else str(ref.this.this)

                    is_fk = bool(target_table)

                    columns.append(
                        ColumnIR(
                            name=col_name,
                            type=col_type,
                            is_pk=is_pk,
                            is_fk=is_fk,
                            is_nullable=is_nullable,
                            target_table=target_table,
                        )
                    )

            if table_name in tables_map:
                # Merge columns if table defined across multiple blocks
                tables_map[table_name].columns.extend(columns)
            else:
                tables_map[table_name] = TableIR(name=table_name, columns=columns, indexes=[])

        # Handle CREATE INDEX
        elif kind == "INDEX" or (isinstance(stmt.this, exp.Table) and "INDEX" in stmt.sql().upper()):
            table_expr = stmt.find(exp.Table)
            if table_expr and hasattr(table_expr, "name") and table_expr.name in tables_map:
                idx_sql = stmt.sql()
                tables_map[table_expr.name].indexes.append(idx_sql)

    return list(tables_map.values())


def scan_project_schema(project_path: str) -> SchemaIR:
    """
    Scans project_path for .sql files and returns a consolidated SchemaIR.
    """
    root = Path(project_path)
    if not root.exists() or not root.is_dir():
        return SchemaIR(tables=[], orm_type="raw_sql")

    all_tables: dict[str, TableIR] = {}

    for file_path in root.rglob("*.sql"):
        if any(part in EXCLUDE_DIRS for part in file_path.parts):
            continue

        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
            tables = extract_schema_from_sql(content)
            for t in tables:
                if t.name not in all_tables:
                    all_tables[t.name] = t
                else:
                    # Merge columns & indexes
                    existing_cols = {c.name for c in all_tables[t.name].columns}
                    for col in t.columns:
                        if col.name not in existing_cols:
                            all_tables[t.name].columns.append(col)
                    all_tables[t.name].indexes.extend(t.indexes)
        except Exception as e:
            logger.warning("Error reading SQL file %s: %s", file_path, e)

    return SchemaIR(tables=list(all_tables.values()), orm_type="raw_sql")
