from pydantic import BaseModel, Field


class ColumnIR(BaseModel):
    name: str
    type: str
    is_pk: bool = False
    is_fk: bool = False
    is_nullable: bool = True
    target_table: str | None = None


class TableIR(BaseModel):
    name: str
    columns: list[ColumnIR] = Field(default_factory=list)
    indexes: list[str] = Field(default_factory=list)


class SchemaIR(BaseModel):
    tables: list[TableIR] = Field(default_factory=list)
    orm_type: str = "raw_sql"
    extraction_level: str = "static"
    detected_framework: str | None = None
    is_outdated: bool = False
