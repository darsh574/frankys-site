// ========================================
// INTERACTIVE KINETIC GRID CANVAS SYSTEM
// ========================================

let canvas;
let ctx;

// Configuration
const config = {
    cellSize: 50,
    baseRadius: 220,
    clickMultiplier: 1.8,
    baseForce: 22,
    clickForce: 45,
    lerpMouse: 0.15,
    lerpGrid: 0.18,
    trailMaxLength: 20,
    trailFadeSpeed: 0.9,
    blueAccent: '59, 130, 246'
};

// State Management
let width, height, dpr;
let points = [];
let mouse = { x: -1000, y: -1000, active: false };
let smoothedMouse = { x: -1000, y: -1000 };
let isClicking = false;
let trail = [];
let lastTrailUpdate = 0;
let needsRedraw = true; // Dirty flag for GPU optimization

function initCanvas() {
    canvas = document.getElementById('kinetic-grid');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Cap devicePixelRatio to 2 to massively boost performance on 3x/4x retina displays
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    createGrid();
}

function createGrid() {
    points = [];
    const cols = Math.ceil(width / config.cellSize) + 2;
    const rows = Math.ceil(height / config.cellSize) + 2;

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const posX = x * config.cellSize;
            const posY = y * config.cellSize;
            points.push({
                originX: posX,
                originY: posY,
                currentX: posX,
                currentY: posY,
                targetX: posX,
                targetY: posY
            });
        }
    }
}

function handleResize() {
    initCanvas();
}

// Interaction Listeners
window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;

    // Update Trail
    const now = Date.now();
    trail.push({ x: e.clientX, y: e.clientY, timestamp: now });
    if (trail.length > config.trailMaxLength) trail.shift();
    lastTrailUpdate = now;
    needsRedraw = true; // Wake up the loop on mouse movement
});

window.addEventListener('mousedown', () => { isClicking = true; needsRedraw = true; });
window.addEventListener('mouseup', () => { isClicking = false; needsRedraw = true; });
window.addEventListener('resize', handleResize);

// Linear Interpolation
function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
}

function update() {
    if (!ctx) return;

    let stillMoving = false; // Track if we still need to animate

    // Smooth mouse position (Lerp 0.15)
    smoothedMouse.x = lerp(smoothedMouse.x, mouse.x, config.lerpMouse);
    smoothedMouse.y = lerp(smoothedMouse.y, mouse.y, config.lerpMouse);

    const currentRadius = isClicking ? config.baseRadius * config.clickMultiplier : config.baseRadius;
    const currentForce = isClicking ? config.clickForce : config.baseForce;

    points.forEach(p => {
        const dx = p.originX - smoothedMouse.x;
        const dy = p.originY - smoothedMouse.y;
        const distSq = dx * dx + dy * dy;
        const radiusSq = currentRadius * currentRadius;

        if (distSq < radiusSq) {
            const distance = Math.sqrt(distSq);
            // Cubic easing: t^3 where t = 1 - (dist/radius)
            const t = 1 - distance / currentRadius;
            const force = (t * t * t) * currentForce;
            const angle = Math.atan2(dy, dx);

            p.targetX = p.originX + Math.cos(angle) * force;
            p.targetY = p.originY + Math.sin(angle) * force;
        } else {
            p.targetX = p.originX;
            p.targetY = p.originY;
        }

        // Smooth grid point movement (Lerp 0.18)
        p.currentX = lerp(p.currentX, p.targetX, config.lerpGrid);
        p.currentY = lerp(p.currentY, p.targetY, config.lerpGrid);

        // Keep animating if points are still noticeably moving
        if (Math.abs(p.currentX - p.targetX) > 0.1 || Math.abs(p.currentY - p.targetY) > 0.1) {
            stillMoving = true;
        }
    });

    // Check if mouse lerp is still noticeable
    if (Math.abs(smoothedMouse.x - mouse.x) > 0.5 || Math.abs(smoothedMouse.y - mouse.y) > 0.5) {
        stillMoving = true;
    }

    // Handle Trail Decay
    if (Date.now() - lastTrailUpdate > 80) {
        if (trail.length > 0) {
            if (Math.random() > 0.5) {
                trail.shift();
                stillMoving = true; // Keep drawing while trail decays
            }
        }
    }

    if (!stillMoving && trail.length === 0 && !isClicking && mouse.active) {
        needsRedraw = false; // Put animation to sleep to save GPU
    }
}

