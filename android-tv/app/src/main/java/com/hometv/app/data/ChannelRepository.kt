package com.hometv.app.data

class ChannelRepository(
    private val api: ChannelApi,
    private val cache: ChannelCache
) {
    suspend fun loadInitialCatalog(): LoadedCatalog {
        val cached = cache.readCached()?.let { content ->
            runCatching { ChannelJson.decodeAndValidate(content) }.getOrNull()
        }
        if (cached != null) return LoadedCatalog(cached, CatalogOrigin.CACHE)

        val bundled = ChannelJson.decodeAndValidate(cache.readBundled())
        return LoadedCatalog(bundled, CatalogOrigin.BUNDLED)
    }

    suspend fun refresh(): Result<LoadedCatalog> = runCatching {
        check(api.isConfigured) { "未配置远程频道服务器，当前使用内置频道" }
        val content = api.download()
        val catalog = ChannelJson.decodeAndValidate(content)
        cache.write(content)
        LoadedCatalog(catalog, CatalogOrigin.REMOTE)
    }
}
