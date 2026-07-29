import os
import shutil
import subprocess
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
INDEX_FILE = BASE_DIR / "index.js"


def main() -> None:
    if not INDEX_FILE.exists():
        raise RuntimeError("تعذر العثور على index.js")

    node_binary = shutil.which("node")
    if not node_binary:
        raise RuntimeError("Node.js غير متوفر على هذا النظام")

    env = os.environ.copy()
    process = subprocess.run([node_binary, str(INDEX_FILE)], cwd=str(BASE_DIR), env=env)
    raise SystemExit(process.returncode)


if __name__ == "__main__":
    main()
