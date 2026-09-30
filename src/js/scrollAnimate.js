export function initScrollAnimate() {
    const animatedElements = document.querySelectorAll('[data-animate]');
    if (!animatedElements.length) return;

    const revealElement = (el) => {
        const animationClass = el.dataset.animate || 'animate__fadeInRight';
        el.classList.remove('opacity-0');
        el.classList.add('animate__animated', animationClass);
    };

    if (!('IntersectionObserver' in window)) {
        animatedElements.forEach(revealElement);
        return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                revealElement(entry.target);
                obs.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.05,
        rootMargin: '50px 0px 50px 0px'
    });

    animatedElements.forEach(el => observer.observe(el));

    // Fallback check to ensure elements in viewport on load are instantly revealed
    const checkViewport = () => {
        animatedElements.forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.top < window.innerHeight + 100 && rect.bottom >= -100) {
                revealElement(el);
            }
        });
    };

    checkViewport();
    setTimeout(checkViewport, 150);
}

