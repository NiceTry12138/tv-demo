package com.hometv.app.data

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json

@OptIn(ExperimentalSerializationApi::class)
object ChannelJson {
    val format = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    fun decodeAndValidate(content: String): ChannelCatalog {
        val decoded = format.decodeFromString<ChannelCatalog>(content)
        val channels = decoded.channels.mapNotNull { channel ->
            val sources = SourceRanker.rank(channel.sources)
            if (channel.id.isBlank() || channel.name.isBlank() || sources.isEmpty()) {
                null
            } else {
                channel.copy(group = channel.group.ifBlank { "其他" }, sources = sources)
            }
        }.distinctBy { it.id }

        require(channels.isNotEmpty()) { "频道列表为空或没有有效播放源" }
        return decoded.copy(channels = channels)
    }
}
