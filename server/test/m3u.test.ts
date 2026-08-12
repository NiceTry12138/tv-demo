import assert from "node:assert/strict";
import test from "node:test";
import { buildCatalog, parseM3u } from "../src/m3u.js";

const playlist = `#EXTM3U
#EXTINF:-1 tvg-id="cctv1.cn" tvg-logo="https://img.example/cctv1.png" group-title="央视",CCTV-1 1080p
#EXTVLCOPT:http-user-agent=TV-Test
#EXTVLCOPT:http-referrer=https://example.com/
https://stream.example/one.m3u8
#EXTINF:-1 tvg-id="cctv1.cn" group-title="央视",CCTV-1
https://stream.example/two.m3u8
`;

test("解析 M3U 元数据和请求头", () => {
  const entries = parseM3u(playlist);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    name: "CCTV-1 1080p",
    tvgId: "cctv1.cn",
    logo: "https://img.example/cctv1.png",
    group: "央视",
    url: "https://stream.example/one.m3u8",
    userAgent: "TV-Test",
    referrer: "https://example.com/"
  });
});

test("按 tvg-id 合并同频道多个播放源", () => {
  const catalog = buildCatalog(parseM3u(playlist), new Date("2026-08-13T00:00:00Z"));
  assert.equal(catalog.version, "2026-08-13T00:00:00.000Z");
  assert.equal(catalog.channels.length, 1);
  assert.equal(catalog.channels[0]?.sources.length, 2);
  assert.equal(catalog.channels[0]?.sources[0]?.quality, "1080p");
});

test("拒绝无效 M3U", () => {
  assert.throws(() => parseM3u("not a playlist"), /Extended M3U/);
  assert.throws(() => parseM3u("#EXTM3U\n#EXTINF:-1,Empty"), /没有有效/);
});

test("相似频道名仍生成不同 ID", () => {
  const content = `#EXTM3U
#EXTINF:-1,A B
https://example.com/a.m3u8
#EXTINF:-1,A-B
https://example.com/b.m3u8
`;
  const channels = buildCatalog(parseM3u(content)).channels;
  assert.equal(channels.length, 2);
  assert.notEqual(channels[0]?.id, channels[1]?.id);
});
