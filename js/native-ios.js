// js/native-ios.js
// iOS app shell enhancements: bottom tab bar, tap-to-open mini player, haptics.
// Only active inside the Capacitor app (index.html adds `native-ios` to <html>), or on the web with ?native-ios.
import { hapticLight, hapticMedium } from './haptics.js';

const root = document.documentElement;

const ICONS = {
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
    library:
        '<rect width="8" height="18" x="3" y="3" rx="1"/><path d="M7 3v18"/><path d="M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    queue: '<path d="M16 5H3"/><path d="M11 12H3"/><path d="M11 19H3"/><path d="M21 16V5"/><circle cx="18" cy="16" r="3"/>',
};

const svg = (name) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

function navigate(path) {
    if (path === window.location.pathname) return;
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
}

function currentTab() {
    const path = window.location.pathname.replace(/\/+$/, '');
    if (path === '' || path === '/index.html') return 'home';
    if (path.startsWith('/search')) return 'search';
    if (path.startsWith('/library')) return 'library';
    return 'more';
}

function buildTabBar() {
    const bar = document.createElement('nav');
    bar.id = 'ios-tabbar';
    bar.setAttribute('aria-label', 'Main');

    const tabs = [
        { id: 'home', label: 'Home', icon: 'home' },
        { id: 'search', label: 'Search', icon: 'search' },
        { id: 'library', label: 'Library', icon: 'library' },
        { id: 'more', label: 'More', icon: 'more' },
    ];

    for (const tab of tabs) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.tab = tab.id;
        btn.innerHTML = `${svg(tab.icon)}<span>${tab.label}</span>`;
        bar.appendChild(btn);
    }

    bar.addEventListener('click', (event) => {
        const btn = event.target.closest('button[data-tab]');
        if (!btn) return;
        void hapticLight();

        switch (btn.dataset.tab) {
            case 'home':
                if (currentTab() === 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
                else navigate('/');
                break;
            case 'library':
                if (currentTab() === 'library') window.scrollTo({ top: 0, behavior: 'smooth' });
                else navigate('/library');
                break;
            case 'search': {
                window.scrollTo({ top: 0 });
                const input = document.getElementById('search-input');
                input?.focus();
                input?.select();
                break;
            }
            case 'more':
                document.getElementById('hamburger-btn')?.click();
                break;
        }
    });

    document.body.appendChild(bar);
    return bar;
}

function syncActiveTab(bar) {
    const active = currentTab();
    for (const btn of bar.querySelectorAll('button[data-tab]')) {
        if (btn.dataset.tab === active) btn.setAttribute('aria-current', 'page');
        else btn.removeAttribute('aria-current');
    }
}

function watchLocation(callback) {
    for (const method of ['pushState', 'replaceState']) {
        const original = history[method];
        history[method] = function (...args) {
            const result = original.apply(this, args);
            callback();
            return result;
        };
    }
    window.addEventListener('popstate', callback);
}

function setupMiniPlayer() {
    const bar = document.querySelector('.now-playing-bar');
    const title = bar?.querySelector('.title');
    if (!bar || !title) return;

    const idleTitle = title.textContent.trim();

    // The whole track area opens the full-screen player. The app only listens on the cover, and
    // tapping the title/artist text would navigate away, which is wrong for a mini player.
    bar.addEventListener(
        'click',
        (event) => {
            const cover = bar.querySelector('.cover');
            const hasTrack = title.textContent.trim() !== idleTitle;
            const onCover = !!event.target.closest('.cover');

            if (onCover && hasTrack) return; // let the app open the full-screen player

            if (onCover || event.target.closest('.track-info')) {
                // Also avoids the app's blocking alert('No track is currently playing').
                event.stopImmediatePropagation();
                event.preventDefault();
                if (hasTrack && !onCover) cover?.click();
            }
        },
        true
    );

    bar.addEventListener('pointerdown', (event) => {
        if (event.target.closest('.play-pause-btn, #next-btn, #prev-btn')) void hapticMedium();
    });
}

function setupFullscreenExtras() {
    const overlay = document.getElementById('fullscreen-cover-overlay');
    if (!overlay || document.getElementById('ios-fs-queue-btn')) return;

    const queue = document.createElement('button');
    queue.id = 'ios-fs-queue-btn';
    queue.type = 'button';
    queue.title = 'Queue';
    queue.setAttribute('aria-label', 'Queue');
    queue.innerHTML = svg('queue');
    queue.addEventListener('click', () => {
        void hapticLight();
        document.getElementById('close-fullscreen-cover-btn')?.click();
        // Let the overlay close before the queue panel opens on top of the page.
        setTimeout(() => document.getElementById('queue-btn')?.click(), 250);
    });
    overlay.appendChild(queue);

    for (const id of ['fs-play-pause-btn', 'fs-next-btn', 'fs-prev-btn', 'fs-shuffle-btn', 'fs-repeat-btn']) {
        document.getElementById(id)?.addEventListener('pointerdown', () => void hapticMedium());
    }
}

function init() {
    const tabBar = buildTabBar();
    syncActiveTab(tabBar);
    watchLocation(() => syncActiveTab(tabBar));
    setupMiniPlayer();
    setupFullscreenExtras();
}

if (root.classList.contains('native-ios')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
}
