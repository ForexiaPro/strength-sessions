/*! Forexia widgets: forex sessions and currency strength. No cookies.
 * Paste where the widget goes:
 *   <div class="fx-widget" data-widget="sessions"><a href="https://forexiapro.com/">Forexia</a></div>
 *   <script async src="https://<where the widgets are served>/embed.js"></script>
 * Widgets: sessions, strength. They are loaded from the folder embed.js is in
 * (sessions.html, strength.html). Every other data-* attribute is passed to the
 * widget (theme=light|dark|auto, accent=hex, flat=1, decisions=0, window=24h,
 * tabs=0). The frame sets its own height; data-border="0" drops the border.
 */
(function () {
  var me = document.currentScript;
  var base = me && me.src ? me.src : location.href;
  var origin = new URL(base).origin;
  var WIDGETS = { sessions: 470, strength: 400 };
  var count = 0;
  var frames = {};

  function mount(el) {
    if (el.getAttribute('data-fx-ready')) return;
    var name = el.getAttribute('data-widget');
    if (!WIDGETS[name]) name = 'sessions';
    el.setAttribute('data-fx-ready', '1');
    var id = 'fx' + ++count;
    var q = [];
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (a.name.indexOf('data-') !== 0 || a.name === 'data-widget' || a.name === 'data-fx-ready' || a.name === 'data-border' || a.name === 'data-title') continue;
      q.push(encodeURIComponent(a.name.slice(5)) + '=' + encodeURIComponent(a.value));
    }
    q.push('id=' + id);
    var f = document.createElement('iframe');
    f.src = new URL(name + '.html', base).href + '?' + q.join('&');
    f.title = el.getAttribute('data-title') || (name === 'strength' ? 'Currency strength meter' : 'Forex market sessions');
    f.loading = 'lazy';
    f.setAttribute('scrolling', 'no');
    f.style.cssText = 'display:block;width:100%;height:' + WIDGETS[name] + 'px;border:' + (el.getAttribute('data-border') === '0' ? '0' : '1px solid rgba(128,140,160,.28)') + ';border-radius:14px;overflow:hidden;color-scheme:normal;transition:height .15s ease';
    frames[id] = f;
    el.insertBefore(f, el.firstChild);
    var link = el.querySelector('a');
    if (link) link.style.cssText = 'display:block;margin-top:6px;font-size:12px;opacity:.75';
  }

  function scan() {
    var els = document.querySelectorAll('.fx-widget');
    for (var i = 0; i < els.length; i++) mount(els[i]);
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== origin || !e.data || e.data.fx !== 'size') return;
    var f = frames[e.data.id];
    var h = +e.data.height;
    if (f && h > 40 && h < 4000) f.style.height = h + 'px';
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();
  window.FXWidgets = { scan: scan };
})();
