/**
 * ScrollAnimate - Smooth Fade-In and Fade-Out Observer for Showcase Cards
 * Animates Cards 01-04 into view when scrolling down and out of view when scrolling away.
 */
export function initScrollAnimate() {
    const cards = document.querySelectorAll('#page1, #page2, #page3, #page4');
    if (!cards.length) return;

    cards.forEach(card => {
        card.style.transition = 'opacity 0.75s cubic-bezier(0.16, 1, 0.3, 1), transform 0.75s cubic-bezier(0.16, 1, 0.3, 1)';
        card.style.willChange = 'opacity, transform';
        card.style.opacity = '0';
        card.style.transform = 'translateY(40px)';
    });

    if (!('IntersectionObserver' in window)) {
        cards.forEach(card => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0px)';
        });
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Smooth Fade In & Slide Up into position
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0px)';
            } else {
                // Smooth Fade Out as card leaves viewport
                entry.target.style.opacity = '0';
                const rect = entry.boundingClientRect;
                if (rect.top < 0) {
                    entry.target.style.transform = 'translateY(-30px)';
                } else {
                    entry.target.style.transform = 'translateY(30px)';
                }
            }
        });
    }, {
        threshold: 0.12,
        rootMargin: '0px 0px 0px 0px'
    });

    cards.forEach(card => observer.observe(card));
}
