// Simulator test harness. Bundled into the app ONLY by `IOS_TEST=1 scripts/ios/build-ipa.sh`
// (never in the shipped IPA). It drives the real UI through a fixed timeline and prints live audio
// state in an overlay so screenshots taken by simulator-test.sh show whether playback really works
// inside iOS WebKit.
(() => {
    const started = Date.now();
    const elapsed = () => Math.round((Date.now() - started) / 1000);
    const events = [];
    const errors = [];

    const box = document.createElement('div');
    box.style.cssText = [
        'position:fixed',
        'top:3px',
        'left:50%',
        'transform:translateX(-50%)',
        'width:60%',
        'z-index:2147483647',
        'pointer-events:none',
        'font:700 8.5px/1.25 ui-monospace,Menlo,monospace',
        'color:#39ff14',
        'background:rgba(0,0,0,.8)',
        'padding:3px 5px',
        'border-radius:6px',
        'white-space:pre-wrap',
        'word-break:break-all',
        'text-align:center',
    ].join(';');
    const mount = () => document.body.appendChild(box);
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount);

    const audio = () => document.getElementById('audio-player');
    const note = (msg) => {
        events.push(`${elapsed()}s ${msg}`);
        while (events.length > 3) events.shift();
    };

    window.addEventListener('error', (e) => errors.push(String(e.message).slice(0, 90)));
    window.addEventListener('unhandledrejection', (e) =>
        errors.push('rej: ' + String((e.reason && e.reason.message) || e.reason).slice(0, 90))
    );
    const originalError = console.error;
    console.error = (...args) => {
        errors.push(args.map(String).join(' ').slice(0, 90));
        originalError.apply(console, args);
    };

    const hookAudio = () => {
        const a = audio();
        if (!a || a.__hooked) return;
        a.__hooked = true;
        for (const ev of ['playing', 'pause', 'waiting', 'stalled', 'error', 'ended', 'canplay', 'emptied']) {
            a.addEventListener(ev, () => note(ev + (ev === 'error' && a.error ? `(${a.error.code})` : '')));
        }
    };

    const render = () => {
        hookAudio();
        const a = audio();
        const state = a
            ? `${a.paused ? 'PAUSED' : 'PLAYING'} ct=${a.currentTime.toFixed(1)}/${
                  Number.isFinite(a.duration) ? a.duration.toFixed(0) : '?'
              } rs=${a.readyState} ns=${a.networkState} err=${a.error ? a.error.code + ':' + (a.error.message || '') : '-'}`
            : 'no <audio> element';
        box.textContent = [
            `t=${elapsed()}s ${location.pathname.slice(0, 30)}`,
            state,
            'src=' + ((a && (a.currentSrc || a.src)) || '').slice(-28),
            events.join(' | '),
            errors.length ? 'ERR ' + errors[errors.length - 1] : '',
        ]
            .filter(Boolean)
            .join('\n');
    };
    setInterval(render, 500);

    const go = (path) => {
        history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
    };
    const click = (selector) => {
        const el = document.querySelector(selector);
        if (!el) throw new Error('missing ' + selector);
        el.click();
    };
    const at = (seconds, name, fn) =>
        setTimeout(() => {
            try {
                fn();
                note('step:' + name);
            } catch (e) {
                errors.push(`step ${name}: ${e.message}`);
            }
        }, seconds * 1000);

    // Timeline (seconds after page load)
    at(10, 'search', () => go('/search/daft%20punk'));
    at(18, 'play', () => click('.track-item[data-track-id]'));
    at(26, 'play-retry', () => {
        const a = audio();
        if (a && a.paused && a.currentTime === 0) {
            document
                .querySelector('.track-item[data-track-id]')
                .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        }
    });
    at(46, 'fullscreen', () => click('.now-playing-bar .cover'));
    at(50, 'accept-warning', () => {
        const accept = document.getElementById('epilepsy-accept-btn');
        if (accept && accept.offsetParent !== null) accept.click();
    });
    at(62, 'close-fullscreen', () => click('#close-fullscreen-cover-btn'));
    at(68, 'library', () => go('/library'));
    at(76, 'settings', () => go('/settings'));
    at(84, 'more', () => click('#ios-tabbar button[data-tab="more"]'));
    at(94, 'close-more', () => click('#sidebar-overlay'));
    at(98, 'home', () => go('/'));
})();
