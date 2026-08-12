package com.hometv.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

class ChannelApi(
    private val url: String,
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()
) {
    val isConfigured: Boolean
        get() = url.startsWith("https://") || url.startsWith("http://")

    suspend fun download(): String = withContext(Dispatchers.IO) {
        check(isConfigured) { "未配置频道服务器地址" }
        val request = Request.Builder().url(url).get().build()
        client.newCall(request).execute().use { response ->
            check(response.isSuccessful) { "频道服务器返回 HTTP ${response.code}" }
            response.body?.string() ?: error("频道服务器返回空内容")
        }
    }
}
