/**
 * FrameVideoPlayer - Clean, zero-lag Frame-by-Frame Canvas Video Engine
 * Plays video frame-by-frame in a continuous seamless loop with no borders, UI, or text.
 */
export class FrameVideoPlayer {
    constructor(options = {}) {
        this.container = options.container || document.getElementById('videoPlayerContainer');
        if (!this.container) return;

        this.videoSrc = options.src || '/line_1.mp4';
        this.canvas = this.container.querySelector('canvas') || document.createElement('canvas');
        if (!this.container.contains(this.canvas)) {
            this.container.appendChild(this.canvas);
        }

        this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true });

        // Hidden HTML5 video element for hardware decoding stream
        this.video = document.createElement('video');
        this.video.src = this.videoSrc;
        this.video.muted = true;
        this.video.loop = true;
        this.video.playsInline = true;
        this.video.autoplay = true;
        this.video.preload = 'auto';

        this.init();
    }

    async init() {
        this.bindEvents();

        // Wait for video metadata to set proper canvas dimensions with safety timeout
        await new Promise((resolve) => {
            if (this.video.readyState >= 1) {
                resolve();
            } else {
                const timer = setTimeout(resolve, 1000);
                this.video.addEventListener('loadedmetadata', () => {
                    clearTimeout(timer);
                    resolve();
                }, { once: true });
            }
        });

        this.resizeCanvas();

        try {
            await this.video.play();
        } catch (err) {
            console.warn('Muted autoplay fallback active:', err);
        }

        this.setupRenderLoop();
        this.setupVisibilitySync();
    }

    resizeCanvas() {
        if (!this.video.videoWidth || !this.video.videoHeight) return;

        // Set native canvas resolution to original video dimensions for maximum crispness
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;

        this.drawFrame();
    }

    setupRenderLoop() {
        // Use requestVideoFrameCallback for frame-accurate zero-stutter hardware synced rendering
        if ('requestVideoFrameCallback' in this.video) {
            const renderVideoFrame = () => {
                this.drawFrame();
                if (this.video) {
                    this.video.requestVideoFrameCallback(renderVideoFrame);
                }
            };
            this.video.requestVideoFrameCallback(renderVideoFrame);
        } else {
            // High-fps requestAnimationFrame fallback
            const loop = () => {
                this.drawFrame();
                requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
        }
    }

    drawFrame() {
        if (!this.ctx || !this.video || this.video.readyState < 2) return;
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    }

    bindEvents() {
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    setupVisibilitySync() {
        const page2 = document.getElementById('page2');
        if (!page2) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    if (this.video.paused) {
                        this.video.play().catch(() => {});
                    }
                } else {
                    if (!this.video.paused) {
                        this.video.pause();
                    }
                }
            });
        }, { threshold: 0.05 });

        observer.observe(page2);
    }
}

export function initFrameVideoPlayer() {
    const container = document.getElementById('videoPlayerContainer');
    if (container) {
        new FrameVideoPlayer({ container, src: '/line_1.mp4' });
    }
}
