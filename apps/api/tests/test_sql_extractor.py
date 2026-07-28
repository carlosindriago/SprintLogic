from app.infrastructure.db_inspector.sql_extractor import extract_schema_from_sql


def test_extract_schema_from_sql():
    sql = """
    CREATE TABLE users (
        id INT PRIMARY KEY,
        email VARCHAR(255) NOT NULL
    );

    CREATE TABLE orders (
        id INT PRIMARY KEY,
        user_id INT REFERENCES users(id),
        amount DECIMAL(10,2) NOT NULL
    );

    CREATE INDEX idx_orders_user_id ON orders(user_id);
    """

    tables = extract_schema_from_sql(sql)

    assert len(tables) == 2
    users_tbl = next(t for t in tables if t.name == "users")
    orders_tbl = next(t for t in tables if t.name == "orders")

    assert len(users_tbl.columns) == 2
    id_col = next(c for c in users_tbl.columns if c.name == "id")
    assert id_col.is_pk is True

    user_id_col = next(c for c in orders_tbl.columns if c.name == "user_id")
    assert user_id_col.is_fk is True
    assert user_id_col.target_table == "users"

    assert len(orders_tbl.indexes) == 1
    assert "idx_orders_user_id" in orders_tbl.indexes[0]
