import { initOceanSunset } from './oceanSunset.js';
import { initScrollAnimate } from './scrollAnimate.js';
import './audioManager.js';

const start = () => {
    const oceanCanvas = document.getElementById('c') || document.getElementById('ocean');
    if (oceanCanvas) {
        try {
            const ocean = initOceanSunset(oceanCanvas, { projects: ['PROJECT 1', 'PROJECT 2', 'PROJECT 3', 'PROJECT 4'] });
            if (ocean) ocean.resume();
        } catch (err) {
            console.error('OceanSunset error:', err);
        }
    }

    try {
        initScrollAnimate();
    } catch (err) {
        console.error('ScrollAnimate error:', err);
    }

    // Navigation drawer handlers
    const menuToggleBtns = document.querySelectorAll('.menu-toggle-btn');
    const navDrawer = document.getElementById('nav-drawer');
    const navBackdrop = document.getElementById('nav-backdrop');
    const navPanel = document.getElementById('nav-panel');
    const navCloseBtn = document.getElementById('nav-close-btn');
    const navLinks = document.querySelectorAll('.nav-drawer-link');

    const openDrawer = () => {
        if (!navDrawer || !navPanel) return;
        navDrawer.classList.remove('pointer-events-none', 'opacity-0');
        navDrawer.classList.add('opacity-100');
        navPanel.classList.remove('translate-x-full');
    };

    const closeDrawer = () => {
        if (!navDrawer || !navPanel) return;
        navPanel.classList.add('translate-x-full');
        navDrawer.classList.remove('opacity-100');
        navDrawer.classList.add('opacity-0', 'pointer-events-none');
    };

    menuToggleBtns.forEach(btn => btn.addEventListener('click', openDrawer));
    if (navCloseBtn) navCloseBtn.addEventListener('click', closeDrawer);
    if (navBackdrop) navBackdrop.addEventListener('click', closeDrawer);

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            closeDrawer();
            const targetId = link.getAttribute('href');
            if (targetId && targetId.startsWith('#')) {
                e.preventDefault();
                const targetEl = document.querySelector(targetId);
                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });
    });

    // Form submission handler
    const contactForm = document.getElementById('contact-form');
    const formStatus = document.getElementById('form-status');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (formStatus) {
                formStatus.classList.remove('hidden');
            }
            contactForm.reset();
            setTimeout(() => {
                if (formStatus) formStatus.classList.add('hidden');
            }, 6000);
        });
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
