import pathlib
import sys
import tempfile
import unittest

SCRIPTS_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS_DIR))

from pipeline.stamp_asset_version import stamp_asset_versions  # noqa: E402


class StampAssetVersionTest(unittest.TestCase):
    def test_stamp_asset_versions_rewrites_all_js_version_queries(self):
        html = '''<script defer src="./js/config.js?v=old"></script>
<script defer src="./js/utils.js?v=old"></script>
<script defer src="./js/main.js?v=old"></script>
<script type="module">
import { start as startEtfPremium } from './js/etf-premium.js?v=old';
import { start as startOffshoreLiveNav } from './js/offshore-live-nav.js?v=old';
</script>
'''
        with tempfile.TemporaryDirectory() as tmpdir:
            target = pathlib.Path(tmpdir) / 'index.html'
            target.write_text(html, encoding='utf-8')
            stamp_asset_versions(target, 'build-123')
            result = target.read_text(encoding='utf-8')

        self.assertIn('./js/config.js?v=build-123', result)
        self.assertIn('./js/utils.js?v=build-123', result)
        self.assertIn('./js/main.js?v=build-123', result)
        self.assertIn("./js/etf-premium.js?v=build-123", result)
        self.assertIn("./js/offshore-live-nav.js?v=build-123", result)
        self.assertNotIn('?v=old', result)


if __name__ == '__main__':
    unittest.main()
