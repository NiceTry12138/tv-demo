package com.hometv.app.data

object SourceRanker {
    fun rank(sources: List<ChannelSource>): List<ChannelSource> =
        sources
            .filter { it.url.startsWith("http://") || it.url.startsWith("https://") }
            .distinctBy { it.url }
            .sortedWith(compareByDescending<ChannelSource>(::score).thenBy { it.url })

    internal fun score(source: ChannelSource): Int {
        var score = when (source.status.lowercase()) {
            "available", "ok" -> 1_000
            "unavailable", "failed", "error" -> 0
            else -> 500
        }

        score += when (source.videoCodec?.lowercase()) {
            "h264", "avc" -> 200
            null, "" -> 100
            else -> 0
        }

        val height = source.quality
            ?.let { QUALITY_HEIGHT.find(it)?.groupValues?.get(1)?.toIntOrNull() }
            ?: 0
        score += when (height) {
            in 900..1200 -> 120
            in 650..899 -> 100
            in 480..649 -> 70
            in 1..479 -> 30
            in 2000..2999 -> -100
            in 4000..Int.MAX_VALUE -> -300
            else -> 50
        }

        if (source.geoBlocked) score -= 200
        if (!source.alwaysOn) score -= 100
        return score
    }

    private val QUALITY_HEIGHT = Regex("(\\d{3,4})")
}
