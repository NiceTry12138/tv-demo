package com.hometv.app.data

data class ServerEndpoint(
    val ip: String,
    val port: Int
) {
    val baseUrl: String
        get() = "http://$ip:$port"

    fun channelsUrl(cnOnly: Boolean = true): String =
        if (cnOnly) "$baseUrl/iptv/v1/channels.json?country=CN"
        else "$baseUrl/iptv/v1/channels.json"

    val checkUrl: String
        get() = "$baseUrl/check"

    companion object {
        fun parse(ip: String, port: String): ServerEndpoint {
            val normalizedIp = ip.trim()
            require(isValidIpv4(normalizedIp)) { "请输入有效的 IPv4 地址" }
            val normalizedPort = port.trim().toIntOrNull()
            require(normalizedPort != null && normalizedPort in 1..65_535) {
                "端口必须是 1 到 65535 的整数"
            }
            return ServerEndpoint(normalizedIp, normalizedPort)
        }

        internal fun isValidIpv4(value: String): Boolean {
            val parts = value.split('.')
            return parts.size == 4 && parts.all { part ->
                part.isNotEmpty() &&
                    part.length <= 3 &&
                    part.all(Char::isDigit) &&
                    (part.length == 1 || !part.startsWith('0')) &&
                    part.toIntOrNull() in 0..255
            }
        }
    }
}
