// Simulator audio probe. Bundled ONLY by `IOS_TEST=probe` (never in the shipped IPA).
// Tries several ways of giving iOS WebKit the (extension-less, application/octet-stream) FLAC stream
// and prints which ones the platform accepts, so we can pick a fix based on facts.
(() => {
    const URL_FLAC = 'https://tracks.monochrome.st/track/155102871061270528';
    const results = [];

    const box = document.createElement('div');
    box.style.cssText = [
        'position:fixed',
        'inset:70px 6px auto 6px',
        'z-index:2147483647',
        'pointer-events:none',
        'font:700 12px/1.35 ui-monospace,Menlo,monospace',
        'color:#39ff14',
        'background:rgba(0,0,0,.92)',
        'padding:8px',
        'border-radius:8px',
        'white-space:pre-wrap',
        'word-break:break-all',
    ].join(';');
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(box));
    const render = (extra = '') => {
        box.textContent = 'AUDIO PROBE (iOS WebKit)\n' + results.join('\n') + (extra ? '\n' + extra : '');
    };

    const canPlay = () => {
        const a = document.createElement('audio');
        return ['audio/flac', 'audio/x-flac', 'audio/mpeg', 'audio/mp4'].map((t) => `${t}=${a.canPlayType(t) || 'no'}`).join(' ');
    };

    const settle = (a, label, ms = 15000) =>
        new Promise((resolve) => {
            let done = false;
            const finish = (status) => {
                if (done) return;
                done = true;
                const dur = Number.isFinite(a.duration) ? a.duration.toFixed(0) : '?';
                results.push(`${label}: ${status} rs=${a.readyState} dur=${dur} ct=${a.currentTime.toFixed(1)}${a.error ? ' err=' + a.error.code : ''}`);
                try {
                    a.pause();
                    a.removeAttribute('src');
                    a.load();
                } catch {}
                render();
                resolve();
            };
            a.addEventListener('error', () => finish('FAIL'));
            a.addEventListener('canplay', () => finish('OK(canplay)'));
            a.addEventListener('playing', () => finish('OK(playing)'));
            setTimeout(() => finish('TIMEOUT'), ms);
            a.play?.().catch(() => {});
        });

    const plain = async (label, { cors = false, sourceType = null } = {}) => {
        const a = document.createElement('audio');
        a.preload = 'auto';
        if (cors) a.crossOrigin = 'anonymous';
        if (sourceType) {
            const s = document.createElement('source');
            s.src = URL_FLAC;
            s.type = sourceType;
            a.appendChild(s);
        } else {
            a.src = URL_FLAC;
        }
        a.load();
        await settle(a, label);
    };

    const viaBlob = async (label, type) => {
        try {
            const res = await fetch(URL_FLAC);
            const buf = await res.arrayBuffer();
            const a = document.createElement('audio');
            a.preload = 'auto';
            a.src = URL.createObjectURL(new Blob([buf], { type }));
            a.load();
            await settle(a, `${label} (${(buf.byteLength / 1048576).toFixed(0)}MB)`);
        } catch (e) {
            results.push(`${label}: FETCH FAIL ${e.message}`);
            render();
        }
    };

    const run = async () => {
        render('canPlayType: ' + canPlay());
        results.push('canPlayType: ' + canPlay());
        await plain('1 direct src');
        await plain('2 direct src + CORS', { cors: true });
        await plain('3 <source type=audio/flac>', { sourceType: 'audio/flac' });
        await plain('4 <source flac> + CORS', { sourceType: 'audio/flac', cors: true });
        await plain('5 <source audio/x-flac>', { sourceType: 'audio/x-flac' });
        await viaBlob('6 blob audio/flac', 'audio/flac');
        await viaBlob('7 blob audio/x-flac', 'audio/x-flac');
        results.push('PROBE DONE');
        render();
    };

    // Give the app a moment to load first.
    setTimeout(run, 4000);
})();
