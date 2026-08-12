package com.hometv.app.data

import android.content.Context
import android.util.AtomicFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.OutputStreamWriter

class ChannelCache(private val context: Context) {
    private val cacheFile = AtomicFile(File(context.filesDir, CACHE_FILE_NAME))

    suspend fun readCached(): String? = withContext(Dispatchers.IO) {
        if (!cacheFile.baseFile.exists()) return@withContext null
        runCatching { cacheFile.openRead().bufferedReader().use { it.readText() } }.getOrNull()
    }

    suspend fun readBundled(): String = withContext(Dispatchers.IO) {
        context.assets.open(BUNDLED_FILE_NAME).bufferedReader().use { it.readText() }
    }

    suspend fun write(content: String) = withContext(Dispatchers.IO) {
        val output = cacheFile.startWrite()
        try {
            OutputStreamWriter(output, Charsets.UTF_8).apply {
                write(content)
                flush()
            }
            cacheFile.finishWrite(output)
        } catch (error: Throwable) {
            cacheFile.failWrite(output)
            throw error
        }
    }

    private companion object {
        const val CACHE_FILE_NAME = "channels.json"
        const val BUNDLED_FILE_NAME = "sample_channels.json"
    }
}
