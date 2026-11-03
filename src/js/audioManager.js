// Central Audio API Manager for Lively Interactive
class AudioManager {
  constructor() {
    this.audioCtx = null;
    this.bgAudio = null;
    this.bgGain = null;
    this.hoverBuffer = null;
    this.isInitialized = false;
    this.activeHoveredElement = null;

    // Direct pre-instantiated Audio elements
    this.hoverAudio = new Audio('Mouseclick.mp3');

    // Page state checking
    const path = window.location.pathname.toLowerCase();
    this.isLandingPage = path.endsWith('index.html') || path.endsWith('/') || path === '' || path.endsWith('li/') || path.endsWith('li');

    // High volume settings
    this.targetVolume = this.isLandingPage ? 1.0 : 0.65;
  }

  init() {
    if (this.isInitialized) return;

    // Create Web Audio API Context
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      this.audioCtx = new AudioContextClass();
    }

    // Initialize Background Loop
    this.initBgMusic();

    // Preload & Decode SFX
    this.preloadSFX();

    // Attach UI Event Listeners
    this.attachUIEventListeners();



    // Unlock Audio Context on user interaction
    const unlockAudio = () => {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      if (this.bgAudio && this.bgAudio.paused) {
        this.bgAudio.play().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    this.isInitialized = true;
  }

  initBgMusic() {
    this.bgAudio = new Audio('loop.mp3');
    this.bgAudio.loop = true;
    this.bgAudio.volume = this.targetVolume;

    const savedTime = parseFloat(sessionStorage.getItem('li_audio_time') || '0');
    if (!isNaN(savedTime) && savedTime > 0) {
      this.bgAudio.currentTime = savedTime;
    }

    if (this.audioCtx) {
      try {
        const source = this.audioCtx.createMediaElementSource(this.bgAudio);
        this.bgGain = this.audioCtx.createGain();
        this.bgGain.gain.setValueAtTime(this.targetVolume, this.audioCtx.currentTime);
        source.connect(this.bgGain);
        this.bgGain.connect(this.audioCtx.destination);
      } catch (e) {
        this.bgAudio.volume = this.targetVolume;
      }
    }

    setInterval(() => {
      if (this.bgAudio && !this.bgAudio.paused) {
        sessionStorage.setItem('li_audio_time', this.bgAudio.currentTime.toString());
      }
    }, 300);

    window.addEventListener('beforeunload', () => {
      if (this.bgAudio) {
        sessionStorage.setItem('li_audio_time', this.bgAudio.currentTime.toString());
      }
    });

    const playPromise = this.bgAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        this.bgAudio.src = '/loop.mp3';
        if (savedTime > 0) this.bgAudio.currentTime = savedTime;
        this.bgAudio.play().catch(() => {});
      });
    }
  }

  preloadSFX() {
    if (!this.audioCtx) return;

    const loadBuffer = (url) => {
      return fetch(url)
        .then(res => {
          if (!res.ok) throw new Error('Fetch failed ' + url);
          return res.arrayBuffer();
        })
        .then(buffer => this.audioCtx.decodeAudioData(buffer));
    };

    loadBuffer('Mouseclick.mp3')
      .then(decoded => { this.hoverBuffer = decoded; })
      .catch(() => loadBuffer('/Mouseclick.mp3').then(d => { this.hoverBuffer = d; }).catch(() => {}));


  }

  playHoverSound() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    let played = false;
    if (this.audioCtx && this.hoverBuffer) {
      try {
        const source = this.audioCtx.createBufferSource();
        source.buffer = this.hoverBuffer;
        const gain = this.audioCtx.createGain();
        gain.gain.value = 0.85;
        source.connect(gain);
        gain.connect(this.audioCtx.destination);
        source.start(0);
        played = true;
      } catch (e) {}
    }

    if (!played) {
      try {
        this.hoverAudio.currentTime = 0;
        this.hoverAudio.volume = 0.85;
        this.hoverAudio.play().catch(() => {
          const snd = new Audio('/Mouseclick.mp3');
          snd.volume = 0.85;
          snd.play().catch(() => {});
        });
      } catch (e) {}
    }
  }



  attachUIEventListeners() {
    document.addEventListener('mouseover', (e) => {
      // Never fire on select/option elements (causes rapid repeated clicks when hovering dropdown)
      if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') return;
      const btn = e.target.closest('a, button, .glass-btn-compact, [role="button"]');
      // Also skip if the matched element is or contains a select
      if (btn && btn.tagName !== 'SELECT') {
        if (this.activeHoveredElement !== btn) {
          this.activeHoveredElement = btn;
          this.playHoverSound();
        }
      } else {
        this.activeHoveredElement = null;
      }
    }, true);

    document.addEventListener('mouseout', (e) => {
      if (!this.activeHoveredElement) return;
      if (e.relatedTarget && this.activeHoveredElement.contains(e.relatedTarget)) {
        return;
      }
      this.activeHoveredElement = null;
    }, true);



    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;

      const href = link.getAttribute('href');

      if (href && !href.startsWith('#') && !href.startsWith('javascript:') && link.target !== '_blank' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();


        setTimeout(() => {
          window.location.href = href;
        }, 220);
      }
    }, true);
  }
}

export const audioManager = new AudioManager();

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => audioManager.init());
  } else {
    audioManager.init();
  }
}
