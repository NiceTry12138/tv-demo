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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class TvViewModel(application: Application) : AndroidViewModel(application) {
    private val preferences = application.getSharedPreferences(PREFERENCES_NAME, 0)
    private val repository = ChannelRepository(
        api = ChannelApi(BuildConfig.CHANNELS_URL),
        cache = ChannelCache(application)
    )

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

    private fun loadChannels() {
        viewModelScope.launch {
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
                .onSuccess { loaded -> applyCatalog(loaded.catalog.channels, loaded.origin) }
                .onFailure { error ->
                    if (BuildConfig.CHANNELS_URL.isNotBlank()) {
                        _uiState.update { state ->
                            state.copy(errorMessage = "远程更新失败，继续使用本地频道：${error.message}")
                        }
                    }
                }
        }
    }

    private fun applyCatalog(channels: List<Channel>, origin: CatalogOrigin) {
        val currentId = _uiState.value.selectedChannel?.id
            ?: preferences.getString(KEY_LAST_CHANNEL_ID, null)
        val selectedIndex = channels.indexOfFirst { it.id == currentId }.coerceAtLeast(0)
        _uiState.update {
            it.copy(
                channels = channels,
                selectedIndex = selectedIndex,
                catalogOrigin = origin,
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
