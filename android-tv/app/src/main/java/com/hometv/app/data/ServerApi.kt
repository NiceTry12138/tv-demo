package com.hometv.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

class ServerApi(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .callTimeout(7, TimeUnit.SECONDS)
        .build()
) {
    suspend fun check(endpoint: ServerEndpoint): ServerCheckResponse = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(endpoint.checkUrl)
            .get()
            .build()
        client.newCall(request).execute().use { response ->
            check(response.isSuccessful) { "服务器返回 HTTP ${response.code}" }
            val content = response.body?.string() ?: error("服务器返回空内容")
            val result = ChannelJson.format.decodeFromString<ServerCheckResponse>(content)
            check(result.service == EXPECTED_SERVICE && result.apiVersion == EXPECTED_API_VERSION) {
                "目标不是兼容的 HomeTV 服务器"
            }
            check(result.status == "ok") { "服务器状态异常：${result.status}" }
            result
        }
    }

    private companion object {
        const val EXPECTED_SERVICE = "home-tv-server"
        const val EXPECTED_API_VERSION = 1
    }
}

@Serializable
data class ServerCheckResponse(
    val service: String,
    val apiVersion: Int,
    val status: String,
    val catalogReady: Boolean = false
)
