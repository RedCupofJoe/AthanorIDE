"""Download integrity and service-file safety regressions; no GPU or network needed."""

import hashlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "setup_model_endpoint",
    Path(__file__).parents[1] / "setup-model-endpoint.py",
)
setup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(setup)


class Response(io.BytesIO):
    def __init__(self, body, status=200, content_range=None):
        super().__init__(body)
        self.status = status
        self.headers = {"Content-Range": content_range}


class ModelSetupTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.model = Path(self.directory.name) / setup.MODEL_FILENAME
        self.weights = b"verified model weights"
        files = patch.object(
            setup,
            "MODEL_FILES",
            {
                setup.MODEL_FILENAME: (
                    len(self.weights),
                    hashlib.sha256(self.weights).hexdigest(),
                )
            },
        )
        files.start()
        self.addCleanup(files.stop)

    def test_valid_existing_model_never_downloads(self):
        self.model.write_bytes(self.weights)
        with patch.object(setup.urllib.request, "urlopen") as download:
            setup.ensure_model(self.model, no_download=True)
        download.assert_not_called()

    def test_cached_shard_symlink_is_verified_without_resolving_its_name(self):
        blob = self.model.parent / "blob-hash"
        blob.write_bytes(self.weights)
        self.model.symlink_to(blob)
        with patch.object(setup.urllib.request, "urlopen") as download:
            setup.ensure_model(self.model, no_download=True)
        download.assert_not_called()
        self.assertTrue(self.model.is_symlink())
        unit = setup.service_text(["/bin/llama", "serve"], self.model, "GPU-test", 8081)
        self.assertIn(setup.MODEL_FILENAME, unit)
        self.assertNotIn("blob-hash", unit)

    def test_invalid_existing_model_is_not_overwritten(self):
        self.model.write_bytes(b"different model")
        with (
            patch.object(setup.urllib.request, "urlopen") as download,
            self.assertRaisesRegex(RuntimeError, "left unchanged"),
        ):
            setup.ensure_model(self.model, no_download=False)
        download.assert_not_called()
        self.assertEqual(self.model.read_bytes(), b"different model")

    def test_missing_model_no_download_has_no_side_effects(self):
        with self.assertRaisesRegex(RuntimeError, "--no-download"):
            setup.ensure_model(self.model, no_download=True)
        self.assertEqual(list(self.model.parent.iterdir()), [])

    def test_resume_checks_range_and_promotes_only_verified_weights(self):
        partial = self.model.with_suffix(".gguf.part")
        partial.write_bytes(self.weights[:5])
        response = Response(
            self.weights[5:],
            206,
            f"bytes 5-{len(self.weights) - 1}/{len(self.weights)}",
        )
        with patch.object(
            setup.urllib.request, "urlopen", return_value=response
        ) as download:
            setup.ensure_model(self.model, no_download=False)
        self.assertEqual(download.call_args.args[0].get_header("Range"), "bytes=5-")
        self.assertEqual(self.model.read_bytes(), self.weights)
        self.assertFalse(partial.exists())

    def test_ignored_range_cannot_corrupt_partial_file(self):
        partial = self.model.with_suffix(".gguf.part")
        partial.write_bytes(self.weights[:5])
        with (
            patch.object(
                setup.urllib.request, "urlopen", return_value=Response(self.weights)
            ),
            self.assertRaisesRegex(RuntimeError, "did not honor resume"),
        ):
            setup.ensure_model(self.model, no_download=False)
        self.assertEqual(partial.read_bytes(), self.weights[:5])
        self.assertFalse(self.model.exists())

    def test_bad_download_is_not_installed(self):
        response = Response(b"x" * len(self.weights))
        with (
            patch.object(setup.urllib.request, "urlopen", return_value=response),
            self.assertRaisesRegex(RuntimeError, "Checksum mismatch"),
        ):
            setup.ensure_model(self.model, no_download=False)
        self.assertFalse(self.model.exists())

    def test_unit_arguments_preserve_spaces_and_disable_expansion(self):
        text = setup.service_text(
            ["/home/example/my runtime/llama", "serve"],
            Path('/models/100%/$CACHE/quoted"file.gguf'),
            "GPU-test",
            8081,
        )
        self.assertIn('ExecStart=:"/home/example/my runtime/llama" "serve"', text)
        self.assertIn('"/models/100%%/$CACHE/quoted\\"file.gguf"', text)
        self.assertIn('"--host" "127.0.0.1"', text)
        with self.assertRaises(ValueError):
            setup.unit_quote("model\nExecStart=/unexpected")

    def test_atomic_install_replaces_legacy_link_without_editing_target(self):
        target = self.model.parent / "legacy.service"
        target.write_text("legacy")
        unit = self.model.parent / "current.service"
        unit.symlink_to(target)
        self.assertTrue(setup.atomic_write(unit, "managed"))
        self.assertEqual(target.read_text(), "legacy")
        self.assertFalse(unit.is_symlink())
        self.assertFalse(setup.atomic_write(unit, "managed"))


if __name__ == "__main__":
    unittest.main()
