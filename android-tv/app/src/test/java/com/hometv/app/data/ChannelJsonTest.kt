package com.hometv.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class ChannelJsonTest {
    @Test
    fun `解析时忽略未知字段并过滤无效频道`() {
        val catalog = ChannelJson.decodeAndValidate(
            """
            {
              "version": "test",
              "unknown": true,
              "channels": [
                {
                  "id": "valid",
                  "name": "有效频道",
                  "sources": [{ "url": "https://example.com/live.m3u8" }]
                },
                {
                  "id": "invalid",
                  "name": "无效频道",
                  "sources": [{ "url": "not-a-url" }]
                }
              ]
            }
            """.trimIndent()
        )

        assertEquals("test", catalog.version)
        assertEquals(1, catalog.channels.size)
        assertEquals("其他", catalog.channels.first().group)
        assertFalse(catalog.channels.first().sources.first().geoBlocked)
    }
}
