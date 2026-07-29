from app.domain.models.schema_ir import SchemaIR


def export_to_sql(schema: SchemaIR) -> str:
    """
    Generates standard SQL DDL (CREATE TABLE) statements from the SchemaIR.
    """
    lines = []
    lines.append("-- Generado por SprintLogic Database Studio")
    lines.append(f"-- Framework Detectado: {schema.detected_framework or 'Desconocido'}")
    lines.append(f"-- Nivel de Extracción: {schema.extraction_level}")
    lines.append("")

    for table in schema.tables:
        lines.append(f"CREATE TABLE {table.name} (")
        col_defs = []
        for col in table.columns:
            col_def = f"    {col.name} {col.type}"
            if col.is_pk:
                col_def += " PRIMARY KEY"
            if not col.is_nullable and not col.is_pk:
                col_def += " NOT NULL"
            col_defs.append(col_def)

        lines.append(",\n".join(col_defs))
        lines.append(");")
        lines.append("")

    return "\n".join(lines)


def export_to_markdown(schema: SchemaIR) -> str:
    """
    Generates a structured Markdown documentation document from the SchemaIR.
    """
    lines = []
    lines.append("# 🗄️ Documentación de Base de Datos")
    lines.append(f"- **Framework Detectado**: `{schema.detected_framework or 'Desconocido'}`")
    lines.append(f"- **Nivel de Extracción**: `{schema.extraction_level}`")
    lines.append(f"- **Total de Tablas**: `{len(schema.tables)}`")
    lines.append("")

    for table in schema.tables:
        lines.append(f"## Tabla: `{table.name}`")
        lines.append("")
        lines.append("| Columna | Tipo | PK | FK | Referencia | Nullable |")
        lines.append("|---|---|---|---|---|---|")

        for col in table.columns:
            pk = "✅" if col.is_pk else ""
            fk = "✅" if col.is_fk else ""
            ref = f"`{col.target_table}`" if col.target_table else ""
            null = "Sí" if col.is_nullable else "No"
            lines.append(f"| `{col.name}` | `{col.type}` | {pk} | {fk} | {ref} | {null} |")

        lines.append("")
        if table.indexes:
            lines.append("**Índices:**")
            for idx in table.indexes:
                lines.append(f"- `{idx}`")
            lines.append("")

    return "\n".join(lines)
