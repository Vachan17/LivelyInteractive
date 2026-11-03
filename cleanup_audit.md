# Cleanup Audit — Lively Interactive
> ✅ **Cleanup executed on 2026-10-15.** All ❌ items below have been deleted and `vite.config.js` updated.

## ✅ FILES IN USE (keep these)

### Active Pages
| File | Role |
|------|------|
| `index.html` | Home page |
| `lab-scene.html` | Projects gallery |
| `journey.html` | Glass Pavilion 3D scene |
| `ocean.html` | About Us / Ocean page |
| `contact.html` | Contact page |

### src/js — All Active
| File | Used by |
|------|---------|
| `audioManager.js` | `landingMain.js`, `oceanMain.js`, `forestMain.js` |
| `displacement.js` | `forestMain.js` (contact.html) |
| `forestMain.js` | `contact.html` |
| `forestPath.js` | `forestMain.js` |
| `landingMain.js` | `index.html`, `sunset-arch.html` |
| `liquidText.js` | `landingMain.js`, `contact.html` |
| `oceanCreatures.js` | `sunsetArchMain.js` |
| `oceanMain.js` | `ocean.html` |
| `oceanSunset.js` | `oceanMain.js` |
| `scrollAnimate.js` | `oceanMain.js` |
| `sunsetArchMain.js` | `landingMain.js` |

### Media
| File | Used by |
|------|---------|
| `Mouseclick.mp3` | `audioManager.js` (hover SFX) |
| `loop.mp3` | `audioManager.js` (background music) |

---

## ❌ FILES TO DELETE

### Standalone HTML pages (not linked from any nav, completely orphaned)
| File | Reason |
|------|--------|
| `Glass Pavilion at Night (1).html` | Old prototype, not linked anywhere |
| `Project Works.html` | Old prototype, not linked anywhere |
| `glass_dolphin.html` | Not linked anywhere |
| `jellyfish_roaming.html` | Not linked anywhere |
| `jellyfish_silver.html` | Not linked anywhere |
| `ocean-sunset.html` | Not linked from any nav page (only in vite.config.js as entry) |
| `sunset-arch.html` | Not linked from any nav page (only in vite.config.js as entry) |

### Root-level JS duplicates (copies of src/js files)
| File | Reason |
|------|--------|
| `oceanSunset.js` | Duplicate of `src/js/oceanSunset.js` |
| `sceneScroll.js` | Duplicate of `src/js/sceneScroll.js` |

### Unused src/js files
| File | Reason |
|------|--------|
| `src/js/main.js` | Not imported by any HTML page |
| `src/js/framePlayer.js` | Only used by `main.js` (which is unused) |
| `src/js/videoManager.js` | Only used by `main.js` (which is unused) |

### Unused media
| File | Reason |
|------|--------|
| `transition.mp3` | Transition audio removed (audioManager cleaned up) |
| `sergequadrado-ethereal-uplifting-loop-275529.mp3` | Not referenced anywhere |
| `shaderlab-1080x1080.webp` | Not referenced anywhere |
| `public/line_1.mp4` | Not referenced anywhere |

### Build artifacts / archives
| File | Reason |
|------|--------|
| `lively-interactive.zip` | Old archive, not needed in repo |
| `dist/` (entire folder) | Build output, not needed for dev |

> [!NOTE]
> `sunset-arch.html` is used by `landingMain.js` which is loaded by `index.html`, but it is not linked as a nav destination. It appears to be a standalone demo page. Keeping it for safety since it shares the same JS entry point.
