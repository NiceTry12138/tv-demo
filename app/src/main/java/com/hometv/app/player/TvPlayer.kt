package com.hometv.app.player

import android.annotation.SuppressLint
import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.hometv.app.data.ChannelSource

class TvPlayer(context: Context) {
    interface Listener {
        fun onReady(playGeneration: Long)
        fun onPlaying(playGeneration: Long)
        fun onError(playGeneration: Long, error: PlaybackException)
    }

    val player: ExoPlayer = ExoPlayer.Builder(context).build().apply {
        playWhenReady = true
    }

    var listener: Listener? = null
    private var playGeneration: Long = 0

    init {
        player.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_READY) listener?.onReady(playGeneration)
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) listener?.onPlaying(playGeneration)
            }

            override fun onPlayerError(error: PlaybackException) {
                listener?.onError(playGeneration, error)
            }
        })
    }

    @SuppressLint("UnsafeOptInUsageError")
    fun play(source: ChannelSource, generation: Long) {
        playGeneration = generation
        val headers = buildMap {
            source.referrer?.takeIf { it.isNotBlank() }?.let { put("Referer", it) }
        }
        val dataSourceFactory = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setUserAgent(source.userAgent?.takeIf { it.isNotBlank() } ?: DEFAULT_USER_AGENT)
            .setDefaultRequestProperties(headers)
        val mediaSource = DefaultMediaSourceFactory(dataSourceFactory)
            .createMediaSource(MediaItem.fromUri(source.url))

        player.setMediaSource(mediaSource)
        player.prepare()
        player.playWhenReady = true
    }

    fun pause() = player.pause()

    fun resume() {
        player.playWhenReady = true
        player.play()
    }

    fun release() {
        listener = null
        player.release()
    }

    private companion object {
        const val DEFAULT_USER_AGENT = "HomeTV/0.1 Android"
    }
}
