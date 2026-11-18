# liturgy-tv

The Church's day on your TV's home screen, controlled with the remote. Under the clock it shows a
line with today's feast and a dot in the liturgical colour. The screen takes on a soft glow in that
colour. In Advent, an Advent wreath appears, and the evening before a Holy Day of Obligation you get
a reminder. One button opens the **Saint of the Day** and **today's Gospel with Bishop Barron's
reflection** in a panel built for the couch.

The whole thing is one file, `web/liturgy-tv.js`: plain JavaScript with no libraries, made for the
web-based home screens people build for Android TV, Google TV and Fire TV.

Have a photo frame or wall tablet? See **[liturgy-frame](https://github.com/willburenheide/liturgy-frame)**.

## Try it

Open `web/index.html` in a browser, or serve the `web` folder. Use the arrow keys and Enter
like a remote. The liturgy line and colour glow work right away.

## Add it to your home screen

```html
<div id="litcal"></div>
<script src="liturgy-tv.js"></script>
<script>
  LiturgyTV.start({ line: document.getElementById('litcal'), api: 'https://liturgy-frame.<you>.workers.dev' });
  // on your "Saint & Gospel" button:
  myButton.addEventListener('click', function () { LiturgyTV.open(); });
</script>
```

Remote keys in the panel: **← →** switch between Saint and Gospel, **↑ ↓** scroll, **OK** or
**Back** close. While the panel is open, keys don't reach your page underneath.

| Option | What it does |
|---|---|
| `line` | The element for the liturgy line. |
| `api` / `key` | A [liturgy-frame](https://github.com/willburenheide/liturgy-frame) Worker for the saint and Gospel (see below). |
| `bridge` | Your Android app's bridge (see below). Found on its own as `window.LiturgyBridge`. |
| `calendar` | Default `nation/US`. Others: `nation/CA`, `nation/IT`… or `""` for the General Roman Calendar. |
| `glow` | `false` to turn off the colour glow, or an element to use for it. |
| `wreath` | `false` to turn off the Advent wreath, or an element to put it in (default: top-left corner). |
| `holy` | The element the Holy Day reminder goes in (default: under the line). |

Also available: `LiturgyTV.openSaint()`, `openGospel()`, `close()`, `isOpen()`, `today()`, `refresh()`.

## The saint and the Gospel: pick one way

Franciscan Media's and Word on Fire's feeds don't let web pages read them directly, so the panel
needs some help. Choose one:

1. **A liturgy-frame Worker** (easiest, works anywhere). Deploy
   [liturgy-frame](https://github.com/willburenheide/liturgy-frame) to Cloudflare's free plan and pass
   its address as `api`. The Worker reads the sources and caches the answers. It also adds Vatican
   News for saints Franciscan Media doesn't cover that day.
2. **The Android bridge** (no server). If your home screen runs in your own Android app's WebView,
   add [`android/LiturgyBridge.kt`](android/LiturgyBridge.kt):

   ```kotlin
   webView.addJavascriptInterface(LiturgyBridge(this, webView), "LiturgyBridge")
   ```

   The app fetches the feeds for the page. It can only reach those publishers' pages.

Without either one, everything else still works, and the panel explains what's missing.

## Sources, and being a good neighbour

This project stores no texts itself. Each day it reads them from their publishers and always shows their names:

- **Liturgical Calendar API**: [litcal.johnromanodorazio.com](https://litcal.johnromanodorazio.com), open source, by Fr. John Romano D'Orazio (downloaded once a year and kept on the TV)
- **Franciscan Media**: [Saint of the Day](https://www.franciscanmedia.org/saint-of-the-day/)
- **Word on Fire**: [Daily Gospel Reflections](https://www.wordonfire.org/reflections/) by Bishop Robert Barron

Please keep the credit lines, and keep this for home and parish use. If you want to use their
text in anything commercial, ask the publisher first. Their pages sometimes change. If something
stops showing, please [open an issue](https://github.com/willburenheide/liturgy-tv/issues).

## Credits

This first ran on the home screen of [couch-tv](https://github.com/Seagey/couch-tv) by Seagey. It's
shared here on its own so anyone can put it on their TV.

*Ad majorem Dei gloriam.* MIT licensed.
