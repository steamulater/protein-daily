// Protein of the Day - Main Application

class ProteinApp {
    constructor() {
        this.viewer = null;
        this.currentProteinIndex = this.getDayOfYear() - 1;
        this.currentStyle = 'cartoon';
        this.pdbCache = new PDBCache();
        this.init();
    }

    // Get day of year (1-365)
    getDayOfYear(date = new Date()) {
        const start = new Date(date.getFullYear(), 0, 0);
        const diff = date - start;
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    }

    getTodayIndex()     { return this.getDayOfYear() - 1; }
    getYesterdayIndex() { return Math.max(0, this.getTodayIndex() - 1); }

    init() {
        this.setupViewer();
        this.setupEventListeners();
        const streakData = this.loadStreak();
        this.updateStreakUI(streakData);
        this.loadProtein(this.currentProteinIndex);
    }

    setupViewer() {
        const element = document.getElementById('protein-viewer');
        element.innerHTML = '<div class="loading"></div>';

        // Create the viewer once after the browser has laid out the element.
        // loadStructure() will reuse it via viewer.clear() rather than recreating.
        requestAnimationFrame(() => {
            element.innerHTML = '';
            try {
                this.viewer = $3Dmol.createViewer(element, {
                    backgroundColor: 'rgb(10, 10, 26)',
                    antialias: true
                });
            } catch (e) {
                console.error('Viewer init failed:', e);
            }
        });
    }

