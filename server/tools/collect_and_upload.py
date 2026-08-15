#!/usr/bin/env python3
"""Collect IPTV playlists, keep locally playable streams, then upload to Home TV."""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import getpass
import json
import os
import re
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class SourceSpec:
    name: str
    url: str
    country: str | None = None


DEFAULT_SOURCES = (
    SourceSpec("iptv-org", "https://iptv-org.github.io/iptv/index.m3u"),
    SourceSpec("iptv-org CN", "https://iptv-org.github.io/iptv/countries/cn.m3u", "CN"),
    SourceSpec("fanmingming/live", "https://raw.githubusercontent.com/fanmingming/live/main/tv/m3u/ipv6.m3u", "CN"),
    SourceSpec("YueChan/Live", "https://raw.githubusercontent.com/YueChan/Live/main/IPTV.m3u", "CN"),
    SourceSpec("live.zbds.top", "https://live.zbds.top/tv/iptv4.m3u", "CN"),
    SourceSpec("tv.iill.top", "https://tv.iill.top/m3u/Gather", "CN"),
)

ATTRIBUTE_PATTERN = re.compile(r'([\w-]+)="([^"]*)"')
HTTP_PATTERN = re.compile(r"^https?://", re.IGNORECASE)
DEFAULT_USER_AGENT = "HomeTV-Collector/1.0"
MAX_PLAYLIST_BYTES = 512 * 1024
MAX_SAMPLE_BYTES = 64 * 1024


