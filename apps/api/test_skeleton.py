import tree_sitter_go
import tree_sitter_java
import tree_sitter_php
from tree_sitter import Language, Parser


def get_skeleton(code: bytes, lang: Language) -> str:
    parser = Parser(lang)
    tree = parser.parse(code)

    # We want to find function/class declarations and print their signatures
    # A generic traverse
    skeletons = []

    def traverse(node):
        # Identify declaration nodes
        if node.type in [
            'function_declaration', 'method_declaration', 'class_declaration', 'type_declaration',
            'function_definition', 'class_definition' # python
        ]:
            # find block-like child
            block_types = ['block', 'class_body', 'compound_statement', 'declaration_list', 'statement_block']
            block_node = None
            for child in node.children:
                if child.type in block_types:
                    block_node = child
                    break

            if block_node:
                sig = code[node.start_byte:block_node.start_byte].decode('utf8').strip()
                skeletons.append(sig + " { ... }")
                traverse(block_node)
            else:
                skeletons.append(node.text.decode('utf8'))
        else:
            if lang.name == "php":
                print(f"PHP NODE: {node.type}")
            for child in node.children:
                traverse(child)

    traverse(tree.root_node)
    return "\n".join(skeletons)

php_code = b"""<?php
class UserController extends BaseController {
    public function create() {
        $user = new ClientUser();
        $date = new \\DateTime();
    }
}
"""
print("PHP:\n", get_skeleton(php_code, Language(tree_sitter_php.language_php())))

java_code = b"""
public class User {
    public void login() {
        Database db = new Database();
        db.connect();
    }
}
"""
print("JAVA:\n", get_skeleton(java_code, Language(tree_sitter_java.language())))

go_code = b"""
type User struct {
    ID string
}
func (u *User) Login() error {
    return nil
}
"""
print("GO:\n", get_skeleton(go_code, Language(tree_sitter_go.language())))
