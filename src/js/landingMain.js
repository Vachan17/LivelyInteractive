import { initSunsetArch } from './sunsetArchMain.js';
import { initLiquidText } from './liquidText.js';
import './audioManager.js';

const start = () => {
    try {
        const canvas = document.getElementById('c');
        if (canvas) {
            initSunsetArch(canvas);
        }
        initLiquidText();
    } catch (err) {
        console.error('SunsetArch error:', err);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
