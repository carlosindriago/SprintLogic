import pytest
from pathlib import Path

from app.infrastructure.parser.import_resolver import (
    TSConfigResolver,
    strip_json_comments,
    try_resolve_file,
    is_external_import,
)

def test_strip_json_comments():
    json_with_comments = '''{
        // this is a comment
        "compilerOptions": {
            "baseUrl": "." // inline comment not supported by simple regex, but full line comments are
        }
    }'''
    # Nuestro regex actual remueve lineas que empiezan (con o sin espacios) por //
    stripped = strip_json_comments(json_with_comments)
    assert "// this is a comment" not in stripped
    assert '"baseUrl":' in stripped


def test_try_resolve_file():
    file_set = {
        "src/lib/api.ts",
        "src/components/Button.tsx",
        "src/store/index.ts",
        "src/utils.js"
    }
    
    # 1. Exact match
    assert try_resolve_file("src/lib/api.ts", file_set) == "src/lib/api.ts"
    
    # 2. Extension resolution
    assert try_resolve_file("src/lib/api", file_set) == "src/lib/api.ts"
    assert try_resolve_file("src/components/Button", file_set) == "src/components/Button.tsx"
    assert try_resolve_file("src/utils", file_set) == "src/utils.js"
    
    # 3. Index resolution
    assert try_resolve_file("src/store", file_set) == "src/store/index.ts"
    
    # 4. Not found
    assert try_resolve_file("src/notfound", file_set) is None


def test_is_external_import():
    alias_prefixes = ["@/"]
    
    # Relativos
    assert is_external_import("./button", alias_prefixes) is False
    assert is_external_import("../utils", alias_prefixes) is False
    
    # Alias
    assert is_external_import("@/lib/api", alias_prefixes) is False
    
    # Externos
    assert is_external_import("react", alias_prefixes) is True
    assert is_external_import("lucide-react", alias_prefixes) is True
    assert is_external_import("@org/shared", alias_prefixes) is True # if not in aliases


def test_tsconfig_resolver(tmp_path):
    # Simulate a project
    tsconfig_content = '''{
        "compilerOptions": {
            "baseUrl": ".",
            "paths": {
                "@/*": ["./src/*"],
                "@components/*": ["./src/components/*"]
            }
        }
    }'''
    
    tsconfig_file = tmp_path / "tsconfig.json"
    tsconfig_file.write_text(tsconfig_content)
    
    # Setup files (paths relative to CWD like in real scenario)
    # We pretend tmp_path is CWD for the sake of paths in the file_set

    # We will just pass absolute paths to make it easy for testing, or simulate relative
    file_paths = [
        str(tsconfig_file),
        str(tmp_path / "src/lib/api.ts"),
        str(tmp_path / "src/components/Button.tsx")
    ]

    resolver = TSConfigResolver(file_paths)

    assert resolver.is_alias("@/lib/api") is True
    assert resolver.is_alias("@components/Button") is True
    assert resolver.is_alias("react") is False

    # Resolve should find the file
    resolved_api = resolver.resolve("@/lib/api")
    assert resolved_api is not None
    assert resolved_api.endswith("api.ts")

    resolved_btn = resolver.resolve("@components/Button")
    assert resolved_btn is not None
    assert resolved_btn.endswith("Button.tsx")
