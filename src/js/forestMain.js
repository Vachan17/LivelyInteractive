import { initForestPath } from './forestPath.js';
import { initDisplacement } from './displacement.js';
import './audioManager.js';

const start = () => {
    try {
        initForestPath();
    } catch (err) {
        console.error('ForestPath error:', err);
    }

    try {
        const heroContainer = document.getElementById('landing-hero');
        if (heroContainer) {
            initDisplacement(heroContainer, { ink: 0.6, flow: 0.0, split: 0.25 });
        }
    } catch (err) {
        console.error('Displacement error:', err);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
