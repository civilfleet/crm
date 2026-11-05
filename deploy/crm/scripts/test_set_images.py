import importlib.util
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("set_images", ROOT / "scripts/set-images.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ImageUpdates(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in ["kubernetes", "operations"]:
            shutil.copytree(ROOT / name, self.root / name)
        self.app = module.APP + "@sha256:" + "a" * 64
        self.tools = module.TOOLS + "@sha256:" + "b" * 64

    def test_updates_workloads_and_manual_jobs_but_not_databases_or_storage(self):
        postgres = (self.root / "kubernetes/postgres.yaml").read_bytes()
        storage = (self.root / "kubernetes/storage.yaml").read_bytes()
        module.update(self.root, self.app, self.tools)
        self.assertEqual(postgres, (self.root / "kubernetes/postgres.yaml").read_bytes())
        self.assertEqual(storage, (self.root / "kubernetes/storage.yaml").read_bytes())
        self.assertIn(self.app, (self.root / "kubernetes/web.yaml").read_text())
        self.assertIn(self.tools, (self.root / "operations/migrate.yaml").read_text())
        module.update(self.root, self.app, self.tools)

    def test_rejects_mutable_or_different_repository_before_writing(self):
        original = (self.root / "kubernetes/web.yaml").read_bytes()
        for image in [module.APP + ":latest", "example.org/other@sha256:" + "a" * 64]:
            with self.assertRaises(ValueError):
                module.update(self.root, image, self.tools)
        self.assertEqual(original, (self.root / "kubernetes/web.yaml").read_bytes())

    def test_missing_resource_prevents_partial_update(self):
        original = (self.root / "kubernetes/web.yaml").read_bytes()
        (self.root / "operations/migrate.yaml").unlink()
        with self.assertRaises(ValueError):
            module.update(self.root, self.app, self.tools)
        self.assertEqual(original, (self.root / "kubernetes/web.yaml").read_bytes())


if __name__ == "__main__":
    unittest.main()
