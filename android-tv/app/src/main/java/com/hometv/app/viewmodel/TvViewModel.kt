package com.hometv.app.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.hometv.app.BuildConfig
import com.hometv.app.data.CatalogOrigin
import com.hometv.app.data.Channel
import com.hometv.app.data.ChannelApi
import com.hometv.app.data.ChannelCache
import com.hometv.app.data.ChannelRepository
import com.hometv.app.data.ServerApi
import com.hometv.app.data.ServerCheckResponse
import com.hometv.app.data.ServerConfigStore
import com.hometv.app.data.ServerEndpoint
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class TvViewModel(application: Application) : AndroidViewModel(application) {
    private val preferences = application.getSharedPreferences(PREFERENCES_NAME, 0)
    private val channelCache = ChannelCache(application)
    private val serverConfigStore = ServerConfigStore(application)
    private val serverApi = ServerApi()
    private var cnOnly = serverConfigStore.loadCnOnly()
    private var channelsUrl = serverConfigStore.load()?.channelsUrl(cnOnly) ?: BuildConfig.CHANNELS_URL

    private val _uiState = MutableStateFlow(TvUiState())
    val uiState = _uiState.asStateFlow()

    init {
        loadChannels()
    }

    fun selectChannel(index: Int) {
        val channels = _uiState.value.channels
        if (index !in channels.indices) return
        val channel = channels[index]
        preferences.edit().putString(KEY_LAST_CHANNEL_ID, channel.id).apply()
        _uiState.update {
            it.copy(selectedIndex = index, playbackMessage = "正在切换到 ${channel.name}", errorMessage = null)
        }
    }

    fun selectNextChannel() {
        val size = _uiState.value.channels.size
        if (size == 0) return
        selectChannel((_uiState.value.selectedIndex + 1) % size)
    }

    fun selectPreviousChannel() {
        val size = _uiState.value.channels.size
        if (size == 0) return
        selectChannel((_uiState.value.selectedIndex - 1 + size) % size)
    }

    fun updatePlaybackMessage(message: String) {
        _uiState.update { it.copy(playbackMessage = message, errorMessage = null) }
    }

    fun reportPlaybackError(message: String) {
        _uiState.update { it.copy(playbackMessage = "播放失败", errorMessage = message) }
    }

    fun savedServerEndpoint(): ServerEndpoint? = serverConfigStore.load()

    fun savedServerCnOnly(): Boolean = serverConfigStore.loadCnOnly()

    fun checkAndSaveServer(
        ip: String,
        port: String,
        cnOnly: Boolean,
        onComplete: (Result<ServerCheckResponse>) -> Unit
    ) {
        val endpoint = runCatching { ServerEndpoint.parse(ip, port) }
            .getOrElse { error ->
                onComplete(Result.failure(error))
                return
            }

        viewModelScope.launch {
            val result = runCatching {
                val check = serverApi.check(endpoint)
                serverConfigStore.save(endpoint, cnOnly)
                this@TvViewModel.cnOnly = cnOnly
                channelsUrl = endpoint.channelsUrl(cnOnly)
                check
            }
            result.onSuccess { check ->
                refreshFromServer()
                val readiness = if (check.catalogReady) "服务器设置已保存" else "服务器已连接，频道正在准备"
                _uiState.update { it.copy(playbackMessage = readiness, errorMessage = null) }
            }
            onComplete(result)
        }
    }

    private fun loadChannels() {
        viewModelScope.launch {
            val requestUrl = channelsUrl
            val repository = createRepository()
            runCatching { repository.loadInitialCatalog() }
                .onSuccess { loaded -> applyCatalog(loaded.catalog.channels, loaded.origin) }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            playbackMessage = "频道加载失败",
                            errorMessage = error.message ?: "无法读取频道数据"
                        )
                    }
                }

            repository.refresh()
                .onSuccess { loaded ->
                    if (requestUrl == channelsUrl) applyCatalog(loaded.catalog.channels, loaded.origin)
                }
                .onFailure { error ->
                    if (requestUrl == channelsUrl && channelsUrl.isNotBlank()) {
                        _uiState.update { state ->
                            state.copy(errorMessage = "远程更新失败，继续使用本地频道：${error.message}")
                        }
                    }
                }
        }
    }

    private fun refreshFromServer() {
        viewModelScope.launch {
            createRepository().refresh()
                .onSuccess { loaded -> applyCatalog(loaded.catalog.channels, loaded.origin) }
                .onFailure { error ->
                    _uiState.update { state ->
                        state.copy(errorMessage = "服务器已保存，但频道更新失败：${error.message}")
                    }
                }
        }
    }

    private fun createRepository(): ChannelRepository = ChannelRepository(
        api = ChannelApi(channelsUrl),
        cache = channelCache
    )

    private fun applyCatalog(channels: List<Channel>, origin: CatalogOrigin) {
        val currentId = _uiState.value.selectedChannel?.id
            ?: preferences.getString(KEY_LAST_CHANNEL_ID, null)
        val selectedIndex = channels.indexOfFirst { it.id == currentId }.coerceAtLeast(0)
        _uiState.update {
            it.copy(
                channels = channels,
                selectedIndex = selectedIndex,
                catalogOrigin = origin,
                catalogRevision = it.catalogRevision + 1,
                isLoading = false,
                playbackMessage = "频道已加载",
                errorMessage = null
            )
        }
    }

    private companion object {
        const val PREFERENCES_NAME = "tv_preferences"
        const val KEY_LAST_CHANNEL_ID = "last_channel_id"
    }
}
