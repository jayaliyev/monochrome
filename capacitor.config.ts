import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'io.github.jayaliyev.monochrome',
    appName: 'Monochrome',
    webDir: 'dist',
    backgroundColor: '#000000',
    ios: {
        // Page handles safe areas itself via env(safe-area-inset-*) (viewport-fit=cover)
        contentInset: 'never',
    },
};

export default config;