function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    const currentRadius = isClicking ? config.baseRadius * config.clickMultiplier : config.baseRadius;
    const cols = Math.ceil(width / config.cellSize) + 2;

    // 1. Draw Radial Glow
    const gradient = ctx.createRadialGradient(
        smoothedMouse.x, smoothedMouse.y, 0,
        smoothedMouse.x, smoothedMouse.y, currentRadius * 0.6
    );
    gradient.addColorStop(0, `rgba(${config.blueAccent}, 0.06)`);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // 2. Draw Grid Lines
    ctx.lineWidth = 0.5;

    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const row = Math.floor(i / cols);
        const col = i % cols;

        // Connect Horizontal
        if (col < cols - 1) {
            const nextP = points[i + 1];
            drawLine(p, nextP, currentRadius);
        }

        // Connect Vertical
        if (i + cols < points.length) {
            const bottomP = points[i + cols];
            drawLine(p, bottomP, currentRadius);
        }
    }

    // 3. Draw Intersection Dots
    const currentRadiusSq = currentRadius * currentRadius;
    points.forEach(p => {
        const dx = p.currentX - smoothedMouse.x;
        const dy = p.currentY - smoothedMouse.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < currentRadiusSq) {
            const dist = Math.sqrt(distSq);
            const t = 1 - dist / currentRadius;
            const size = 1 + (t * t * 2.5);
            const opacity = 0.15 + (t * t * 0.85);

            ctx.beginPath();
            ctx.arc(p.currentX, p.currentY, size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.fill();
        }
    });

    // 4. Draw Cursor Trail
    if (trail.length > 2) {
        ctx.beginPath();
        ctx.moveTo(trail[0].x, trail[0].y);
        for (let i = 1; i < trail.length - 2; i++) {
            const xc = (trail[i].x + trail[i + 1].x) / 2;
            const yc = (trail[i].y + trail[i + 1].y) / 2;
            ctx.quadraticCurveTo(trail[i].x, trail[i].y, xc, yc);
        }
        ctx.strokeStyle = `rgba(${config.blueAccent}, 0.4)`;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();
    }
}

function drawLine(p1, p2, radius) {
    const midX = (p1.currentX + p2.currentX) / 2;
    const midY = (p1.currentY + p2.currentY) / 2;
    const dx = midX - smoothedMouse.x;
    const dy = midY - smoothedMouse.y;
    const distSq = dx * dx + dy * dy;
    const radiusSq = radius * radius;

    ctx.beginPath();
    ctx.moveTo(p1.currentX, p1.currentY);
    ctx.lineTo(p2.currentX, p2.currentY);

    if (distSq < radiusSq) {
        const dist = Math.sqrt(distSq);
        const t = 1 - dist / radius;
        const opacity = 0.06 + (t * t * 0.74);
        const width = 0.5 + (t * t * 2.5);

        ctx.strokeStyle = `rgba(${config.blueAccent}, ${opacity})`;
        ctx.lineWidth = width;
    } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 0.5;
    }
    ctx.stroke();
}

function loop() {
    if (needsRedraw) {
        update();
        draw();
    }
    requestAnimationFrame(loop);
}

// ========================================
// CLIENT MANAGER - HARDCODED DATA
// ========================================
// To add/edit clients, modify the array below.

// ========================================
// SCATTERED CLIENT MANAGER
// ========================================

