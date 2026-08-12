package com.hometv.app.data

import kotlinx.serialization.Serializable

@Serializable
data class ChannelCatalog(
    val version: String = "unknown",
    val channels: List<Channel> = emptyList()
)

@Serializable
data class Channel(
    val id: String,
    val name: String,
    val logo: String? = null,
    val group: String = "其他",
    val sources: List<ChannelSource> = emptyList()
)

@Serializable
data class ChannelSource(
    val url: String,
    val quality: String? = null,
    val videoCodec: String? = null,
    val userAgent: String? = null,
    val referrer: String? = null,
    val geoBlocked: Boolean = false,
    val alwaysOn: Boolean = true,
    val status: String = "unknown",
    val checkedAt: String? = null
)

enum class CatalogOrigin {
    CACHE,
    BUNDLED,
    REMOTE
}

data class LoadedCatalog(
    val catalog: ChannelCatalog,
    val origin: CatalogOrigin
)
