import asyncio
from pathlib import Path

from app.infrastructure.parser.strategies.java_strategy import JavaAnalyzerStrategy
from app.infrastructure.parser.strategies.php_strategy import PhpAnalyzerStrategy


async def test():
    root = Path(__file__).parent.resolve()

    # Test PHP
    php_path = root / "tests" / "fixtures" / "php_sample"
    php_strat = PhpAnalyzerStrategy()
    res = await php_strat.parse_dependencies(php_path)
    print("PHP EDGES:")
    for e in res["edges"]:
        print(f"  {e['source_id']} -> {e['target_id']}")

    # Test Java
    java_path = root / "tests" / "fixtures" / "java_sample"
    java_strat = JavaAnalyzerStrategy()
    res = await java_strat.parse_dependencies(java_path)
    print("\nJAVA EDGES:")
    for e in res["edges"]:
        print(f"  {e['source_id']} -> {e['target_id']}")

if __name__ == "__main__":
    asyncio.run(test())