    setupEventListeners() {
        // Navigation buttons
        document.getElementById('prev-btn').addEventListener('click', () => this.navigate(-1));
        document.getElementById('next-btn').addEventListener('click', () => this.navigate(1));
        document.getElementById('today-btn').addEventListener('click', () => this.goToToday());

        // Style buttons
        document.getElementById('style-cartoon').addEventListener('click', () => this.setStyle('cartoon'));
        document.getElementById('style-surface').addEventListener('click', () => this.setStyle('surface'));
        document.getElementById('style-stick').addEventListener('click', () => this.setStyle('stick'));
        document.getElementById('style-sphere').addEventListener('click', () => this.setStyle('sphere'));

        // Reset view button
        document.getElementById('reset-view').addEventListener('click', () => this.resetView());

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') this.navigate(-1);
            if (e.key === 'ArrowRight') this.navigate(1);
        });
    }

    navigate(direction) {
        const next = this.currentProteinIndex + direction;
        const yesterday = this.getYesterdayIndex();
        const today = this.getTodayIndex();
        if (next < yesterday || next > today) return;
        this.currentProteinIndex = next;
        this.loadProtein(this.currentProteinIndex);
    }

    goToToday() {
        this.currentProteinIndex = this.getTodayIndex();
        this.loadProtein(this.currentProteinIndex);
    }

    async loadProtein(index) {
        const protein = PROTEINS[index];

        // Update UI
        this.updateCard(protein);
        this.updateDateDisplay(index);
        this.updateNavButtons(index);
        this.updateReelEmbed(protein);

        // Load 3D structure
        await this.loadStructure(protein.pdbId);
    }

    updateCard(protein) {
        // Update name and description
        document.getElementById('protein-name').textContent = protein.name;
        document.getElementById('protein-description').textContent = protein.description;

        // Update badges
        const typeBadge = document.getElementById('protein-type');
        typeBadge.textContent = protein.type.toUpperCase().replace('-', ' ');
        typeBadge.className = `type-badge ${protein.type}`;

        document.getElementById('pdb-id').textContent = `PDB: ${protein.pdbId}`;

        // Update stats with animation
        this.animateStat('bio-bar', 'bio-value', protein.bioRelevance);
        this.animateStat('notoriety-bar', 'notoriety-value', protein.notoriety);

        // Update discovery year
        document.getElementById('discovery-year').textContent = protein.discoveryYear;

        // Update fun fact
        document.getElementById('fun-fact').textContent = protein.funFact;
    }

    animateStat(barId, valueId, value) {
        const bar = document.getElementById(barId);
        const valueEl = document.getElementById(valueId);

        // Reset and animate
        bar.style.width = '0%';
        valueEl.textContent = '0';

        setTimeout(() => {
            bar.style.width = `${value}%`;
            this.animateNumber(valueEl, 0, value, 800);
        }, 100);
    }

    animateNumber(element, start, end, duration) {
        const startTime = performance.now();

        const update = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing function
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(start + (end - start) * easeOut);

            element.textContent = current;

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        };

        requestAnimationFrame(update);
    }

    updateDateDisplay(index) {
        const today = this.getTodayIndex();
        const isToday = index === today;

        // Compute the calendar date for this index (day of year → date)
        const now = new Date();
        const date = new Date(now.getFullYear(), 0, index + 1);
        const formatted = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        const label = isToday ? `Today · ${formatted}` : `Yesterday · ${formatted}`;
        document.getElementById('date-display').textContent = label;
    }

    updateNavButtons(index) {
        const yesterday = this.getYesterdayIndex();
        const today = this.getTodayIndex();
        document.getElementById('prev-btn').disabled = index <= yesterday;
        document.getElementById('next-btn').disabled = index >= today;
    }

    updateReelEmbed(protein) {
        const section = document.getElementById('reel-section');
        const container = document.getElementById('reel-container');

        if (!protein.reelUrl) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        container.innerHTML = `
            <blockquote class="instagram-media"
                data-instgrm-permalink="${protein.reelUrl}"
                data-instgrm-version="14"
                style="background:#000;border:0;border-radius:12px;margin:0 auto;max-width:400px;width:100%;">
            </blockquote>`;

        // Re-process embeds if the Instagram script already loaded
        if (window.instgrm) {
            window.instgrm.Embeds.process();
        }
    }

    async loadStructure(pdbId) {
        const viewerElement = document.getElementById('protein-viewer');

        // If viewer isn't ready yet (still initializing), wait for it
        if (!this.viewer) {
            viewerElement.innerHTML = '<div class="loading"></div>';
            await new Promise(resolve => {
                const check = () => this.viewer ? resolve() : requestAnimationFrame(check);
                check();
            });
        }

        try {
            // 1. Try cache first
            let pdbData = await this.pdbCache.get(pdbId);
            const fromCache = pdbData !== null;

            // 2. Fetch from network if not cached
            if (!fromCache) {
                const response = await fetch(`https://files.rcsb.org/download/${pdbId}.pdb`);

                if (!response.ok) {
                    throw new Error('Failed to fetch structure');
                }

                pdbData = await response.text();

                // 3. Store in cache (fire-and-forget, non-blocking)
                this.pdbCache.set(pdbId, pdbData);
            }

            // 4. Update cache status indicator
            this.updateCacheStatus(fromCache);

            // 5. Reuse existing viewer — clear and load new model
            this.viewer.clear();
            this.viewer.addModel(pdbData, 'pdb');

            // Apply current style
            this.applyStyle(this.currentStyle);

            // Center and zoom
            this.viewer.zoomTo();
            this.viewer.render();

            // Add slight rotation animation
            this.startRotation();

        } catch (error) {
            console.error('Error loading structure:', error);
            const isOffline = !navigator.onLine;
            const errMsg = error ? (error.message || String(error)) : 'unknown';
            viewerElement.innerHTML = `
                <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; color: #666;">
                    <p>${isOffline ? 'You are offline' : 'Could not load structure'}</p>
                    <p style="font-size: 0.8rem; margin-top: 10px;">PDB ID: ${pdbId}</p>
                    <p style="font-size: 0.7rem; margin-top: 6px; color: #ff6b6b;">${errMsg}</p>
                    ${!isOffline ? `<button onclick="app.retryLoad()" style="margin-top: 15px; padding: 10px 20px; background: #667eea; border: none; color: white; border-radius: 5px; cursor: pointer;">Retry</button>` : ''}
                </div>
            `;
        }
    }

    async updateCacheStatus(fromCache) {
        const indicator = document.getElementById('cache-status');
        if (!indicator) return;

        const count = await this.pdbCache.count();
        if (fromCache) {
            indicator.textContent = `⚡ Cached (${count}/365)`;
            indicator.className = 'cache-indicator cached';
        } else {
            indicator.textContent = `Loaded (${count}/365 cached)`;
            indicator.className = 'cache-indicator live';
        }
    }

    retryLoad() {
        this.loadProtein(this.currentProteinIndex);
    }

    startRotation() {
        let rotating = true;
        let timeout;

        const rotate = () => {
            if (rotating && this.viewer) {
                this.viewer.rotate(0.3, 'y');
                this.viewer.render();
                requestAnimationFrame(rotate);
            }
        };

        const stopRotation = () => { rotating = false; };

        const scheduleRestart = () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                rotating = true;
                rotate();
            }, 3000);
        };

        const viewerElement = document.getElementById('protein-viewer');

        // Stop rotation on mouse or touch interaction
        viewerElement.addEventListener('mousedown', stopRotation);
        viewerElement.addEventListener('touchstart', stopRotation, { passive: true });

        // Restart rotation after inactivity
        viewerElement.addEventListener('mouseup', scheduleRestart);
        viewerElement.addEventListener('touchend', scheduleRestart, { passive: true });

        rotate();
    }

    setStyle(style) {
        this.currentStyle = style;

        // Update button states
        document.querySelectorAll('.style-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(`style-${style}`).classList.add('active');

        // Apply style
        this.applyStyle(style);
    }

    applyStyle(style) {
        if (!this.viewer) return;

        this.viewer.setStyle({}, {}); // Clear existing styles

        switch (style) {
            case 'cartoon':
                this.viewer.setStyle({}, {
                    cartoon: {
                        color: 'spectrum',
                        thickness: 0.4
                    }
                });
                break;

            case 'surface':
                this.viewer.setStyle({}, {
                    cartoon: {
                        color: 'spectrum',
                        opacity: 0.5
                    }
                });
                this.viewer.addSurface($3Dmol.SurfaceType.VDW, {
                    opacity: 0.85,
                    color: 'spectrum'
                });
                break;

            case 'stick':
                this.viewer.setStyle({}, {
                    stick: {
                        colorscheme: 'Jmol',
                        radius: 0.15
                    }
                });
                break;

            case 'sphere':
                this.viewer.setStyle({}, {
                    sphere: {
                        colorscheme: 'Jmol',
                        scale: 0.25
                    }
                });
                break;
        }

        this.viewer.render();
    }

    resetView() {
        if (this.viewer) {
            this.viewer.zoomTo();
            this.viewer.render();
        }
    }

    // ---- Streak Tracker ----

    // Returns "YYYY-MM-DD" in local time (not UTC, avoids midnight timezone bugs)
    getDateString(date = new Date()) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // Integer number of days between two "YYYY-MM-DD" strings
    daysBetween(dateStr1, dateStr2) {
        const d1 = new Date(dateStr1 + 'T00:00:00');
        const d2 = new Date(dateStr2 + 'T00:00:00');
        return Math.round(Math.abs(d1 - d2) / (1000 * 60 * 60 * 24));
    }

    loadStreak() {
        const STREAK_KEY = 'proteindaily_streak';
        const today = this.getDateString();
        let data;

        try {
            data = JSON.parse(localStorage.getItem(STREAK_KEY));
        } catch {
            data = null;
        }

        if (!data || !data.lastVisit) {
            data = { lastVisit: today, streak: 1, longestStreak: 1 };
        } else {
            const diff = this.daysBetween(today, data.lastVisit);
            if (diff === 1) {
                data.streak += 1;
                data.lastVisit = today;
                data.longestStreak = Math.max(data.longestStreak, data.streak);
            } else if (diff >= 2) {
                data.streak = 1;
                data.lastVisit = today;
                // longestStreak preserved intentionally
            }
            // diff === 0: same day, multiple visits — no change
        }

        localStorage.setItem(STREAK_KEY, JSON.stringify(data));
        return data;
    }

    updateStreakUI(streakData) {
        const badge = document.getElementById('streak-badge');
        if (!badge) return;

        const { streak, longestStreak } = streakData;
        const isMilestone = streak % 7 === 0 || streak === 30 || streak === 100 || streak === 365;

        badge.className = `streak-badge${isMilestone ? ' streak-milestone' : ''}`;
        badge.title = `Longest streak: ${longestStreak} day${longestStreak !== 1 ? 's' : ''}`;
        badge.innerHTML = `<span class="streak-flame">&#128293;</span> ${streak} day streak`;
    }
}

// Initialize app when DOM is ready
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new ProteinApp();
});