class ScatteredClientManager {
    constructor() {
        this.clients = [
            { name: 'Tupperware', task: 'Performance & Technical SEO', status: 'active', icon: 'fa-box-open' },
            { name: 'Mind Nutrition', task: 'Shopify & BOB', status: 'active', icon: 'fa-brain' },
            { name: 'TOUJOURS', task: 'Shopify Handling', status: 'active', icon: 'fa-gem' },
            { name: 'NIF Kondhwa', task: 'Website Content Update', status: 'active', icon: 'fa-building' },
            { name: 'Creed', task: 'Website Changes', status: 'active', icon: 'fa-fire' },
            { name: 'Hovers', task: 'Website Changes', status: 'active', icon: 'fa-helicopter' },
        ];

        this.trigger = document.getElementById('clientManagerTrigger');
        this.overlay = document.getElementById('clientManagerOverlay');
        this.closeBtn = document.getElementById('closeClientManager');
        this.container = document.getElementById('clientCardsContainer');
        this.isOpen = false;

        if (!this.trigger || !this.overlay || !this.container) return;
        this.init();
    }

    init() {
        this.trigger.addEventListener('click', () => this.toggle());

        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }

        // Close on backdrop click
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });

        // Keyboard support
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) this.close();
        });
    }

    render() {
        this.container.innerHTML = this.clients.map((client, index) => {
            // Randomize entrance animation variables
            // Start from Top-Right relative to center
            // tx: positive (right), ty: negative (top)
            const tx = Math.floor(Math.random() * 400) + 100; // 100 to 500px right
            const ty = Math.floor(Math.random() * -400) - 100; // -100 to -500px top
            const r = Math.floor(Math.random() * 60) - 30; // -30 to 30deg rotation
            const d = (Math.random() * 0.4).toFixed(2); // 0 to 0.4s delay

            return `
            <div class="client-card" style="--tx: ${tx}px; --ty: ${ty}px; --r: ${r}deg; --d: ${d}s">
                <div class="client-icon">
                    <i class="fas ${client.icon}"></i>
                </div>
                <div class="client-info">
                    <div class="client-name">${this.escapeHtml(client.name)}</div>
                    <div class="client-details">${this.escapeHtml(client.task)}</div>
                </div>
                <div class="client-status ${client.status}">${client.status}</div>
                <i class="fas fa-angle-right"></i>
            </div>
            `;
        }).join('');
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        this.isOpen = true;
        this.render();
        requestAnimationFrame(() => {
            this.overlay.classList.add('active');
            if (this.trigger) this.trigger.classList.add('active');
        });
    }

    close() {
        this.isOpen = false;
        this.overlay.classList.remove('active');
        if (this.trigger) this.trigger.classList.remove('active');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ========================================
// VOICE COMMAND SYSTEM
// ========================================

class VoiceCommander {
    constructor() {
        this.micButton = document.getElementById('micButton');
        if (!this.micButton) return;
        this.searchInput = document.getElementById('platformSearch');
        if (!this.searchInput) return;
        this.cards = document.querySelectorAll('.platform-card');
        this.isListening = false;

        // Check browser support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            this.micButton.title = 'Voice not supported in this browser';
            this.micButton.style.opacity = '0.3';
            this.micButton.style.cursor = 'not-allowed';
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';

        this.micButton.addEventListener('click', () => this.toggle());

        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.toLowerCase().trim();
            console.log('🎤 Heard:', transcript);
            this.searchInput.value = transcript;
            this.processCommand(transcript);
        };

        this.recognition.onend = () => {
            this.setState('idle');
            this.isListening = false;
        };

        this.recognition.onerror = (event) => {
            console.log('🎤 Error:', event.error);
            this.setState('idle');
            this.isListening = false;
        };
    }

    toggle() {
        if (!this.recognition) return;
        if (this.isListening) {
            this.recognition.stop();
        } else {
            this.isListening = true;
            this.setState('listening');
            this.recognition.start();
        }
    }

    setState(state) {
        this.micButton.classList.remove('listening', 'processing');
        if (state === 'listening') {
            this.micButton.classList.add('listening');
            this.micButton.title = 'Listening... Say a platform name';
        } else if (state === 'processing') {
            this.micButton.classList.add('processing');
            this.micButton.title = 'Processing...';
        } else {
            this.micButton.title = 'Voice command';
        }
    }

    processCommand(transcript) {
        this.setState('processing');

        // Try to match against card names
        let matched = false;
        this.cards.forEach(card => {
            const name = card.getAttribute('data-name');
            if (name && transcript.includes(name)) {
                const url = card.getAttribute('href');
                if (url) {
                    window.open(url, '_blank');
                    matched = true;
                }
            }
        });

        // Also check card text content for more flexible matching
        if (!matched) {
            this.cards.forEach(card => {
                const cardText = card.textContent.toLowerCase().trim();
                if (transcript.includes(cardText) || cardText.includes(transcript)) {
                    const url = card.getAttribute('href');
                    if (url) {
                        window.open(url, '_blank');
                        matched = true;
                    }
                }
            });
        }

        if (!matched) {
            // Filter cards visually like search
            this.cards.forEach(card => {
                const name = card.getAttribute('data-name') || '';
                const text = card.textContent.toLowerCase();
                if (name.includes(transcript) || text.includes(transcript)) {
                    card.style.display = 'flex';
                } else {
                    card.style.display = 'none';
                }
            });
        }

        setTimeout(() => this.setState('idle'), 500);
    }
}

