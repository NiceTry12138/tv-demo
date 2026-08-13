package com.hometv.app.viewmodel

import com.hometv.app.data.CatalogOrigin
import com.hometv.app.data.Channel

data class TvUiState(
    val channels: List<Channel> = emptyList(),
    val selectedIndex: Int = 0,
    val catalogOrigin: CatalogOrigin? = null,
    val catalogRevision: Long = 0,
    val isLoading: Boolean = true,
    val playbackMessage: String = "正在加载频道...",
    val errorMessage: String? = null
) {
    val selectedChannel: Channel?
        get() = channels.getOrNull(selectedIndex)
}
