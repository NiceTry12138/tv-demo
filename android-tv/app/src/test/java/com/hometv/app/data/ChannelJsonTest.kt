package com.hometv.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
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

    @Test
    fun `解析服务器检查响应`() {
        val response = ChannelJson.format.decodeFromString<ServerCheckResponse>(
            """{"service":"home-tv-server","apiVersion":1,"status":"ok","catalogReady":true}"""
        )

        assertEquals("home-tv-server", response.service)
        assertEquals(1, response.apiVersion)
        assertTrue(response.catalogReady)
    }
}