// ========================================
// SOCIAL CONNECT MODAL
// ========================================

class SocialConnect {
    constructor() {
        this.overlay = document.getElementById('scOverlay');
        this.modal = document.getElementById('scModal');
        this.closeBtn = document.getElementById('scClose');
        this.trigger = document.getElementById('socialTrigger');
        if (!this.overlay || !this.modal || !this.trigger) return;
        this.init();
    }

    init() {
        this.trigger.addEventListener('click', () => this.toggle());
        this.closeBtn.addEventListener('click', () => this.close());
        this.overlay.addEventListener('click', () => this.close());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.close();
        });
    }

    toggle() {
        this.modal.classList.contains('open') ? this.close() : this.open();
    }

    open() {
        this.overlay.classList.add('open');
        this.modal.classList.add('open');
        this.trigger.classList.add('active');
    }

    close() {
        this.overlay.classList.remove('open');
        this.modal.classList.remove('open');
        this.trigger.classList.remove('active');
    }
}

// ========================================
// CONTACT MODAL SYSTEM
// ========================================

class ContactModal {
    constructor() {
        this.overlay = document.getElementById('contactModal');
        this.closeBtn = document.getElementById('contactModalClose');
        this.openBtn = document.getElementById('contactBtn');
        if (!this.overlay || !this.openBtn) return;
        this.init();
    }

    init() {
        this.openBtn.addEventListener('click', () => this.open());
        this.closeBtn.addEventListener('click', () => this.close());
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.close();
        });
    }

    open() {
        this.overlay.classList.add('open');
        this.overlay.setAttribute('aria-hidden', 'false');
    }

    close() {
        this.overlay.classList.remove('open');
        this.overlay.setAttribute('aria-hidden', 'true');
    }
}

// ========================================
// TEXT SCRAMBLE ANIMATION SYSTEM
// ========================================

class TextScrambler {
    constructor(element, options = {}) {
        if (!element) return;
        this.element = element;
        this.originalText = element.innerText;
        this.chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
        this.speed = options.speed || 42;
        this.revealHead = 0;
        this.scrambleTrail = options.scrambleTrail || 6;
        this.delay = options.delay || 0;
        this.revealSpeed = options.revealSpeed || 0.6;
        this.interval = null;

        // Pre-split for layout stability
        const charsArr = this.originalText.split("");
        this.element.innerHTML = charsArr.map(char => {
            if (char === " ") return `<span style="display: inline-block; min-width: 0.3em">&nbsp;</span>`;
            return `<span style="display: inline-block; min-width: 0.5em"></span>`;
        }).join("");
        this.spans = this.element.querySelectorAll("span");
    }

