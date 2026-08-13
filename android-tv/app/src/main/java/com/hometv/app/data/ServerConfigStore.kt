package com.hometv.app.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class ServerConfigStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun load(): ServerEndpoint? {
        val ip = preferences.getString(KEY_SERVER_IP, null) ?: return null
        val port = preferences.getInt(KEY_SERVER_PORT, -1)
        return runCatching { ServerEndpoint.parse(ip, port.toString()) }.getOrNull()
    }

    suspend fun save(endpoint: ServerEndpoint) = withContext(Dispatchers.IO) {
        check(
            preferences.edit()
                .putString(KEY_SERVER_IP, endpoint.ip)
                .putInt(KEY_SERVER_PORT, endpoint.port)
                .commit()
        ) { "无法保存服务器设置" }
    }

    private companion object {
        const val PREFERENCES_NAME = "server_configuration"
        const val KEY_SERVER_IP = "server_ip"
        const val KEY_SERVER_PORT = "server_port"
    }
}
