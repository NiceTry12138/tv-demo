import io
import sys
import tempfile
import unittest
import urllib.error
from collections import Counter
from pathlib import Path
from unittest.mock import Mock, patch

from collect_and_upload import SourceSpec, deduplicate, filter_healthy_entries, main, parse_playlist, probe_entry


class FakeResponse:
    def __init__(self, body: bytes, content_type: str = "video/mp2t", status: int = 200) -> None:
        self.body = io.BytesIO(body)
        self.headers = {"Content-Type": content_type}
        self.status = status

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def read(self, size: int = -1) -> bytes:
        return self.body.read(size)


class CollectorTest(unittest.TestCase):
    def test_parse_m3u_metadata_and_country(self) -> None:
        content = """#EXTM3U
#EXTINF:-1 tvg-id="CCTV1.cn" group-title="央视",CCTV-1
#EXTVLCOPT:http-user-agent=Demo Agent
https://example.com/live.m3u8
"""
        entries = parse_playlist(content, SourceSpec("test", "https://example.com"))
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["country"], "CN")
        self.assertEqual(entries[0]["userAgent"], "Demo Agent")

    def test_parse_text_and_deduplicate_url(self) -> None:
        content = """央视频道,#genre#
CCTV-1,https://example.com/live.m3u8
CCTV-1 备用,https://example.com/live.m3u8
"""
        entries = parse_playlist(content, SourceSpec("test", "https://example.com", "CN"))
        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0]["group"], "央视频道")
        self.assertEqual(len(deduplicate(entries)), 1)

    @patch("collect_and_upload.urllib.request.urlopen")
    def test_probe_accepts_non_empty_media_and_rejects_html(self, urlopen: Mock) -> None:
        entry = {"url": "https://example.com/live.ts", "userAgent": None, "referrer": None}
        urlopen.return_value = FakeResponse(b"media bytes")
        self.assertEqual(probe_entry(entry, 1), (True, "OK"))

        urlopen.return_value = FakeResponse(b"<html>blocked</html>", "text/html")
        self.assertEqual(probe_entry(entry, 1), (False, "INVALID_CONTENT"))

    @patch("collect_and_upload.urllib.request.urlopen")
    def test_probe_follows_hls_to_media(self, urlopen: Mock) -> None:
        responses = {
            "https://example.com/master.m3u8": FakeResponse(
                b"#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nvariant/index.m3u8\n", "application/vnd.apple.mpegurl"
            ),
            "https://example.com/variant/index.m3u8": FakeResponse(
                b"#EXTM3U\n#EXTINF:4,\nsegment.ts\n", "application/vnd.apple.mpegurl"
            ),
            "https://example.com/variant/segment.ts": FakeResponse(b"media bytes"),
        }
        urlopen.side_effect = lambda request, timeout: responses[request.full_url]
        entry = {"url": "https://example.com/master.m3u8", "userAgent": "Agent", "referrer": "https://ref.example"}

        self.assertEqual(probe_entry(entry, 1), (True, "OK"))
        first_request = urlopen.call_args_list[0].args[0]
        self.assertEqual(first_request.get_header("User-agent"), "Agent")
        self.assertEqual(first_request.get_header("Referer"), "https://ref.example")

    @patch("collect_and_upload.urllib.request.urlopen")
    def test_probe_classifies_http_and_timeout(self, urlopen: Mock) -> None:
        entry = {"url": "https://example.com/live", "userAgent": None, "referrer": None}
        urlopen.side_effect = urllib.error.HTTPError(entry["url"], 404, "missing", {}, None)
        self.assertEqual(probe_entry(entry, 1), (False, "HTTP_404"))

        urlopen.side_effect = TimeoutError()
        self.assertEqual(probe_entry(entry, 1), (False, "TIMEOUT"))

    @patch("collect_and_upload.probe_entry")
    def test_filter_keeps_only_healthy_entries_in_original_order(self, probe: Mock) -> None:
        entries = [
            {"url": "https://example.com/one"},
            {"url": "https://example.com/two"},
            {"url": "https://example.com/three"},
        ]
        probe.side_effect = lambda entry, timeout: (entry["url"] != entries[1]["url"], "OK" if entry["url"] != entries[1]["url"] else "TIMEOUT")

        healthy, reasons = filter_healthy_entries(entries, 1, 2, show_progress=False)

        self.assertEqual(healthy, [entries[0], entries[2]])
        self.assertEqual(reasons, {"OK": 2, "TIMEOUT": 1})

    @patch("collect_and_upload.upload")
    @patch("collect_and_upload.filter_healthy_entries", return_value=([], Counter({"TIMEOUT": 1})))
    @patch("collect_and_upload.fetch_text", return_value="#EXTM3U\n#EXTINF:-1,Demo\nhttps://example.com/live\n")
    def test_main_does_not_write_or_upload_when_no_stream_passes(
        self, fetch: Mock, filter_entries: Mock, upload: Mock
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "channels.json"
            output.write_bytes(b"previous catalog")
            with patch.object(sys, "argv", [
                "collect_and_upload.py",
                "--server", "https://server.example",
                "--output", str(output),
                "--source", "https://catalog.example/list.m3u|CN",
            ]):
                self.assertEqual(main(), 1)
            self.assertEqual(output.read_bytes(), b"previous catalog")
            upload.assert_not_called()


if __name__ == "__main__":
    unittest.main()
