package com.hometv.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ServerEndpointTest {
    @Test
    fun `生成服务器 API 地址`() {
        val endpoint = ServerEndpoint.parse("192.168.1.20", "8080")

        assertEquals("http://192.168.1.20:8080/check", endpoint.checkUrl)
        assertEquals(
            "http://192.168.1.20:8080/iptv/v1/channels.json",
            endpoint.channelsUrl(false)
        )
        assertEquals(
            "http://192.168.1.20:8080/iptv/v1/channels.json?country=CN",
            endpoint.channelsUrl(true)
        )
    }

    @Test
    fun `拒绝无效 IP 和端口`() {
        assertThrows(IllegalArgumentException::class.java) {
            ServerEndpoint.parse("192.168.1.256", "8080")
        }
        assertThrows(IllegalArgumentException::class.java) {
            ServerEndpoint.parse("192.168.01.2", "8080")
        }
        assertThrows(IllegalArgumentException::class.java) {
            ServerEndpoint.parse("192.168.1.2", "65536")
        }
    }
}