def fetch_text(source: SourceSpec, timeout: float) -> str:
    request = urllib.request.Request(
        source.url,
        headers={"User-Agent": DEFAULT_USER_AGENT, "Accept": "*/*"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read()
    for encoding in ("utf-8-sig", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def parse_playlist(content: str, source: SourceSpec) -> list[dict[str, Any]]:
    lines = [line.strip() for line in content.splitlines()]
    if any(line.upper().startswith("#EXTINF:") for line in lines):
        return parse_m3u(lines, source)
    return parse_text_playlist(lines, source)


def parse_m3u(lines: list[str], source: SourceSpec) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    pending: dict[str, Any] | None = None
    for line in lines:
        if not line:
            continue
        if line.upper().startswith("#EXTINF:"):
            metadata, name = split_extinf(line)
            attributes = {key.lower(): value for key, value in ATTRIBUTE_PATTERN.findall(metadata)}
            pending = {
                "name": name,
                "tvgId": value_or_none(attributes.get("tvg-id")),
                "logo": value_or_none(attributes.get("tvg-logo")),
                "group": value_or_none(attributes.get("group-title")),
                "userAgent": None,
                "referrer": None,
                "country": infer_country(attributes.get("tvg-country"), attributes.get("tvg-id"), source.country),
            }
            continue
        if pending and line.upper().startswith("#EXTVLCOPT:"):
            key, _, value = line.partition("=")
            key = key.removeprefix("#EXTVLCOPT:").strip().lower()
            if key == "http-user-agent":
                pending["userAgent"] = value_or_none(value)
            elif key in ("http-referrer", "http-referer"):
                pending["referrer"] = value_or_none(value)
            continue
        if pending and line.upper().startswith("#EXTHTTP:"):
            apply_ext_http(pending, line[len("#EXTHTTP:"):])
            continue
        if line.startswith("#"):
            continue
        if pending and HTTP_PATTERN.match(line):
            pending["url"] = line
            if pending["name"]:
                entries.append(pending)
            pending = None
    return entries


def parse_text_playlist(lines: list[str], source: SourceSpec) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    group: str | None = None
    for line in lines:
        if not line or line.startswith("#") or "," not in line:
            continue
        name, value = (part.strip() for part in line.split(",", 1))
        if value.lower() == "#genre#":
            group = name or None
            continue
        if name and HTTP_PATTERN.match(value):
            entries.append({
                "name": name,
                "url": value,
                "country": source.country or "ZZ",
                "tvgId": None,
                "logo": None,
                "group": group,
                "userAgent": None,
                "referrer": None,
            })
    return entries


def split_extinf(line: str) -> tuple[str, str]:
    quoted = False
    for index, character in enumerate(line):
        if character == '"':
            quoted = not quoted
        elif character == "," and not quoted:
            return line[:index], line[index + 1:].strip()
    return line, ""


def infer_country(raw_country: str | None, tvg_id: str | None, fallback: str | None) -> str:
    if raw_country:
        candidate = re.split(r"[,;|]", raw_country, maxsplit=1)[0].strip().upper()
        if re.fullmatch(r"[A-Z]{2}", candidate):
            return candidate
    if tvg_id:
        suffix = tvg_id.rsplit(".", 1)[-1].upper()
        if re.fullmatch(r"[A-Z]{2}", suffix):
            return suffix
    return fallback or "ZZ"


def apply_ext_http(entry: dict[str, Any], raw: str) -> None:
    try:
        headers = json.loads(raw)
    except json.JSONDecodeError:
        return
    if not isinstance(headers, dict):
        return
    for key, value in headers.items():
        if not isinstance(value, str):
            continue
        normalized = key.lower()
        if normalized == "user-agent":
            entry["userAgent"] = value
        elif normalized in ("referer", "referrer"):
            entry["referrer"] = value


def value_or_none(value: str | None) -> str | None:
    normalized = value.strip() if value else ""
    return normalized or None


def deduplicate(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_url: dict[str, dict[str, Any]] = {}
    for entry in entries:
        existing = by_url.get(entry["url"])
        if existing is None or (existing["country"] != "CN" and entry["country"] == "CN"):
            by_url[entry["url"]] = entry
    return list(by_url.values())


def probe_entry(entry: dict[str, Any], timeout: float) -> tuple[bool, str]:
    deadline = time.monotonic() + timeout
    try:
        healthy = probe_url(entry["url"], entry, deadline, 0)
        return healthy, "OK" if healthy else "INVALID_CONTENT"
    except urllib.error.HTTPError as error:
        return False, f"HTTP_{error.code}"
    except (TimeoutError, socket.timeout):
        return False, "TIMEOUT"
    except (urllib.error.URLError, OSError, ValueError):
        return False, "NETWORK_ERROR"


def probe_url(url: str, entry: dict[str, Any], deadline: float, depth: int) -> bool:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError
    headers = {
        "User-Agent": entry.get("userAgent") or DEFAULT_USER_AGENT,
        "Accept": "*/*",
    }
    if entry.get("referrer"):
        headers["Referer"] = entry["referrer"]
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=remaining) as response:
        status = getattr(response, "status", 200)
        if status < 200 or status >= 300:
            return False
        content_type = response.headers.get("Content-Type", "").lower()
        if "text/html" in content_type:
            return False
        is_playlist = "mpegurl" in content_type or "m3u8" in content_type or bool(
            re.search(r"\.m3u8(?:$|[?#])", url, re.IGNORECASE)
        )
        body = response.read(MAX_PLAYLIST_BYTES if is_playlist else MAX_SAMPLE_BYTES)
    if not body:
        return False
    text = body[:512].decode("utf-8-sig", errors="replace").lstrip()
    if text.lower().startswith("<html") or text.lower().startswith("<!doctype"):
        return False
    if is_playlist or text.upper().startswith("#EXTM3U"):
        if depth >= 2:
            return False
        playlist = body.decode("utf-8-sig", errors="replace")
        if not playlist.lstrip().upper().startswith("#EXTM3U"):
            return False
        child_url = first_playlist_url(playlist, url)
        return bool(child_url) and probe_url(child_url, entry, deadline, depth + 1)
    return True


def first_playlist_url(content: str, base_url: str) -> str | None:
    for line in content.splitlines():
        candidate = line.strip()
        if not candidate or candidate.startswith("#"):
            continue
        child_url = urllib.parse.urljoin(base_url, candidate)
        return child_url if HTTP_PATTERN.match(child_url) else None
    return None


def filter_healthy_entries(
    entries: list[dict[str, Any]], timeout: float, workers: int, show_progress: bool = True
) -> tuple[list[dict[str, Any]], Counter[str]]:
    if not entries:
        return [], Counter()
    results: list[bool] = [False] * len(entries)
    reasons: Counter[str] = Counter()
    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(workers, len(entries))) as executor:
        futures = {executor.submit(probe_entry, entry, timeout): index for index, entry in enumerate(entries)}
        for future in concurrent.futures.as_completed(futures):
            index = futures[future]
            try:
                healthy, reason = future.result()
            except Exception:
                healthy, reason = False, "UNEXPECTED_ERROR"
            results[index] = healthy
            reasons[reason] += 1
            completed += 1
            if show_progress and (completed % 100 == 0 or completed == len(entries)):
                print(f"[check] {completed}/{len(entries)}，通过 {reasons['OK']}", file=sys.stderr)
    return [entry for index, entry in enumerate(entries) if results[index]], reasons


def upload(server: str, username: str, password: str, payload: bytes, timeout: float) -> dict[str, Any]:
    credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
    request = urllib.request.Request(
        server.rstrip("/") + "/admin/catalog",
        data=payload,
        method="POST",
        headers={
            "Authorization": "Basic " + credentials,
            "Content-Type": "application/json",
            "User-Agent": DEFAULT_USER_AGENT,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"上传失败：HTTP {error.code} {detail}") from error


def parse_source(value: str) -> SourceSpec:
    parts = value.split("|", 2)
    url = parts[0].strip()
    if not HTTP_PATTERN.match(url):
        raise argparse.ArgumentTypeError("--source 格式必须是 URL 或 URL|地区代码")
    country = parts[1].strip().upper() if len(parts) > 1 and parts[1].strip() else None
    if country and not re.fullmatch(r"[A-Z]{2}", country):
        raise argparse.ArgumentTypeError("地区代码必须是两位字母")
    return SourceSpec(url, url, country)


def positive_float(value: str) -> float:
    number = float(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("必须大于 0")
    return number


def positive_int(value: str) -> int:
    number = int(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("必须大于 0")
    return number


def main() -> int:
    parser = argparse.ArgumentParser(description="收集 IPTV 频道并上传到 Home TV 服务器")
    parser.add_argument("--server", help="服务器地址，例如 https://tv.example.com")
    parser.add_argument("--username", default=os.getenv("TV_ADMIN_USERNAME", "cong01"))
    parser.add_argument("--password", default=os.getenv("TV_ADMIN_PASSWORD"))
    parser.add_argument("--output", type=Path, default=Path("collected-channels.json"))
    parser.add_argument("--source", action="append", type=parse_source, help="替换默认来源；格式 URL|CN，可重复")
    parser.add_argument("--timeout", type=positive_float, default=30.0, help="获取目录和上传超时秒数")
    parser.add_argument("--check-timeout", type=positive_float, default=8.0, help="单个播放源检查超时秒数")
    parser.add_argument("--check-workers", type=positive_int, default=16, help="播放源检查并发数")
    arguments = parser.parse_args()

    collected: list[dict[str, Any]] = []
    succeeded = 0
    for source in arguments.source or DEFAULT_SOURCES:
        try:
            entries = parse_playlist(fetch_text(source, arguments.timeout), source)
            collected.extend(entries)
            succeeded += 1
            print(f"[ok] {source.name}: {len(entries)} 个源", file=sys.stderr)
        except Exception as error:  # Continue when one community source is temporarily unavailable.
            print(f"[fail] {source.name}: {error}", file=sys.stderr)

    if succeeded == 0:
        print("所有来源均获取失败", file=sys.stderr)
        return 1
    unique = deduplicate(collected)
    if not unique:
        print("来源中没有可检查的播放源", file=sys.stderr)
        return 1
    healthy, reasons = filter_healthy_entries(unique, arguments.check_timeout, arguments.check_workers)
    failed_summary = "，".join(
        f"{reason}={count}" for reason, count in reasons.most_common() if reason != "OK"
    )
    if failed_summary:
        print(f"[check] 失败统计：{failed_summary}", file=sys.stderr)
    if not healthy:
        print("本地没有检查通过的播放源；不写文件，不上传", file=sys.stderr)
        return 1
    document = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "entries": healthy,
    }
    payload = (json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    arguments.output.write_bytes(payload)
    print(
        f"[done] 收集 {len(collected)} -> 去重 {len(unique)} -> 健康 {len(healthy)}；文件 {arguments.output}",
        file=sys.stderr,
    )

    if arguments.server:
        password = arguments.password or getpass.getpass("管理员密码: ")
        result = upload(arguments.server, arguments.username, password, payload, arguments.timeout)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
