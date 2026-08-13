package com.hometv.app.ui

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.content.DialogInterface
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowManager
import androidx.activity.viewModels
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.recyclerview.widget.LinearLayoutManager
import com.hometv.app.data.CatalogOrigin
import com.hometv.app.data.Channel
import com.hometv.app.databinding.ActivityMainBinding
import com.hometv.app.databinding.DialogServerSettingsBinding
import com.hometv.app.player.PlaybackController
import com.hometv.app.player.TvPlayer
import com.hometv.app.viewmodel.TvUiState
import com.hometv.app.viewmodel.TvViewModel
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity(), PlaybackController.Listener {
    private lateinit var binding: ActivityMainBinding
    private val viewModel: TvViewModel by viewModels()
    private lateinit var tvPlayer: TvPlayer
    private lateinit var playbackController: PlaybackController
    private lateinit var channelAdapter: ChannelAdapter
    private val handler = Handler(Looper.getMainLooper())

    private var renderedPlaybackKey: Pair<Long, String>? = null
    private var channelPanelVisible = true

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemUi()

        tvPlayer = TvPlayer(this)
        playbackController = PlaybackController(tvPlayer, this)
        binding.playerView.player = tvPlayer.player

        channelAdapter = ChannelAdapter { position ->
            if (position >= 0) {
                viewModel.selectChannel(position)
                schedulePanelHide()
            }
        }
        binding.channelList.layoutManager = LinearLayoutManager(this)
        binding.channelList.adapter = channelAdapter
        binding.serverSettingsButton.setOnClickListener { showServerSettings() }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.uiState.collect(::render)
            }
        }
    }

    override fun onStart() {
        super.onStart()
        tvPlayer.resume()
    }

    override fun onStop() {
        handler.removeCallbacksAndMessages(null)
        tvPlayer.pause()
        super.onStop()
    }

    override fun onDestroy() {
        binding.playerView.player = null
        playbackController.release()
        super.onDestroy()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        return when (keyCode) {
            KeyEvent.KEYCODE_DPAD_UP,
            KeyEvent.KEYCODE_CHANNEL_UP -> {
                if (channelPanelVisible && binding.channelPanel.hasFocus()) {
                    super.onKeyDown(keyCode, event)
                } else {
                    viewModel.selectPreviousChannel()
                    showPanelTemporarily()
                    true
                }
            }

            KeyEvent.KEYCODE_DPAD_DOWN,
            KeyEvent.KEYCODE_CHANNEL_DOWN -> {
                if (channelPanelVisible && binding.channelPanel.hasFocus()) {
                    super.onKeyDown(keyCode, event)
                } else {
                    viewModel.selectNextChannel()
                    showPanelTemporarily()
                    true
                }
            }

            KeyEvent.KEYCODE_DPAD_LEFT -> {
                showChannelPanel(requestFocus = true)
                true
            }

            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                hideChannelPanel()
                true
            }

            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER -> {
                if (channelPanelVisible && binding.channelPanel.hasFocus()) {
                    super.onKeyDown(keyCode, event)
                } else {
                    if (channelPanelVisible) hideChannelPanel() else showChannelPanel(requestFocus = true)
                    true
                }
            }

            KeyEvent.KEYCODE_MENU -> {
                showServerSettings()
                true
            }

            KeyEvent.KEYCODE_BACK -> {
                if (channelPanelVisible) {
                    hideChannelPanel()
                    true
                } else {
                    super.onKeyDown(keyCode, event)
                }
            }

            else -> super.onKeyDown(keyCode, event)
        }
    }

    override fun onSourceLoading(channel: Channel, sourceIndex: Int, sourceCount: Int) {
        viewModel.updatePlaybackMessage("${channel.name}：正在连接源 ${sourceIndex + 1}/$sourceCount")
    }

    override fun onChannelPlaying(channel: Channel) {
        viewModel.updatePlaybackMessage("正在播放：${channel.name}")
        scheduleStatusHide()
    }

    override fun onChannelFailed(channel: Channel, reason: String) {
        viewModel.reportPlaybackError("${channel.name}：$reason")
    }

    private fun render(state: TvUiState) {
        channelAdapter.submitChannels(state.channels, state.selectedIndex) {
            if (state.selectedIndex in state.channels.indices) {
                binding.channelList.scrollToPosition(state.selectedIndex)
            }
        }
        binding.channelTitle.text = state.selectedChannel?.name ?: "频道列表"
        binding.channelMeta.text = buildMetaText(state)
        binding.statusText.text = state.errorMessage ?: state.playbackMessage
        binding.statusText.visibility = View.VISIBLE

        state.selectedChannel?.let { channel ->
            val playbackKey = state.catalogRevision to channel.id
            if (renderedPlaybackKey != playbackKey) {
                renderedPlaybackKey = playbackKey
                playbackController.play(channel)
            }
        }
    }

    private fun buildMetaText(state: TvUiState): String {
        val origin = when (state.catalogOrigin) {
            CatalogOrigin.REMOTE -> "服务器"
            CatalogOrigin.CACHE -> "本地缓存"
            CatalogOrigin.BUNDLED -> "内置示例"
            null -> "加载中"
        }
        val group = state.selectedChannel?.group ?: "--"
        return "$group · ${state.channels.size} 个频道 · $origin"
    }

    private fun showPanelTemporarily() {
        showChannelPanel(requestFocus = false)
        schedulePanelHide()
    }

    private fun showChannelPanel(requestFocus: Boolean) {
        handler.removeCallbacks(hidePanelRunnable)
        channelPanelVisible = true
        binding.channelPanel.visibility = View.VISIBLE
        if (requestFocus) {
            val index = viewModel.uiState.value.selectedIndex
            binding.channelList.scrollToPosition(index)
            binding.channelList.post {
                binding.channelList.findViewHolderForAdapterPosition(index)?.itemView?.requestFocus()
            }
        }
    }

    private fun showServerSettings() {
        val dialogBinding = DialogServerSettingsBinding.inflate(layoutInflater)
        viewModel.savedServerEndpoint()?.let { endpoint ->
            dialogBinding.serverIpInput.setText(endpoint.ip)
            dialogBinding.serverPortInput.setText(endpoint.port.toString())
        } ?: dialogBinding.serverPortInput.setText(DEFAULT_SERVER_PORT.toString())
        dialogBinding.cnOnlySwitch.isChecked = viewModel.savedServerCnOnly()

        val dialog = AlertDialog.Builder(this)
            .setView(dialogBinding.root)
            .setNegativeButton("取消", null)
            .setPositiveButton("确定", null)
            .create()

        dialog.setOnShowListener {
            val confirm = dialog.getButton(DialogInterface.BUTTON_POSITIVE)
            confirm.setOnClickListener {
                confirm.isEnabled = false
                dialogBinding.serverSettingsStatus.setTextColor(getColor(com.hometv.app.R.color.panel_muted))
                dialogBinding.serverSettingsStatus.text = "正在连接服务器..."
                viewModel.checkAndSaveServer(
                    dialogBinding.serverIpInput.text.toString(),
                    dialogBinding.serverPortInput.text.toString(),
                    dialogBinding.cnOnlySwitch.isChecked
                ) { result ->
                    if (isFinishing || isDestroyed || !dialog.isShowing) return@checkAndSaveServer
                    result.onSuccess {
                        dialog.dismiss()
                    }.onFailure { error ->
                        confirm.isEnabled = true
                        dialogBinding.serverSettingsStatus.setTextColor(getColor(com.hometv.app.R.color.error))
                        dialogBinding.serverSettingsStatus.text = error.message ?: "服务器连接失败"
                    }
                }
            }
            dialogBinding.serverIpInput.requestFocus()
        }
        dialog.setOnDismissListener { binding.playerView.requestFocus() }
        dialog.show()
    }

    private fun hideChannelPanel() {
        handler.removeCallbacks(hidePanelRunnable)
        channelPanelVisible = false
        binding.channelPanel.visibility = View.GONE
        binding.playerView.requestFocus()
    }

    private fun schedulePanelHide() {
        handler.removeCallbacks(hidePanelRunnable)
        handler.postDelayed(hidePanelRunnable, PANEL_HIDE_DELAY_MS)
    }

    private fun scheduleStatusHide() {
        handler.removeCallbacks(hideStatusRunnable)
        handler.postDelayed(hideStatusRunnable, STATUS_HIDE_DELAY_MS)
    }

    private val hidePanelRunnable = Runnable(::hideChannelPanel)
    private val hideStatusRunnable = Runnable { binding.statusText.visibility = View.GONE }

    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            window.insetsController?.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
        } else {
            window.decorView.systemUiVisibility =
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        }
    }

    private companion object {
        const val PANEL_HIDE_DELAY_MS = 8_000L
        const val STATUS_HIDE_DELAY_MS = 5_000L
        const val DEFAULT_SERVER_PORT = 8080
    }
}
