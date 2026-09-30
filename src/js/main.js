import { initFrameVideoPlayer } from './framePlayer.js';
import { initScrollAnimate } from './scrollAnimate.js';
import { initForestPath } from './forestPath.js';
import { initDisplacement } from './displacement.js';

const setupNavigation = () => {
    const knowAboutUsBtns = document.querySelectorAll('#hero-know-about-us-btn, #nav-know-us-btn');
    knowAboutUsBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const page1 = document.getElementById('page1');
            if (page1) {
                page1.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

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

const start = () => {
    try {
        initForestPath();
    } catch (err) {
        console.error('ForestPath error:', err);
    }

    try {
        const heroContainer = document.getElementById('landing-hero') || document.getElementById('hero');
        if (heroContainer) {
            initDisplacement(heroContainer, { ink: 0.6, flow: 0.0, split: 0.25 });
        }
        document.querySelectorAll('.hero-fx').forEach(el => {
            if (el !== heroContainer) {
                initDisplacement(el, { ink: 0.6, flow: 0.0, split: 0.25 });
            }
        });
    } catch (err) {
        console.error('Displacement error:', err);
    }

    try {
        initScrollAnimate();
    } catch (err) {
        console.error('ScrollAnimate error:', err);
    }

    try {
        initFrameVideoPlayer();
    } catch (err) {
        console.error('FrameVideoPlayer error:', err);
    }

    setupNavigation();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
