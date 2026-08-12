package com.hometv.app.data

import org.junit.Assert.assertEquals
import org.junit.Test

class SourceRankerTest {
    @Test
    fun `优先选择可用的 H264 1080p 常规源`() {
        val preferred = ChannelSource(
            url = "https://example.com/preferred.m3u8",
            quality = "1080p",
            videoCodec = "h264",
            status = "available"
        )
        val fourK = ChannelSource(
            url = "https://example.com/4k.m3u8",
            quality = "2160p",
            videoCodec = "h265",
            status = "available"
        )
        val blocked = ChannelSource(
            url = "https://example.com/blocked.m3u8",
            quality = "1080p",
            videoCodec = "h264",
            geoBlocked = true,
            status = "available"
        )

        assertEquals(preferred, SourceRanker.rank(listOf(fourK, blocked, preferred)).first())
    }

    @Test
    fun `删除重复和非 HTTP 地址`() {
        val source = ChannelSource(url = "https://example.com/live.m3u8")
        val ranked = SourceRanker.rank(
            listOf(source, source.copy(), ChannelSource(url = "file:///tmp/live.m3u8"))
        )

        assertEquals(listOf(source), ranked)
    }
}
