import hashlib
import re
from app.infrastructure.parser.ast_parser import TreeSitterParser, ParsedNode

def test_ast_fqn_and_hashing():
    code = """
class AuthManager:
    # TODO: Refactor tomorrow
    def login(self):
        pass

def helper():
    pass
"""
    parser = TreeSitterParser()
    nodes, _ = parser.parse_code(code, "test.py")

    fqns = [n.fqn for n in nodes]
    assert "test.py::[class]AuthManager" in fqns
    assert "test.py::[class]AuthManager::[def]login" in fqns
    assert "test.py::[def]helper" in fqns
