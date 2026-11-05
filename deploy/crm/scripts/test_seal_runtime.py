"""Check preservation and rejection at the VM credential import boundary."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("seal_runtime", Path(__file__).with_name("seal-runtime.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def container(role, values):
    return {"Config": {"Labels": {"com.docker.compose.service": role}, "Env": [f"{key}={value}" for key, value in values.items()]}}


class SourceEnvironmentTests(unittest.TestCase):
    def test_preserves_explicit_keys_and_effective_legacy_fallback(self):
        source = [container(role, {"AUTH_SECRET": "existing=secret", "INTEGRATION_SECRET_ENCRYPTION_KEYS": "old-key"}) for role in ["app", "worker"]]
        result = module.source_environment(source)
        self.assertEqual(result["INBOUND_EMAIL_ENCRYPTION_KEY"], "existing=secret")
        self.assertEqual(result["INTEGRATION_SECRET_ENCRYPTION_KEYS"], "old-key")
        for item in source:
            item["Config"]["Env"].append("INBOUND_EMAIL_ENCRYPTION_KEY=separate-existing-key")
        self.assertEqual(module.source_environment(source)["INBOUND_EMAIL_ENCRYPTION_KEY"], "separate-existing-key")

    def test_rejects_conflicting_or_ambiguous_source_roles(self):
        with self.assertRaises(ValueError):
            module.source_environment([container("app", {"AUTH_SECRET": "same"}), container("worker", {"AUTH_SECRET": "same", "INBOUND_EMAIL_ENCRYPTION_KEY": "different"})])
        with self.assertRaises(ValueError):
            module.source_environment([container("app", {"AUTH_SECRET": "one"}), container("worker", {"AUTH_SECRET": "two"})])
        with self.assertRaises(ValueError):
            module.source_environment([container("app", {})])
        with self.assertRaises(ValueError):
            module.source_environment([container("app", {}), container("app", {}), container("worker", {})])


if __name__ == "__main__":
    unittest.main()
