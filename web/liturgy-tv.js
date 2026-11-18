// liturgy-tv.js: the liturgical day on a TV home screen, driven by a remote (D-pad). Plain ES5,
// no libraries, so it runs in old Android TV / Google TV WebViews.
//
//   <div id="litcal"></div>
//   <script src="liturgy-tv.js"></script>
//   <script>LiturgyTV.start({ line: document.getElementById('litcal') });</script>
//
// What it shows:
// - The liturgy line: today's celebration on the Roman Calendar with a dot in the liturgical
//   colour, e.g. "● Saint Charles Borromeo, Bishop · Memorial". On a weekday it names the optional
//   memorials too. Data: the free Liturgical Calendar API, downloaded once a year and kept.
// - A soft glow over the screen in the day's colour (green, violet, red, rose, or gold on white days).
// - An Advent wreath badge (one more candle each Sunday of Advent; all five through Christmas).
// - A Holy Day of Obligation reminder from 3 PM the day before until noon on the day.
// - A reading panel (LiturgyTV.open(), e.g. from a button on your home screen): Saint of the Day on
//   a saint's day, else Today's Gospel; Left and Right switch, Up and Down scroll, OK or Back closes.
//
// Where the saint and the Gospel come from: Franciscan Media's and Word on Fire's feeds don't
// allow web pages to read them (no CORS header), so the panel needs one of:
//   api:    a liturgy-frame Worker (https://github.com/willburenheide/liturgy-frame), which reads
//           them and answers /api/daily. Works in any browser.
//   bridge: your Android app reads them for the page. See android/LiturgyBridge.kt.
// With neither, the line, glow, wreath and Holy Day reminder still work; the panel says what's missing.
//
// Options for start():
//   line      element for the liturgy line (required to show it)
//   holy      element the Holy Day reminder goes in (default: right after the line)
//   glow      true (default) for the colour glow; or an element to use for it
//   wreath    true (default) for the Advent wreath badge; or an element to put it in
//   calendar  Liturgical Calendar API calendar, default "nation/US" ("" = General Roman Calendar)
//   api       liturgy-frame Worker address;  key: its ACCESS_KEY if it has one
//   bridge    the Android bridge object (default: window.LiturgyBridge if present)
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var LITCAL = "https://litcal.johnromanodorazio.com/api/v5/calendar/";
  var SOTD_FEED = "https://www.franciscanmedia.org/saint-of-the-day/feed/";
  var SITE = "https://www.franciscanmedia.org/saint-of-the-day/";
  var WOF_FEED = "https://www.wordonfire.org/reflections/feed/";
  var WOF = "Word on Fire · Daily Gospel Reflection (NRSV-CE)";
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var DOT = { red: "#e53935", green: "#43a047", purple: "#8e44ad", violet: "#8e44ad", rose: "#f48fb1", pink: "#f48fb1", gold: "#ffc107", black: "#9e9e9e" };
  var GLOW = { red: "198,40,40", green: "46,158,68", purple: "123,31,162", violet: "123,31,162", rose: "224,86,155", pink: "224,86,155", black: "69,90,100" };
  var opts = {}, today = null, tomorrow = null, panel = null, panelKind = "";
  var saintCache = null, gospelCache = null, dailyCache = null;

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function ymd(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function calPath() {
    var c = opts.calendar == null ? "nation/US" : String(opts.calendar).replace(/^\/+|\/+$/g, "");
    return /^(nation|diocese)\/[A-Za-z0-9_-]+$/.test(c) ? c + "/" : "";
  }
  function bridge() { return opts.bridge || window.LiturgyBridge || null; }

  // ------------------------------------------------------------------ the calendar
  function rankLabel(g) { return { 2: "Optional memorial", 3: "Memorial", 4: "Feast", 5: "Feast of the Lord", 6: "Solemnity", 7: "Solemnity" }[g] || ""; }
  // "The Immaculate Conception of the Blessed Virgin Mary, Patronal feastday of the USA" -> "Immaculate Conception"
  function holyName(n) { return n.replace(/, Patronal.*$/, "").replace(/^The /, "").replace(/ of the Blessed Virgin Mary$/, ""); }
  function shortName(n) { var i = n.indexOf(","); return i > 0 ? n.slice(0, i) : n; }
  // In the US, Jan 1, Aug 15 and Nov 1 on a Saturday or Monday are not days of obligation (USCCB, 1991).
  function usLifted(date) {
    var dow = new Date(date + "T12:00:00").getDay();
    return calPath() === "nation/US/" && /-(01-01|08-15|11-01)$/.test(date) && (dow === 6 || dow === 1);
  }

  // For each date: the highest-ranking celebration (vigil Masses left out), the season, the Holy
  // Day name, and every optional memorial when the day itself is only a weekday.
  function summarise(events) {
    var days = {}, best = {};
    events.forEach(function (e) {
      if (e.is_vigil_mass || /Vigil Mass/.test(e.name || "")) return;
      var date = String(e.date || "").slice(0, 10);
      if (date.length < 10) return;
      var g = e.grade || 0, color = (e.color && e.color[0]) || "white";
      var day = days[date] || (days[date] = {});
      if (e.liturgical_season) day.s = String(e.liturgical_season).toLowerCase();   // advent, christmas, lent, ...
      if (e.holy_day_of_obligation && !day.h && !usLifted(date)) day.h = holyName(e.name || "");
      if (g === 2) { (day.o || (day.o = [])).push(shortName(e.name || "")); return; }
      if (g > (best[date] == null ? -1 : best[date])) {
        best[date] = g;
        day.t = e.name || "";
        day.r = /Sunday/.test(day.t) ? "" : rankLabel(g);   // Sundays carry a feast grade; the name says enough
        day.c = color;
      }
    });
    Object.keys(days).forEach(function (k) { if ((best[k] || 0) >= 3) delete days[k].o; });
    return days;
  }

  function loadYear(year) {
    var key = "liturgyTV." + calPath() + year, kept = store(key);
    if (kept) { try { return Promise.resolve(JSON.parse(kept)); } catch (e) {} }
    return fetch(LITCAL + calPath() + year + "?year_type=CIVIL", { headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        var days = summarise(j.litcal || []);
        if (Object.keys(days).length < 300) return days;   // a partial answer: use it today, ask again next time
        store(key, JSON.stringify(days));
        store("liturgyTV." + calPath() + (year - 1), "");  // last year's copy
        return days;
      });
  }

  function refreshDay() {
    var d = new Date(), t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    var years = [loadYear(d.getFullYear())];
    if (t.getFullYear() !== d.getFullYear()) years.push(loadYear(t.getFullYear()).catch(function () { return {}; }));   // 31 December
    return Promise.all(years).then(function (ys) {
      today = ys[0][ymd(d)] || null;
      tomorrow = (ys[1] || ys[0])[ymd(t)] || null;
      renderAll();
    }, renderAll);
  }
  function renderAll() { renderLine(); renderWreath(); renderHoly(); }

  function renderLine() {
    var el = opts.line;
    if (!el) return;
    if (!today || !today.t) { el.innerHTML = ""; el.classList.remove("on"); setGlow(null); return; }
    // "Monday of the 33rd Week of Ordinary Time – Saint Margaret of Scotland or Saint Gertrude the Great"
    var line = esc(today.t) + (today.r ? " &middot; " + esc(today.r) : "");
    var opt = today.o ? [].concat(today.o) : [];
    if (opt.length) line += " &ndash; " + opt.map(esc).join(" or ");
    el.classList.add("litcal");
    el.innerHTML = '<span class="lit-dot" style="background:' + (DOT[today.c] || "#f7f3e8") + '"></span>' + line;
    el.classList.add("on");
    setGlow(today.c);
  }

  function setGlow(color) {
    if (opts.glow === false) return;
    var g = opts.glow && opts.glow.nodeType ? opts.glow : $("lit-glow");
    if (!g) {
      g = document.createElement("div"); g.id = "lit-glow"; g.className = "lit-glow";
      document.body.insertBefore(g, document.body.firstChild);
    }
    var rgb = color ? (GLOW[color] || "212,166,58") : null;   // white days glow gold: a white glow only greys the scene
    g.style.background = rgb ? "radial-gradient(ellipse at 85% 0%, rgba(" + rgb + ",0.30), rgba(" + rgb + ",0.08) 45%, rgba(" + rgb + ",0) 75%)" : "none";
  }

  // ------------------------------------------------------------------ Advent wreath
  function dayNum(d) { return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
  function firstAdvent(y) { var x = new Date(y, 11, 25), w = x.getDay(); return dayNum(x) - (w === 0 ? 7 : w) - 21; }
  var ORD = ["", "First", "Second", "Third", "Fourth"];
  function wreathCandles() {
    var season = today && today.s, now = new Date();
    if (season === "christmas") return 5;
    if (season !== "advent") return 0;
    return Math.max(1, Math.min(4, Math.floor((dayNum(now) - firstAdvent(now.getFullYear())) / 7) + 1));
  }
  function renderWreath() {
    if (opts.wreath === false) return;
    var n = wreathCandles(), host = opts.wreath && opts.wreath.nodeType ? opts.wreath : null, el = $("lit-wreath");
    if (!n) { if (el) el.parentNode.removeChild(el); return; }
    if (!el) {
      el = document.createElement("div"); el.id = "lit-wreath"; el.className = "lit-wreath" + (host ? "" : " lit-wreath--corner"); el.setAttribute("aria-hidden", "true");
      (host || document.body).appendChild(el);
    }
    var C = [{ x: 13, b: 33, h: 17, c: "#a77be0" }, { x: 25, b: 29, h: 15, c: "#a77be0" }, { x: 39, b: 29, h: 15, c: "#f2a6c6" }, { x: 51, b: 33, h: 17, c: "#a77be0" }];
    var flame = function (x, top) { return '<path class="flame" d="M' + x + " " + (top - 9) + 'c2.6 3.2 3 5.6 0 7.4c-3-1.8-2.6-4.2 0-7.4z"/>'; };
    var candle = function (k) {
      var c = C[k], top = c.b - c.h, lit = k < n;
      return '<rect x="' + (c.x - 3) + '" y="' + top + '" width="6" height="' + c.h + '" rx="1.6" fill="' + (lit ? c.c : "none") + '"/>' +
        (lit ? flame(c.x, top) : '<path d="M' + c.x + " " + top + 'v-2.5"/>');
    };
    var christ = n === 5 ? '<rect x="29" y="9" width="6" height="22" rx="1.6" fill="#fffaf0"/>' + flame(32, 9) : "";
    var now = new Date(), cap, sub;
    if (n === 5) { cap = "Christmas season"; sub = "Merry Christmas"; }
    else {
      cap = ORD[n] + " week of Advent";
      var xmas = Math.round((Date.UTC(now.getFullYear(), 11, 25) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
      if (n < 4) {
        var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - now.getDay()));
        sub = "Next candle " + next.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
      } else sub = xmas === 1 ? "Christmas is tomorrow" : "Christmas in " + xmas + " days";
    }
    el.innerHTML = '<svg viewBox="0 0 64 40">' + candle(1) + candle(2) + christ +
      '<ellipse cx="32" cy="32" rx="29" ry="5.5" fill="rgba(16,16,20,.35)"/>' + candle(0) + candle(3) + "</svg>" +
      '<div class="lit-wreath-cap">' + esc(cap) + "<small>" + esc(sub) + "</small></div>";
  }

  // ------------------------------------------------------------------ Holy Days of Obligation
  // From 3 PM the day before until noon on the day (not Sundays, which always are).
  function renderHoly() {
    var el = $("lit-holy"), now = new Date(), h = now.getHours(), text = "";
    var notSunday = function (off) { return new Date(now.getFullYear(), now.getMonth(), now.getDate() + off).getDay() !== 0; };
    if (h >= 15 && tomorrow && tomorrow.h && notSunday(1)) {
      var t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      text = "Tomorrow is a Holy Day of Obligation <small>· " + esc(tomorrow.h) + ", " +
        esc(t.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })) + "</small>";
    } else if (h < 12 && today && today.h && notSunday(0)) {
      text = "Today is a Holy Day of Obligation <small>· " + esc(today.h) + "</small>";
    }
    if (!text) { if (el) el.parentNode.removeChild(el); return; }
    if (!el) {
      el = document.createElement("div"); el.id = "lit-holy"; el.className = "lit-holy";
      if (opts.holy && opts.holy.nodeType) opts.holy.appendChild(el);
      else if (opts.line && opts.line.parentNode) opts.line.parentNode.insertBefore(el, opts.line.nextSibling);
      else return;
    }
    el.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3v18M7 8h10"/></svg><span>' + text + "</span>";
  }

  // ------------------------------------------------------------------ the reading panel
  function openPanel(title, sub, body, kind) {
    closePanel();
    panelKind = kind || "";
    panel = document.createElement("div");
    panel.className = "lit-panel";
    panel.innerHTML = '<div class="lit-card"><div class="lit-tabs"><span class="lit-tab' + (kind === "saint" ? " on" : "") +
      '">Saint of the Day</span><span class="lit-tab' + (kind === "gospel" ? " on" : "") + '">Today’s Gospel</span></div>' +
      '<h1 class="lit-title"></h1><p class="lit-sub"></p><div class="lit-body" id="lit-body"></div>' +
      '<p class="lit-foot">← → Saint or Gospel · ↑ ↓ to scroll · OK or Back to close</p></div>';
    panel.querySelector(".lit-title").textContent = title;
    panel.querySelector(".lit-sub").textContent = sub || "";
    panel.querySelector(".lit-body").innerHTML = body || "";
    document.body.appendChild(panel);
  }
  function closePanel() { if (panel) { panel.parentNode.removeChild(panel); panel = null; } panelKind = ""; }
  function setPanel(title, sub, body) {
    if (!panel) return;
    if (title != null) panel.querySelector(".lit-title").textContent = title;
    if (sub != null) panel.querySelector(".lit-sub").textContent = sub;
    if (body != null) panel.querySelector(".lit-body").innerHTML = body;
  }
  function wait(msg) { return '<p class="lit-wait">' + esc(msg) + "</p>"; }
  function readingSub(d) { return (today && today.t ? today.t + " · " : "") + d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }); }
  var NEEDS = "The saint and the Gospel need a liturgy-frame Worker (the api option) or the Android bridge. See the README.";

  // Home screens often act on OK when the key comes up: swallow that too while a panel is open or
  // was just closed by it. Registered first, so it sees whether a panel was open on key down.
  var swallowUp = false;
  window.addEventListener("keydown", function () { swallowUp = !!panel; }, true);
  window.addEventListener("keyup", function (e) { if (panel || swallowUp) { swallowUp = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  // While a panel is open its keys never reach the page underneath.
  window.addEventListener("keydown", function (e) {
    if (!panel) return;
    var k = e.keyCode, b = $("lit-body");
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat && (k === 13 || k === 23)) return;
    if (k === 38 || k === 19) { if (b) b.scrollTop -= 160; }
    else if (k === 40 || k === 20) { if (b) b.scrollTop += 160; }
    else if (panelKind === "saint" && (k === 39 || k === 22)) openGospel();
    else if (panelKind === "gospel" && (k === 37 || k === 21)) openSaint();
    else if (k === 13 || k === 23 || k === 32 || k === 27 || k === 8 || k === 4 || k === 37 || k === 21 ||
      e.key === "GoBack" || e.key === "BrowserBack" || e.key === "Escape") closePanel();
  }, true);

  // Saint of the Day on a saint's day (a memorial or feast of a saint, or a weekday with optional
  // memorials), else Today's Gospel (Sundays, plain weekdays, solemnities, feasts of the Lord).
  function openReading() {
    var saintDay = !!(today && (today.o || /^(Memorial|Optional memorial|Feast)$/.test(today.r || "")));
    if (saintDay) openSaint(); else openGospel();
  }

  // ---- from a liturgy-frame Worker (/api/daily): already parsed
  function fromWorker() {
    var day = ymd(new Date());
    if (dailyCache && dailyCache.date === day) return Promise.resolve(dailyCache);
    var headers = {};
    if (opts.key) headers["X-Liturgy-Key"] = opts.key;
    return fetch(String(opts.api).replace(/\/+$/, "") + "/api/daily?date=" + day, { headers: headers, cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { if (d.saint || d.gospel) dailyCache = d; return d; });
  }

  function openGospel() {
    var d = new Date();
    openPanel("Today’s Gospel", readingSub(d), wait("Loading…"), "gospel");
    if (gospelCache && gospelCache.day === ymd(d)) { showGospel(gospelCache); return; }
    if (opts.api) {
      fromWorker().then(function (j) {
        if (panelKind !== "gospel") return;
        if (!j.gospel) { setPanel(null, null, wait("Word on Fire hasn't posted today's Gospel yet. Try again a little later.")); return; }
        gospelCache = { day: ymd(d), ref: j.gospel.reference, gospel: j.gospel.gospel || [], reflection: j.gospel.reflection || [] };
        showGospel(gospelCache);
      }, function () { if (panelKind === "gospel") setPanel(null, null, wait("Couldn't load today's Gospel. Check the internet connection.")); });
      return;
    }
    if (!ask("gospel", WOF_FEED)) setPanel(null, null, wait(NEEDS));
  }
  function gospelFeed(xml) {
    if (panelKind !== "gospel") return;
    if (!xml) { setPanel(null, null, wait("Couldn't load today's Gospel. Check the internet connection and try again.")); return; }
    var now = new Date(), want = MONTHS[now.getMonth()] + " " + now.getDate() + ", " + now.getFullYear();
    var item = xml.split(/<item>/i).slice(1).filter(function (x) { return ((/<title>([^<]*)<\/title>/.exec(x) || [])[1] || "").indexOf(want) >= 0; })[0];
    if (!item) { setPanel(null, null, wait("Word on Fire hasn't posted today's Gospel yet. Try again a little later.")); return; }
    var html = (/<content:encoded>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content:encoded>/.exec(item) || [])[1] || "";
    var tmp = document.createElement("div");
    tmp.innerHTML = html;
    var blocks = [].slice.call(tmp.querySelectorAll("h1, h2, h3, h4, h5, h6, p")).map(function (n) {
      return { h: /^H/.test(n.tagName), text: (n.textContent || "").replace(/\s+/g, " ").trim() };
    }).filter(function (b) { return b.text; });
    var gi = -1, ri = -1;
    blocks.forEach(function (b, i) {
      if (gi < 0 && b.h && /^(The |Holy )?Gospel( Reading)?$/i.test(b.text)) gi = i;
      if (ri < 0 && b.h && /^Reflection$/i.test(b.text)) ri = i;
    });
    if (gi < 0) { setPanel(null, null, wait("Couldn't read today's Gospel.")); return; }
    var g = blocks.slice(gi + 1, ri > gi ? ri : undefined);
    gospelCache = { day: ymd(now),
      ref: (g.filter(function (b) { return b.h && /\d+:\d+/.test(b.text); })[0] || {}).text || "",
      gospel: g.filter(function (b) { return !b.h; }).map(function (b) { return b.text; }),
      reflection: ri > 0 ? blocks.slice(ri + 1).filter(function (b) { return !b.h; }).map(function (b) { return b.text; }) : [] };
    showGospel(gospelCache);
  }
  function showGospel(c) {
    setPanel(c.ref || "Today’s Gospel", null,
      c.gospel.map(function (t) { return '<p class="lit-quote">' + esc(t) + "</p>"; }).join("") +
      (c.reflection.length ? "<h3>Bishop Barron’s reflection</h3>" + c.reflection.map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("") : "") +
      '<p class="lit-credit">' + WOF + "</p>");
  }

  function openSaint() {
    var d = new Date();
    openPanel("Saint of the Day", readingSub(d), wait("Loading…"), "saint");
    if (saintCache && saintCache.day === ymd(d)) { showSaint(saintCache); return; }
    if (opts.api) {
      fromWorker().then(function (j) {
        if (panelKind !== "saint") return;
        if (!j.saint) { setPanel(null, null, wait("There's no saint's story for today yet. Try again a little later.")); return; }
        var s = j.saint, blocks = (s.blocks || []).slice();
        // "Saint of the Day for November 17" and the saint's dates: already said by the title
        while (blocks.length && blocks[0].h && /saint of the day|^\(|\d{3,4}/i.test(blocks[0].h)) blocks.shift();
        saintCache = { day: ymd(d), title: s.title, img: s.image && s.image.src || "", source: s.source,
          html: blocks.map(function (b) { return b.h ? "<h3>" + esc(b.h) + "</h3>" : "<p>" + esc(b.p) + "</p>"; }).join("") };
        showSaint(saintCache);
      }, function () { if (panelKind === "saint") setPanel(null, null, wait("Couldn't load today's saint. Check the internet connection.")); });
      return;
    }
    if (!ask("saint", SOTD_FEED)) setPanel(null, null, wait(NEEDS));
  }

  // Today's saint from Franciscan Media's feed: the item dated today (the feed's years are wrong,
  // so month and day only). The feed can lag behind the website, so then the newest saints on the
  // Saint of the Day page are read, and one is used only if its heading says "Saint of the Day
  // for <today>". Never another day's saint.
  var siteLeft = [];
  function saintFeed(xml) {
    if (panelKind !== "saint") return;
    if (!xml) { setPanel(null, null, wait("Couldn't load today's saint. Check the internet connection and try again.")); return; }
    try {
      var doc = new DOMParser().parseFromString(xml, "text/xml");
      var items = [].slice.call(doc.getElementsByTagName("item"));
      var get = function (item, tag) { var n = item.getElementsByTagName(tag)[0]; return n ? n.textContent : ""; };
      var now = new Date(), item = items.filter(function (it) {
        var m = /(\d{1,2}) ([A-Z][a-z]{2})/.exec(get(it, "pubDate"));
        return m && +m[1] === now.getDate() && m[2] === MONTHS[now.getMonth()].slice(0, 3);
      })[0];
      if (!item) { if (!ask("page", SITE)) notPosted(); return; }
      saintCache = { day: ymd(now), title: get(item, "title"), html: get(item, "content:encoded") || get(item, "encoded") || get(item, "description"), img: "" };
      showSaint(saintCache);
      var link = get(item, "link").trim();
      if (/^https:\/\/www\.franciscanmedia\.org\//.test(link)) ask("image", link);   // the picture: the story page's og:image
    } catch (e) {
      setPanel(null, null, wait("Couldn't read today's saint."));
    }
  }
  function notPosted() { if (panelKind === "saint") setPanel(null, null, wait("Franciscan Media hasn't posted today's saint yet. Try again a little later.")); }
  function meta(html, prop) {
    var m = new RegExp('<meta[^>]+property="' + prop + '"[^>]+content="([^"]+)"', "i").exec(html);
    var t = document.createElement("textarea"); t.innerHTML = m ? m[1] : ""; return t.value;   // &amp; and the like
  }
  function pageReply(url, html) {
    if (panelKind !== "saint") return;
    if (!html) { notPosted(); return; }
    if (url === SITE) {
      var seen = {};
      siteLeft = (html.match(/https:\/\/www\.franciscanmedia\.org\/saint-of-the-day\/[a-z0-9-]+\//g) || [])
        .filter(function (u) { if (seen[u] || /\/(sort|calendar|feed|page)\//.test(u)) return false; return (seen[u] = true); })
        .slice(0, 2);
    } else {
      var now = new Date(), at = html.indexOf(">Saint of the Day for " + MONTHS[now.getMonth()] + " " + now.getDate() + "<");
      if (at >= 0) {
        var from = html.lastIndexOf("<h", at), refl = html.indexOf(">Reflection<", at);
        var to = refl > 0 ? html.indexOf("<hr", refl) : -1;
        if (to < 0) to = refl > 0 ? refl + 6000 : at + 12000;
        var img = meta(html, "og:image");
        saintCache = { day: ymd(now), title: meta(html, "og:title").replace(/\s*\|\s*Franciscan Media\s*$/i, ""),
          html: html.slice(from, to).replace(/<h\d[^>]*>\s*Saint of the Day for [^<]*<\/h\d>/i, ""), img: /^https:\/\//.test(img) ? img : "" };
        showSaint(saintCache);
        return;
      }
    }
    if (!siteLeft.length || !ask("page", siteLeft.shift())) notPosted();
  }
  function imageReply(html) {
    var src = meta(html || "", "og:image");
    if (!saintCache || !/^https:\/\//.test(src)) return;
    saintCache.img = src;
    if (panelKind === "saint") showSaint(saintCache);
  }

  // The story as plain paragraphs with the saint's picture on top; image credits dropped.
  function showSaint(s) {
    var tmp = document.createElement("div");
    tmp.innerHTML = s.html;
    var paras = [];
    [].forEach.call(tmp.querySelectorAll("p, h2, h3, li"), function (n) {
      var txt = (n.textContent || "").replace(/\s+/g, " ").trim();
      if (!txt || /^Image:/i.test(txt)) return;
      if (txt.length < 60 && /Images|Wikimedia|Commons/.test(txt)) return;
      paras.push(/^H[23]$/.test(n.tagName) ? "<h3>" + esc(txt) + "</h3>" : "<p>" + esc(txt) + "</p>");
    });
    if (!paras.length) paras.push("<p>" + esc((tmp.textContent || "").trim()) + "</p>");
    setPanel(s.title || "Saint of the Day", null,
      (s.img && /^https:\/\//.test(s.img) ? '<img class="lit-img" src="' + esc(s.img) + '" alt="">' : "") + paras.join("") +
      '<p class="lit-credit">From ' + esc(s.source || "Franciscan Media") + "</p>");
  }

  // ---- the Android bridge: the app fetches a page and calls LiturgyTV.reply(id, url, text)
  var asks = 0, pending = {};
  function ask(kind, url) {
    var b = bridge();
    if (!b || !b.fetchText) return false;
    var id = "q" + (++asks);
    pending[id] = kind;
    try { return b.fetchText(id, url) !== false; } catch (e) { delete pending[id]; return false; }
  }
  function reply(id, url, text) {
    var kind = pending[id];
    delete pending[id];
    if (kind === "gospel") gospelFeed(text);
    else if (kind === "saint") saintFeed(text);
    else if (kind === "page") pageReply(url, text);
    else if (kind === "image") imageReply(text);
  }

  // ------------------------------------------------------------------ styles and start
  var css = document.createElement("style");
  css.textContent = [
    ".litcal{display:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:1.25rem;line-height:1.75rem;color:rgba(255,255,255,.86);text-shadow:0 1px 6px rgba(0,0,0,.55)}",
    ".litcal.on{display:block}",
    ".lit-dot{display:inline-block;width:.8rem;height:.8rem;border-radius:50%;margin-right:.55rem;vertical-align:.05rem;box-shadow:0 0 0 2px rgba(255,255,255,.25)}",
    ".lit-glow{position:fixed;top:0;right:0;bottom:0;left:0;pointer-events:none;z-index:0;transition:background 1.2s}",
    ".lit-wreath{display:flex;align-items:center;gap:1.2rem;height:5.5rem;padding:0 2.1rem 0 1.5rem;border-radius:2.75rem;color:#fff;background:rgba(255,255,255,.12);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);pointer-events:none}",
    ".lit-wreath--corner{position:fixed;left:5rem;top:3.6rem;z-index:5}",
    ".lit-wreath svg{width:5.6rem;height:3.5rem;fill:none;stroke:#fff;stroke-width:1.8;stroke-linejoin:round;stroke-linecap:round;overflow:visible}",
    ".lit-wreath svg ellipse{stroke-width:2.2}",
    ".lit-wreath .flame{fill:#ffd27a;stroke:none;filter:drop-shadow(0 0 3px rgba(255,190,90,.95));transform-box:fill-box;transform-origin:50% 100%;animation:lit-flick 1.6s ease-in-out infinite}",
    "@keyframes lit-flick{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.12)}}",
    "@media (prefers-reduced-motion: reduce){.lit-wreath .flame{animation:none}}",
    ".lit-wreath-cap{text-align:left;font-size:1.4375rem;font-weight:600;line-height:1.8rem}",
    ".lit-wreath-cap small{display:block;font-size:1.1rem;font-weight:400;line-height:1.4rem;color:rgba(255,255,255,.7)}",
    ".lit-holy{display:inline-flex;align-items:center;margin-top:.55rem;padding:.45rem 1.3rem .45rem 1rem;border-radius:1.6rem;font-size:1.2rem;gap:.7rem;color:#fff;background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 .1rem rgba(233,200,110,.75)}",
    ".lit-holy svg{width:1.6rem;height:1.6rem;fill:none;stroke:#e9c86e;stroke-width:2.2;stroke-linecap:round}",
    ".lit-holy small{font-size:inherit;font-weight:400;color:rgba(255,255,255,.75)}",
    ".lit-panel{position:fixed;top:0;right:0;bottom:0;left:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)}",
    ".lit-card{width:88vw;max-width:62rem;max-height:84vh;display:flex;flex-direction:column;padding:2rem 2.4rem 1.4rem;border-radius:1.6rem;background:rgba(24,24,30,.94);box-shadow:0 1.5rem 4rem rgba(0,0,0,.6);color:#fff;text-align:left;font-family:inherit}",
    ".lit-tabs{display:flex;gap:.5rem;margin-bottom:.6rem}",
    ".lit-tab{padding:.3rem 1.1rem;border-radius:1rem;font-size:1.05rem;color:rgba(255,255,255,.6);background:rgba(255,255,255,.07)}",
    ".lit-tab.on{background:#fff;color:#111;font-weight:600}",
    ".lit-title{margin:0;font-size:2.2rem;font-weight:600}.lit-sub{margin:.4rem 0 0;font-size:1.15rem;color:rgba(255,255,255,.65)}",
    ".lit-body{margin-top:1rem;overflow:hidden;overflow-y:auto;scroll-behavior:smooth;font-size:1.3rem;line-height:1.85rem;color:rgba(255,255,255,.9)}",
    ".lit-body p{margin:0 0 .9rem}.lit-body h3{margin:1.1rem 0 .6rem;font-size:1.35rem}",
    ".lit-quote{border-left:3px solid rgba(233,217,166,.6);padding-left:1rem}",
    ".lit-img{display:block;max-width:100%;max-height:22rem;margin:0 auto 1rem;border-radius:1rem;object-fit:contain}",
    ".lit-foot,.lit-credit{margin:.8rem 0 0;font-size:.95rem;color:rgba(255,255,255,.5)}",
    ".lit-wait{color:rgba(255,255,255,.7)}"
  ].join("\n");

  function start(o) {
    opts = o || {};
    if (!css.parentNode) document.head.appendChild(css);
    refreshDay();
    // The day changes at midnight: look again every 10 minutes (cheap, the year is kept).
    var shown = ymd(new Date());
    setInterval(function () { var n = ymd(new Date()); if (n !== shown) { shown = n; refreshDay(); } else renderHoly(); }, 10 * 60e3);
  }

  window.LiturgyTV = {
    start: start,
    open: openReading,          // the reading panel: saint or Gospel, as the day calls for
    openSaint: openSaint,
    openGospel: openGospel,
    close: closePanel,
    isOpen: function () { return !!panel; },
    reply: reply,               // the Android bridge answers here
    today: function () { return today; },
    refresh: refreshDay
  };
})();
