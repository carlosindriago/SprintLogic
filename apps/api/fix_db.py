import sqlite3
import os
from pathlib import Path

DB_DIR = Path.home() / ".local" / "share" / "sprintlogic"
DB_PATH = DB_DIR / "sprintlogic.db"

conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

# Drop existing graph tables
c.execute("DROP TABLE IF EXISTS graph_edges")
c.execute("DROP TABLE IF EXISTS graph_nodes")
# Delete Alembic version so it re-runs the initial migration but we keep the data? No, let's just let SQLAlchemy create the tables if they don't exist.
# Or better, we just delete the alembic_version and projects table and everything?
# No, we want to keep projects.
conn.commit()
conn.close()
