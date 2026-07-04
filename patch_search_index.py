with open("apps/api/app/interfaces/api/v1/projects.py", "r") as f:
    content = f.read()

import re

# Replace the first insert loop
content = re.sub(
    r'        if inserts:\n            values = ", "\.join\(\n                f"\(\'\{r\[\'type\'\]\}\', \'\{r\[\'name\'\]\.replace\(chr\(39\), chr\(39\)\+chr\(39\)\)\}\', "\n                f"\'\{r\[\'path\'\]\.replace\(chr\(39\), chr\(39\)\+chr\(39\)\)\}\'\)"\n                for r in inserts\n            \)\n            await session\.execute\(text\(\n                f"INSERT INTO search_index \(type, name, path\) VALUES \{values\}"\n            \)\)',
    '''        if inserts:
            await session.execute(
                text("INSERT INTO search_index (type, name, path) VALUES (:type, :name, :path)"),
                inserts
            )''',
    content
)

# Fix type annotation for symbol_inserts
content = re.sub(
    r'        symbol_inserts: list\[str\] = \[\]\n        MAX_FILE_BYTES = 500_000',
    '''        from typing import Any
        symbol_inserts: list[dict[str, Any]] = []
        MAX_FILE_BYTES = 500_000''',
    content
)

# Replace the loop that builds symbol_inserts
content = re.sub(
    r'            for sym in symbols:\n                safe_name = sym\["name"\]\.replace\("\'", "\'\'"\)\n                safe_path = str\(fp\)\.replace\("\'", "\'\'"\)\n                symbol_inserts\.append\(\n                    f"\(\'symbol\', \'\{safe_name\}\', \'\{safe_path\}\', \{sym\[\'line\'\]\}\)"\n                \)',
    '''            for sym in symbols:
                symbol_inserts.append({
                    "type": "symbol",
                    "name": sym["name"],
                    "path": str(fp),
                    "line": sym["line"]
                })''',
    content
)

# Replace the second insert loop
content = re.sub(
    r'        if symbol_inserts:\n            await session\.execute\(text\(\n                f"INSERT INTO search_index \(type, name, path, line\) VALUES \{.*?join\(symbol_inserts\)\}"\n            \)\)',
    '''        if symbol_inserts:
            await session.execute(
                text("INSERT INTO search_index (type, name, path, line) VALUES (:type, :name, :path, :line)"),
                symbol_inserts
            )''',
    content
)


with open("apps/api/app/interfaces/api/v1/projects.py", "w") as f:
    f.write(content)
