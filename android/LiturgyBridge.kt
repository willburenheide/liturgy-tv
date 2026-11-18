// LiturgyBridge.kt: lets liturgy-tv.js read Franciscan Media's and Word on Fire's feeds from inside
// an Android / Google TV WebView. Those sites send no CORS header, so a web page can't read them
// itself; the app fetches the text and hands it back to the page.
//
// Add it to your WebView (in your Activity, after the WebView is created):
//
//     webView.settings.javaScriptEnabled = true
//     webView.addJavascriptInterface(LiturgyBridge(this, webView), "LiturgyBridge")
//
// liturgy-tv.js finds window.LiturgyBridge on its own. Change the package line to your app's.
// Needs <uses-permission android:name="android.permission.INTERNET" /> in AndroidManifest.xml.
//
// Only pages on the hosts below can be fetched, so a page can't use the bridge for anything else.
package app.liturgytv

import android.app.Activity
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class LiturgyBridge(private val activity: Activity, private val webView: WebView) {

    private val allowed = listOf(
        "https://www.franciscanmedia.org/saint-of-the-day/",
        "https://www.wordonfire.org/reflections/feed/"
    )

    /** Fetches [url] in the background and answers with LiturgyTV.reply(id, url, text); text is ""
     *  on any failure. Returns false (and fetches nothing) for an address that isn't allowed. */
    @JavascriptInterface
    fun fetchText(id: String, url: String): Boolean {
        if (allowed.none { url.startsWith(it) }) return false
        thread(isDaemon = true) {
            val text = fetch(url, 3_000_000)
            activity.runOnUiThread {
                webView.evaluateJavascript(
                    "window.LiturgyTV && LiturgyTV.reply(" + JSONObject.quote(id) + "," +
                        JSONObject.quote(url) + "," + JSONObject.quote(text) + ")", null
                )
            }
        }
        return true
    }

    /** A page's text, at most [maxChars] of it, or "" on any failure. Follows redirects on the same host. */
    private fun fetch(address: String, maxChars: Int): String {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(address).openConnection() as HttpURLConnection).apply {
                connectTimeout = 10_000
                readTimeout = 15_000
                instanceFollowRedirects = true
                setRequestProperty("User-Agent", "liturgy-tv (+https://github.com/willburenheide/liturgy-tv)")
            }
            if (conn.responseCode !in 200..299) return ""
            val out = StringBuilder()
            conn.inputStream.bufferedReader(Charsets.UTF_8).use { r ->
                val buf = CharArray(16_384)
                while (out.length < maxChars) {
                    val n = r.read(buf)
                    if (n < 0) break
                    out.append(buf, 0, n)
                }
            }
            out.toString()
        } catch (e: Exception) {
            ""
        } finally {
            conn?.disconnect()
        }
    }
}
