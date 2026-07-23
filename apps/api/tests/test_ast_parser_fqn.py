from app.infrastructure.parser.ast_parser import TreeSitterParser


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
    nodes, _, _ = parser.parse_code(code, "test.py", ".py")

    fqns = [n.fqn for n in nodes]
    assert "test.py::[class]AuthManager" in fqns
    assert "test.py::[class]AuthManager::[def]login" in fqns
    assert "test.py::[def]helper" in fqns
