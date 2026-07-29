import importlib.util
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
CORE_FILE = BASE_DIR / "bot_core.py"


def load_core_module():
    spec = importlib.util.spec_from_file_location("bot_core", CORE_FILE)
    if spec is None or spec.loader is None:
        raise RuntimeError("تعذر تحميل bot_core.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["bot_core"] = module
    spec.loader.exec_module(module)
    return module


def main() -> None:
    module = load_core_module()
    module.main()


if __name__ == "__main__":
    main()