    start() {
        if (!this.element) return;
        setTimeout(() => {
            if (this.interval) clearInterval(this.interval);
            this.interval = setInterval(() => this.update(), this.speed);
        }, this.delay);
    }

    update() {
        let reachedEnd = true;
        const charsArr = this.originalText.split("");

        charsArr.forEach((char, i) => {
            if (char === " ") return;

            if (i < this.revealHead) {
                if (this.spans[i].innerText !== char) {
                    this.spans[i].innerText = char;
                }
            } else if (i < this.revealHead + this.scrambleTrail) {
                this.spans[i].innerText = this.chars[Math.floor(Math.random() * this.chars.length)];
                reachedEnd = false;
            } else {
                this.spans[i].innerText = "";
                reachedEnd = false;
            }
        });

        this.revealHead += this.revealSpeed;

        if (reachedEnd && this.revealHead >= this.originalText.length) {
            clearInterval(this.interval);
            this.element.innerText = this.originalText; // Final cleanup
        }
    }
}

// ========================================
// NAVIGATION BAR SYSTEM
// ========================================

class NavigationBar {
    constructor() {
        this.nav = document.querySelector('nav');
        this.navLinks = document.getElementById('navLinks');
        this.pill = document.getElementById('pill');
        this.mobileMenuBtn = document.getElementById('mobileMenuBtn');
        
        if (!this.navLinks || !this.pill) return;

        this.links = this.navLinks.querySelectorAll('li');
        this.activeLink = null;
        this.init();
    }

    init() {
        this.links.forEach(li => {
            const anchor = li.querySelector('a');
            li.addEventListener('mouseenter', () => {
                this.activeLink = li;
                this.movePillTo(li);
                this.links.forEach(l => l.querySelector('a').classList.remove('active-text'));
                anchor.classList.add('active-text');
            });
        });

        this.navLinks.addEventListener('mouseleave', () => {
            this.activeLink = null;
            this.pill.style.opacity = '0';
            this.links.forEach(l => l.querySelector('a').classList.remove('active-text'));
        });

        // Mobile menu toggle logic
        if (this.mobileMenuBtn && this.nav) {
            this.mobileMenuBtn.addEventListener('click', () => {
                this.nav.classList.toggle('nav-active');
            });
            
            // Close mobile menu when a link is clicked
            this.links.forEach(li => {
                li.addEventListener('click', () => {
                    this.nav.classList.remove('nav-active');
                });
            });
        }
    }

    movePillTo(li) {
        if (window.innerWidth <= 800) return; // Disable pill on mobile
        const ulRect = this.navLinks.getBoundingClientRect();
        const liRect = li.getBoundingClientRect();
        this.pill.style.left = (liRect.left - ulRect.left) + 'px';
        this.pill.style.width = liRect.width + 'px';
        this.pill.style.opacity = '1';
    }
}

// ========================================
// SEARCH FUNCTIONALITY
// ========================================

function initSearch() {
    const searchInput = document.getElementById('platformSearch');
    if (!searchInput) return;
    const cards = document.querySelectorAll('.platform-card');

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        cards.forEach(card => {
            const name = card.getAttribute('data-name') || '';
            const text = card.textContent.toLowerCase();
            if (name.includes(term) || text.includes(term)) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
    });
}

// ========================================
// INITIALIZATION
// ========================================

let clientManager;
let voiceCommander;
let navigationBar;

document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    loop();
    initSearch();
    clientManager = new ScatteredClientManager();
    voiceCommander = new VoiceCommander();
    navigationBar = new NavigationBar();
    new ContactModal();
    new SocialConnect();

    // Scramble Animations
    const greeting = document.getElementById('greetingText');
    const tagline = document.getElementById('taglineText');

    if (greeting) new TextScrambler(greeting, { delay: 400, speed: 40, revealSpeed: 0.4 }).start();
    if (tagline) new TextScrambler(tagline, { delay: 900, speed: 40, revealSpeed: 0.4 }).start();
});
