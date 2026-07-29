import logging
from typing import Any

from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import Engine

from app.domain.models.schema_ir import ColumnIR, SchemaIR, TableIR

logger = logging.getLogger(__name__)


def extract_schema_from_live_db(db_url: str) -> SchemaIR:
    """
    Connects to a live database using SQLAlchemy create_engine and inspect(),
    extracting tables, columns, primary keys, foreign keys, and indexes into SchemaIR.
    """
    engine: Engine | None = None
    try:
        # Strict 3-second connection timeout per driver
        connect_args: dict[str, Any] = {}
        if db_url.startswith("sqlite"):
            connect_args = {"check_same_thread": False, "timeout": 3}
        elif "postgresql" in db_url or "postgres" in db_url:
            connect_args = {"connect_timeout": 3}
        elif "mysql" in db_url or "mariadb" in db_url:
            connect_args = {"connect_timeout": 3}
        else:
            connect_args = {"connect_timeout": 3}

        engine = create_engine(db_url, connect_args=connect_args, pool_pre_ping=True)

        # Fail-fast check: test socket connection immediately within 3s limit
        with engine.connect():
            pass

        inspector = inspect(engine)
        table_names = inspector.get_table_names()

        tables_list: list[TableIR] = []

        for table_name in table_names:
            try:
                # 1. Primary keys
                pk_constraint = inspector.get_pk_constraint(table_name)
                pk_cols = set(pk_constraint.get("constrained_columns", []))

                # 2. Foreign keys mapping: col_name -> target_table
                fk_map: dict[str, str | None] = {}
                fks = inspector.get_foreign_keys(table_name)
                for fk in fks:
                    target_table = fk.get("referred_table")
                    cols = fk.get("constrained_columns", [])
                    if target_table and cols:
                        for c in cols:
                            fk_map[c] = str(target_table)

                # 3. Columns
                columns_list: list[ColumnIR] = []
                raw_cols = inspector.get_columns(table_name)
                for col in raw_cols:
                    col_name = str(col["name"])
                    col_type_obj = col.get("type")
                    col_type_str = str(col_type_obj) if col_type_obj is not None else "VARCHAR"
                    is_nullable = bool(col.get("nullable", True))
                    is_pk = col_name in pk_cols
                    target_table_val: str | None = fk_map.get(col_name)
                    is_fk = bool(target_table_val)

                    columns_list.append(
                        ColumnIR(
                            name=col_name,
                            type=col_type_str,
                            is_pk=is_pk,
                            is_fk=is_fk,
                            is_nullable=is_nullable,
                            target_table=target_table_val,
                        )
                    )

                # 4. Indexes
                indexes_list: list[str] = []
                raw_indexes = inspector.get_indexes(table_name)
                for idx in raw_indexes:
                    idx_name = str(idx.get("name") or "unnamed_idx")
                    raw_cols_list = idx.get("column_names") or []
                    idx_cols = ", ".join([str(c) for c in raw_cols_list if c is not None])
                    unique_str = "UNIQUE " if idx.get("unique") else ""
                    indexes_list.append(f"CREATE {unique_str}INDEX {idx_name} ON {table_name} ({idx_cols})")

                tables_list.append(
                    TableIR(
                        name=table_name,
                        columns=columns_list,
                        indexes=indexes_list,
                    )
                )

            except Exception as table_err:
                logger.warning("Error inspecting table %s: %s", table_name, table_err)

        return SchemaIR(tables=tables_list, orm_type="live_db")

    except Exception as e:
        logger.error("Failed to connect or inspect live database with URL %s: %s", db_url, e)
        raise e
    finally:
        if engine:
            engine.dispose()
