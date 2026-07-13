import sys

import tree_sitter_java
import tree_sitter_php
from tree_sitter import Language, Parser


def dump_ast(node, depth=0):
    indent = "  " * depth
    if node.is_named:
        print(f"{indent}{node.type} ({node.start_byte}-{node.end_byte}) '{node.text.decode('utf8')}'")
        for child in node.children:
            dump_ast(child, depth + 1)
    else:
        # Just print the literal string if we want, or skip
        pass

if sys.argv[1] == "php":
    lang = Language(tree_sitter_php.language_php())
    parser = Parser(lang)
    code = open("tests/fixtures/php_sample/app/Controllers/UserController.php", "rb").read()
    tree = parser.parse(code)
    dump_ast(tree.root_node)

if sys.argv[1] == "java":
    lang = Language(tree_sitter_java.language())
    parser = Parser(lang)
    code = open("tests/fixtures/java_sample/src/main/java/com/sprintlogic/auth/User.java", "rb").read()
    tree = parser.parse(code)
    dump_ast(tree.root_node)
