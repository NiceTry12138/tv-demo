package com.hometv.app.player

import android.os.Handler
import android.os.Looper
import androidx.media3.common.PlaybackException
import com.hometv.app.data.Channel
import com.hometv.app.data.ChannelSource
import com.hometv.app.data.SourceRanker

class PlaybackController(
    private val tvPlayer: TvPlayer,
    private val listener: Listener,
    private val handler: Handler = Handler(Looper.getMainLooper())
) : TvPlayer.Listener {
    interface Listener {
        fun onSourceLoading(channel: Channel, sourceIndex: Int, sourceCount: Int)
        fun onChannelPlaying(channel: Channel)
        fun onChannelFailed(channel: Channel, reason: String)
    }

    private var channel: Channel? = null
    private var sources: List<ChannelSource> = emptyList()
    private var sourceIndex = 0
    private var generation = 0L
    private var timeout: Runnable? = null

    init {
        tvPlayer.listener = this
    }

    fun play(channel: Channel) {
        cancelTimeout()
        generation++
        this.channel = channel
        sources = SourceRanker.rank(channel.sources)
        sourceIndex = 0
        if (sources.isEmpty()) {
            listener.onChannelFailed(channel, "频道没有有效的 HTTP 播放源")
            return
        }
        playCurrentSource()
    }

    override fun onReady(playGeneration: Long) {
        if (playGeneration != generation) return
        cancelTimeout()
    }

    override fun onPlaying(playGeneration: Long) {
        if (playGeneration != generation) return
        cancelTimeout()
        channel?.let(listener::onChannelPlaying)
    }

    override fun onError(playGeneration: Long, error: PlaybackException) {
        if (playGeneration != generation) return
        tryNextSource(error.errorCodeName)
    }

    fun release() {
        generation++
        cancelTimeout()
        tvPlayer.release()
    }

    private fun playCurrentSource() {
        val currentChannel = channel ?: return
        val currentSource = sources.getOrNull(sourceIndex) ?: return
        generation++
        listener.onSourceLoading(currentChannel, sourceIndex, sources.size)
        tvPlayer.play(currentSource, generation)

        val expectedGeneration = generation
        timeout = Runnable {
            if (expectedGeneration == generation) tryNextSource("PREPARE_TIMEOUT")
        }.also { handler.postDelayed(it, PREPARE_TIMEOUT_MS) }
    }

    private fun tryNextSource(reason: String) {
        cancelTimeout()
        sourceIndex++
        if (sourceIndex < sources.size) {
            playCurrentSource()
        } else {
            channel?.let { listener.onChannelFailed(it, "全部 ${sources.size} 个播放源失败，最后错误：$reason") }
        }
    }

    private fun cancelTimeout() {
        timeout?.let(handler::removeCallbacks)
        timeout = null
    }

    private companion object {
        const val PREPARE_TIMEOUT_MS = 15_000L
    }
}
