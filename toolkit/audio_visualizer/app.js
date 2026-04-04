const audioEl = document.getElementById("audioEl");
const audioFile = document.getElementById("audioFile");
const pickFileBtn = document.getElementById("pickFileBtn");
const playBtn = document.getElementById("playBtn");
const stopBtn = document.getElementById("stopBtn");
const fileName = document.getElementById("fileName");
const currentTimeEl = document.getElementById("currentTime");
const totalTimeEl = document.getElementById("totalTime");
const loopToggle = document.getElementById("loopToggle");
const resetParamsBtn = document.getElementById("resetParamsBtn");

const fftSizeSelect = document.getElementById("fftSizeSelect");
const smoothingInput = document.getElementById("smoothingInput");
const smoothingValue = document.getElementById("smoothingValue");
const gainInput = document.getElementById("gainInput");
const gainValue = document.getElementById("gainValue");
const presetSelect = document.getElementById("presetSelect");
const mirrorToggle = document.getElementById("mirrorToggle");
const peakToggle = document.getElementById("peakToggle");
const spectrumStyleSelect = document.getElementById("spectrumStyleSelect");
const showSpectrogramToggle = document.getElementById("showSpectrogramToggle");
const trailInput = document.getElementById("trailInput");
const trailValue = document.getElementById("trailValue");
const beatDetectToggle = document.getElementById("beatDetectToggle");
const beatSensitivityInput = document.getElementById("beatSensitivityInput");
const beatSensitivityValue = document.getElementById("beatSensitivityValue");
const beatCooldownInput = document.getElementById("beatCooldownInput");
const beatCooldownValue = document.getElementById("beatCooldownValue");
const beatPulseGainInput = document.getElementById("beatPulseGainInput");
const beatPulseGainValue = document.getElementById("beatPulseGainValue");

const rmsValue = document.getElementById("rmsValue");
const lowValue = document.getElementById("lowValue");
const midValue = document.getElementById("midValue");
const highValue = document.getElementById("highValue");
const beatValue = document.getElementById("beatValue");
const beatDot = document.getElementById("beatDot");

const themeToggle = document.getElementById("themeToggle");
const canvas = document.getElementById("vizCanvas");
const ctx = canvas.getContext("2d");

let audioCtx = null;
let sourceNode = null;
let analyser = null;
let gainNode = null;
let freqData = null;
let timeData = null;
let rafId = null;
let smoothLow = 0;
let smoothMid = 0;
let smoothHigh = 0;
let peakLevels = [];
let phase = 0;
let beatPulse = 0;
let prevFluxBand = null;
let fluxHistory = [];
let lastBeatTime = -1e9;
let spectrogramCanvas = null;
let spectrogramCtx = null;
let spectrogramSecPerPixel = 0.03;
let spectrogramLastAudioTime = 0;
let spectrogramScrollCarry = 0;

const LAYOUT = {
    stageTop: 0.0,
    stageBottom: 0.5,
    waveformTop: 0.53,
    waveformBottom: 0.66,
    spectrogramTop: 0.68,
    spectrogramBottom: 0.9,
    spectrumTop: 0.915,
    spectrumBottom: 0.995
};
const particles = Array.from({ length: 44 }, (_, i) => ({
    angle: (Math.PI * 2 * i) / 44,
    radius: 90 + Math.random() * 180,
    size: 1 + Math.random() * 2,
    speed: 0.0015 + Math.random() * 0.004,
    sway: Math.random() * Math.PI * 2
}));

const DEFAULTS = {
    fftSize: "2048",
    smoothing: 78,
    gain: 100,
    preset: "aurora",
    mirror: true,
    peak: true,
    spectrumStyle: "bars",
    showSpectrogram: true,
    trail: 35,
    loop: false,
    beatDetect: true,
    beatSensitivity: 120,
    beatCooldown: 140,
    beatPulseGain: 120
};

const PRESETS = {
    aurora: {
        startHue: 185,
        hueStep: 1.4,
        sat: 88,
        light: 64,
        waveLight: "rgba(242, 248, 255, 0.92)",
        badge: "rgba(102, 126, 234, 0.9)",
        bars: 160,
        waveAmp: 0.18
    },
    pulse: {
        startHue: 335,
        hueStep: -1.1,
        sat: 90,
        light: 62,
        waveLight: "rgba(255, 237, 248, 0.92)",
        badge: "rgba(255, 89, 173, 0.9)",
        bars: 140,
        waveAmp: 0.2
    },
    mono: {
        startHue: 220,
        hueStep: 0,
        sat: 10,
        light: 72,
        waveLight: "rgba(245, 247, 251, 0.92)",
        badge: "rgba(174, 187, 205, 0.92)",
        bars: 120,
        waveAmp: 0.15
    }
};

function getPreset() {
    return PRESETS[presetSelect.value] || PRESETS.aurora;
}

function getVizPalette(preset) {
    const isLight = document.documentElement.classList.contains("light");
    if (isLight) {
        return {
            barSat: Math.max(42, preset.sat - 34),
            barLight: Math.max(40, preset.light - 18),
            barAlpha: 0.72,
            waveStroke: "rgba(22, 34, 54, 0.82)",
            badgeTrack: "rgba(28, 42, 63, 0.2)",
            badgeFill: "rgba(44, 87, 178, 0.82)",
            labelColor: "rgba(20, 33, 50, 0.9)",
            clearColor: "rgba(241, 247, 255,",
            glowA: "rgba(68, 124, 226,",
            glowB: "rgba(52, 184, 199,",
            ring: "rgba(30, 82, 179, 0.55)",
            particle: "rgba(24, 67, 148, 0.75)"
        };
    }

    return {
        barSat: preset.sat,
        barLight: preset.light,
        barAlpha: 0.88,
        waveStroke: preset.waveLight,
        badgeTrack: "rgba(255, 255, 255, 0.2)",
        badgeFill: preset.badge,
        labelColor: "rgba(236, 248, 255, 0.92)",
        clearColor: "rgba(10, 15, 24,",
        glowA: "rgba(106, 82, 236,",
        glowB: "rgba(41, 197, 167,",
        ring: "rgba(196, 213, 255, 0.58)",
        particle: "rgba(216, 236, 255, 0.78)"
    };
}

function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return "00:00";
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function setThemeFromStorage() {
    const savedTheme = localStorage.getItem("theme");
    const preferLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    if (savedTheme === "light" || (!savedTheme && preferLight)) {
        document.documentElement.classList.add("light");
    }
}

function bindThemeToggle() {
    themeToggle.addEventListener("click", () => {
        const isLight = document.documentElement.classList.toggle("light");
        localStorage.setItem("theme", isLight ? "light" : "dark");
    });
}

function ensureAudioGraph() {
    if (audioCtx) {
        return;
    }

    audioCtx = new AudioContext();
    analyser = audioCtx.createAnalyser();
    gainNode = audioCtx.createGain();
    sourceNode = audioCtx.createMediaElementSource(audioEl);

    analyser.fftSize = Number(fftSizeSelect.value);
    analyser.smoothingTimeConstant = Number(smoothingInput.value) / 100;
    gainNode.gain.value = Number(gainInput.value) / 100;

    sourceNode.connect(gainNode);
    gainNode.connect(analyser);
    analyser.connect(audioCtx.destination);

    resetDataBuffers();
}

function resetDataBuffers() {
    freqData = new Uint8Array(analyser.frequencyBinCount);
    timeData = new Uint8Array(analyser.fftSize);
    peakLevels = new Array(freqData.length).fill(0);
}

function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawFrame() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const preset = getPreset();
    const spectrumStyle = spectrumStyleSelect.value;
    const palette = getVizPalette(preset);
    const trailStrength = Number(trailInput.value) / 100;

    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeData);
    const bands = computeAudioFeatures();

    const gainScale = Number(gainInput.value) / 100;

    ctx.fillStyle = `${palette.clearColor} ${Math.max(0.1, 1 - trailStrength)})`;
    ctx.fillRect(0, 0, w, h);

    drawReactiveBackdrop(w, h, bands, palette);
    drawEnergyCore(w, h, bands, palette);
    drawReactiveParticles(w, h, bands, palette);

    drawAnalysisPanels(w, h, palette);
    drawWaveform(w, h, gainScale, preset, palette);
    if (showSpectrogramToggle.checked) {
        drawSpectrogram(w, h, gainScale, palette);
    }
    drawSpectrum(w, h, gainScale, preset, palette);
    drawFeatureBadges(w, h, palette, bands);

    rmsValue.textContent = bands.rms.toFixed(3);
    lowValue.textContent = bands.low.toFixed(3);
    midValue.textContent = bands.mid.toFixed(3);
    highValue.textContent = bands.high.toFixed(3);
    beatValue.textContent = bands.beat ? "ON" : "OFF";
    beatDot.classList.toggle("active", bands.beatPulse > 0.12);

    phase += 0.01 + bands.high * 0.03;
    rafId = requestAnimationFrame(drawFrame);
}

function drawAnalysisPanels(w, h, palette) {
    const panelTop = h * (LAYOUT.waveformTop - 0.015);
    const panelBottom = h * 0.99;

    ctx.save();
    ctx.fillStyle = "rgba(8, 12, 20, 0.34)";
    if (document.documentElement.classList.contains("light")) {
        ctx.fillStyle = "rgba(236, 244, 255, 0.58)";
    }
    ctx.fillRect(0, panelTop, w, panelBottom - panelTop);

    ctx.strokeStyle = palette.labelColor;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 1;
    const lines = [LAYOUT.waveformTop, LAYOUT.waveformBottom, LAYOUT.spectrogramTop, LAYOUT.spectrogramBottom, LAYOUT.spectrumTop];
    for (let i = 0; i < lines.length; i += 1) {
        const y = h * lines[i] + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    ctx.restore();
}

function computeAudioFeatures() {
    const now = performance.now();
    const rms = computeRms(timeData);
    const low = bandEnergy(freqData, 0.01, 0.08);
    const mid = bandEnergy(freqData, 0.08, 0.35);
    const high = bandEnergy(freqData, 0.35, 1);
    const flux = computeFlux();
    const beat = detectBeat(flux, now);
    if (beat) {
        beatPulse = Number(beatPulseGainInput.value) / 100;
    }
    beatPulse *= 0.9;

    smoothLow = smoothLow * 0.82 + low * 0.18;
    smoothMid = smoothMid * 0.82 + mid * 0.18;
    smoothHigh = smoothHigh * 0.82 + high * 0.18;

    return {
        rms,
        low: smoothLow,
        mid: smoothMid,
        high: smoothHigh,
        flux,
        beat,
        beatPulse
    };
}

function computeFlux() {
    const start = Math.floor(freqData.length * 0.01);
    const end = Math.max(start + 8, Math.floor(freqData.length * 0.35));
    const step = 3;
    const current = [];
    let flux = 0;

    for (let i = start; i < end; i += step) {
        current.push(freqData[i] / 255);
    }

    if (!prevFluxBand || prevFluxBand.length !== current.length) {
        prevFluxBand = current;
        return 0;
    }

    for (let i = 0; i < current.length; i += 1) {
        const delta = current[i] - prevFluxBand[i];
        if (delta > 0) {
            flux += delta;
        }
    }

    prevFluxBand = current;
    return flux / current.length;
}

function detectBeat(flux, now) {
    if (!beatDetectToggle.checked) {
        fluxHistory = [];
        return false;
    }

    fluxHistory.push(flux);
    if (fluxHistory.length > 45) {
        fluxHistory.shift();
    }
    const avgFlux = fluxHistory.reduce((sum, x) => sum + x, 0) / Math.max(1, fluxHistory.length);

    const sensitivity = Number(beatSensitivityInput.value) / 100;
    const threshold = avgFlux * sensitivity + 0.006;
    const cooldown = Number(beatCooldownInput.value);

    if (flux > threshold && now - lastBeatTime > cooldown) {
        lastBeatTime = now;
        return true;
    }
    return false;
}

function drawReactiveBackdrop(w, h, bands, palette) {
    const cx = w * 0.5;
    const cy = h * 0.34;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, h * LAYOUT.stageTop, w, h * (LAYOUT.stageBottom - LAYOUT.stageTop));
    ctx.clip();

    const glow1 = ctx.createRadialGradient(cx, cy, 20, cx, cy, h * (0.34 + bands.low * 0.2 + bands.beatPulse * 0.15));
    glow1.addColorStop(0, `${palette.glowA} ${0.22 + bands.mid * 0.36 + bands.beatPulse * 0.32})`);
    glow1.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, w, h);

    const glow2 = ctx.createRadialGradient(cx, cy - h * 0.05, 12, cx, cy - h * 0.05, h * (0.22 + bands.high * 0.16 + bands.beatPulse * 0.1));
    glow2.addColorStop(0, `${palette.glowB} ${0.16 + bands.high * 0.45 + bands.beatPulse * 0.28})`);
    glow2.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
}

function drawEnergyCore(w, h, bands, palette) {
    const cx = w * 0.5;
    const cy = h * 0.34;
    const radius = 16 + bands.low * 36 + bands.beatPulse * 34;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, h * LAYOUT.stageTop, w, h * (LAYOUT.stageBottom - LAYOUT.stageTop));
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";

    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 2.6);
    core.addColorStop(0, `${palette.glowB} 0.82)`);
    core.addColorStop(0.35, `${palette.glowA} 0.34)`);
    core.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 2.6, 0, Math.PI * 2);
    ctx.fill();

    const ringCount = 3;
    for (let i = 0; i < ringCount; i += 1) {
        const ringRadius = radius * (1.6 + i * 0.8) + Math.sin(phase * 1.6 + i) * (4 + bands.mid * 12 + bands.beatPulse * 9);
        ctx.strokeStyle = palette.ring;
        ctx.lineWidth = Math.max(1, 2.2 - i * 0.5 + bands.beatPulse * 1.4);
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
    }

    if (bands.beatPulse > 0.08) {
        ctx.strokeStyle = palette.ring;
        ctx.lineWidth = 2 + bands.beatPulse * 4;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * (2.9 + bands.beatPulse * 1.2), 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.restore();
}

function drawReactiveParticles(w, h, bands, palette) {
    const cx = w * 0.5;
    const cy = h * 0.34;
    const flow = 0.5 + bands.high * 1.8 + bands.beatPulse * 1.6;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, h * LAYOUT.stageTop, w, h * (LAYOUT.stageBottom - LAYOUT.stageTop));
    ctx.clip();
    ctx.fillStyle = palette.particle;
    for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        p.angle += p.speed * flow;
        const wobble = Math.sin(phase + p.sway + i * 0.3) * (10 + bands.mid * 22);
        const r = p.radius + wobble;
        const x = cx + Math.cos(p.angle) * r;
        const y = cy + Math.sin(p.angle) * (r * 0.55);
        const s = p.size + bands.high * 1.8 + bands.beatPulse * 1.8;
        ctx.globalAlpha = 0.35 + bands.high * 0.45 + bands.beatPulse * 0.2;
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawSpectrum(w, h, gainScale, preset, palette) {
    const spectrumStyle = spectrumStyleSelect.value;
    const bars = mirrorToggle.checked ? Math.max(40, Math.floor(preset.bars / 2)) : preset.bars;
    const barW = w / bars;
    const maxBin = Math.min(freqData.length, 1024);
    const stride = Math.max(1, Math.floor(maxBin / bars));
    const bandTop = h * LAYOUT.spectrumTop;
    const bandBottom = h * LAYOUT.spectrumBottom;
    const spectrumHeight = bandBottom - bandTop;
    const topY = bandBottom;
    const ridge = [];
    const rightRibbon = [];
    const leftRibbon = [];

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, bandTop, w, spectrumHeight);
    ctx.clip();
    ctx.translate(0, topY);

    if (peakLevels.length !== bars) {
        peakLevels = new Array(bars).fill(0);
    }

    for (let i = 0; i < bars; i += 1) {
        const start = i * stride;
        let sum = 0;
        for (let j = 0; j < stride; j += 1) {
            sum += freqData[Math.min(start + j, freqData.length - 1)];
        }
        const norm = (sum / stride / 255) * gainScale;
        const mag = Math.max(0, Math.min(1, norm));
        peakLevels[i] = Math.max(mag, peakLevels[i] - 0.015);

        const barH = mag * spectrumHeight;
        const x = i * barW + 1;
        const hue = preset.startHue + i * preset.hueStep;
        const currentBarWidth = Math.max(1, barW - 1);
        const alpha = Math.max(0.34, palette.barAlpha - 0.16 + mag * 0.18);
        const centerX = x + currentBarWidth * 0.5;

        if (spectrumStyle === "bars") {
            ctx.fillStyle = `hsla(${hue}, ${palette.barSat}%, ${palette.barLight}%, ${alpha})`;
            ctx.fillRect(x, -barH, currentBarWidth, barH);
            ridge.push([centerX, -barH]);
        } else {
            rightRibbon.push([centerX, -barH]);
        }

        if (mirrorToggle.checked) {
            const mirroredX = w - x - currentBarWidth;
            const mirrorCenterX = mirroredX + currentBarWidth * 0.5;
            if (spectrumStyle === "bars") {
                ctx.fillRect(mirroredX, -barH, currentBarWidth, barH);
                ridge.push([mirrorCenterX, -barH]);
            } else {
                leftRibbon.push([mirrorCenterX, -barH]);
            }
        }

        if (peakToggle.checked && spectrumStyle === "bars") {
            const peakY = -peakLevels[i] * spectrumHeight;
            ctx.fillStyle = palette.labelColor;
            ctx.fillRect(x, peakY - 1, currentBarWidth, 2);
            if (mirrorToggle.checked) {
                const mirroredX = w - x - currentBarWidth;
                ctx.fillRect(mirroredX, peakY - 1, currentBarWidth, 2);
            }
        }
    }

    if (spectrumStyle === "bars") {
        ridge.sort((a, b) => a[0] - b[0]);
        if (ridge.length > 2) {
            ctx.beginPath();
            ctx.moveTo(ridge[0][0], ridge[0][1]);
            for (let i = 1; i < ridge.length; i += 1) {
                ctx.lineTo(ridge[i][0], ridge[i][1]);
            }
            ctx.strokeStyle = palette.labelColor;
            ctx.globalAlpha = 0.45;
            ctx.lineWidth = 1.4;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    } else {
        drawRibbonShape(ctx, rightRibbon, preset, palette, true);
        if (mirrorToggle.checked) {
            drawRibbonShape(ctx, leftRibbon, preset, palette, false);
        }
    }

    ctx.restore();
}

function drawSpectrogram(w, h, gainScale, palette) {
    const bandTop = h * LAYOUT.spectrogramTop;
    const bandBottom = h * LAYOUT.spectrogramBottom;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const specHeight = Math.max(16, Math.floor((bandBottom - bandTop) * dpr));
    const specWidth = Math.max(32, Math.floor(w * dpr));
    const step = 1;

    ensureSpectrogramBuffer(specWidth, specHeight);

    const isRunning = !audioEl.paused && Number.isFinite(audioEl.currentTime);
    let pixelsToShift = 0;
    if (isRunning) {
        const deltaAudio = Math.max(0, audioEl.currentTime - spectrogramLastAudioTime);
        // spectrogramSecPerPixel is defined in display-pixel space.
        // Convert to offscreen pixels by multiplying device pixel ratio.
        spectrogramScrollCarry += (deltaAudio / spectrogramSecPerPixel) * dpr;
        pixelsToShift = Math.floor(spectrogramScrollCarry);
        spectrogramScrollCarry -= pixelsToShift;
        spectrogramLastAudioTime = audioEl.currentTime;
        if (pixelsToShift > 0) {
            spectrogramCtx.drawImage(spectrogramCanvas, -pixelsToShift, 0);
        }
    }

    if (!isRunning) {
        spectrogramLastAudioTime = audioEl.currentTime || 0;
    }

    if (pixelsToShift <= 0) {
        pixelsToShift = isRunning ? 1 : 0;
    }

    const writeWidth = Math.max(step, Math.min(specWidth, pixelsToShift));
    const column = spectrogramCtx.createImageData(writeWidth, specHeight);
    const data = column.data;
    for (let y = 0; y < specHeight; y += 1) {
        const ny = y / Math.max(1, specHeight - 1);
        const freqRatio = Math.pow(1 - ny, 2.3);
        const binF = freqRatio * (freqData.length - 1);
        const bin0 = Math.floor(binF);
        const bin1 = Math.min(freqData.length - 1, bin0 + 1);
        const frac = binF - bin0;
        const interp = (freqData[bin0] * (1 - frac) + freqData[bin1] * frac) / 255;
        const raw = interp * gainScale;
        const intensity = Math.max(0, Math.min(1, Math.pow(raw, 0.72)));
        const color = heatColor(intensity);

        for (let x = 0; x < writeWidth; x += 1) {
            const idx = (y * writeWidth + x) * 4;
            data[idx] = color[0];
            data[idx + 1] = color[1];
            data[idx + 2] = color[2];
            data[idx + 3] = 255;
        }
    }

    if (writeWidth > 0) {
        spectrogramCtx.putImageData(column, specWidth - writeWidth, 0);
    }

    ctx.save();
    ctx.drawImage(spectrogramCanvas, 0, bandTop, w, bandBottom - bandTop);
    ctx.strokeStyle = palette.labelColor;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, bandTop + 0.5, w - 1, bandBottom - bandTop - 1);
    ctx.globalAlpha = 1;
    drawSpectrogramAxes(ctx, w, h, bandTop, bandBottom, palette);
    ctx.restore();
}

function drawSpectrogramAxes(context, w, h, bandTop, bandBottom, palette) {
    const nyquist = audioCtx ? audioCtx.sampleRate * 0.5 : 22050;
    const freqTicks = [100, 500, 1000, 5000, 10000];
    const plotHeight = bandBottom - bandTop;
    const leftPad = 6;

    context.save();
    context.font = "11px JetBrains Mono";
    context.fillStyle = palette.labelColor;
    context.strokeStyle = palette.labelColor;
    context.globalAlpha = 0.28;
    context.lineWidth = 1;

    for (let i = 0; i < freqTicks.length; i += 1) {
        const f = freqTicks[i];
        if (f >= nyquist) {
            continue;
        }
        const ratio = f / nyquist;
        const ny = 1 - Math.pow(ratio, 1 / 2.3);
        const y = bandTop + ny * plotHeight;
        context.beginPath();
        context.moveTo(0, y + 0.5);
        context.lineTo(w, y + 0.5);
        context.stroke();
        context.globalAlpha = 0.78;
        context.fillText(formatFreqLabel(f), leftPad, y - 2);
        context.globalAlpha = 0.28;
    }

    const rightTime = audioEl.currentTime || 0;
    const safeSecPerPixel = Math.max(0.004, Math.min(0.2, spectrogramSecPerPixel));
    const desiredStepSec = safeSecPerPixel * (w / 5);
    const timeStep = chooseTimeStep(desiredStepSec);
    const firstTick = Math.floor(rightTime / timeStep) * timeStep;
    const yAxis = bandBottom + 14;

    for (let t = firstTick; t >= 0; t -= timeStep) {
        const dt = rightTime - t;
        const x = Math.round(w - dt / safeSecPerPixel) + 0.5;
        if (x < 0) {
            break;
        }
        context.globalAlpha = 0.4;
        context.beginPath();
        context.moveTo(x + 0.5, bandTop);
        context.lineTo(x + 0.5, bandBottom);
        context.stroke();
        context.globalAlpha = 0.8;
        context.fillText(formatTimeLabel(t), x + 3, yAxis);
    }

    context.globalAlpha = 0.82;
    context.fillText("频率", leftPad, bandTop + 12);
    context.fillText("时间", w - 34, yAxis);
    context.restore();
}

function chooseTimeStep(seconds) {
    const candidates = [0.25, 0.5, 1, 2, 5, 10];
    for (let i = 0; i < candidates.length; i += 1) {
        if (seconds <= candidates[i]) {
            return candidates[i];
        }
    }
    return 10;
}

function formatFreqLabel(freq) {
    if (freq >= 1000) {
        return `${(freq / 1000).toFixed(freq % 1000 === 0 ? 0 : 1)}k`;
    }
    return `${freq}`;
}

function formatTimeLabel(seconds) {
    const s = Math.max(0, seconds);
    if (s < 60) {
        return `${s.toFixed(s % 1 === 0 ? 0 : 1)}s`;
    }
    const mins = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${mins}:${String(sec).padStart(2, "0")}`;
}

function ensureSpectrogramBuffer(width, height) {
    if (!spectrogramCanvas) {
        spectrogramCanvas = document.createElement("canvas");
        spectrogramCtx = spectrogramCanvas.getContext("2d", { willReadFrequently: true });
        spectrogramCtx.imageSmoothingEnabled = true;
    }
    if (spectrogramCanvas.width !== width || spectrogramCanvas.height !== height) {
        spectrogramCanvas.width = width;
        spectrogramCanvas.height = height;
        spectrogramCtx.fillStyle = "rgb(0, 0, 0)";
        spectrogramCtx.fillRect(0, 0, width, height);
    }
}

function heatColor(t) {
    const isLight = document.documentElement.classList.contains("light");
    const stops = isLight
        ? [
            [22, 40, 88],
            [37, 110, 184],
            [45, 172, 184],
            [255, 198, 82]
        ]
        : [
            [8, 18, 42],
            [39, 79, 189],
            [32, 181, 171],
            [255, 224, 126]
        ];

    if (t <= 0.33) {
        return lerpRgb(stops[0], stops[1], t / 0.33);
    }
    if (t <= 0.66) {
        return lerpRgb(stops[1], stops[2], (t - 0.33) / 0.33);
    }
    return lerpRgb(stops[2], stops[3], (t - 0.66) / 0.34);
}

function lerpRgb(a, b, k) {
    return [
        Math.round(a[0] + (b[0] - a[0]) * k),
        Math.round(a[1] + (b[1] - a[1]) * k),
        Math.round(a[2] + (b[2] - a[2]) * k)
    ];
}

function drawRibbonShape(context, points, preset, palette, clockwise) {
    if (points.length < 3) {
        return;
    }

    points.sort((a, b) => a[0] - b[0]);

    const area = new Path2D();
    area.moveTo(points[0][0], 0);
    area.lineTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) {
        const prev = points[i - 1];
        const curr = points[i];
        const cx = (prev[0] + curr[0]) * 0.5;
        area.quadraticCurveTo(prev[0], prev[1], cx, (prev[1] + curr[1]) * 0.5);
    }
    const last = points[points.length - 1];
    area.lineTo(last[0], 0);
    area.closePath();

    const hue = clockwise ? preset.startHue : preset.startHue + 40;
    context.fillStyle = `hsla(${hue}, ${palette.barSat}%, ${Math.max(38, palette.barLight - 4)}%, 0.34)`;
    context.fill(area);

    context.strokeStyle = `hsla(${hue}, ${palette.barSat}%, ${Math.min(85, palette.barLight + 18)}%, 0.84)`;
    context.lineWidth = 1.8;
    context.beginPath();
    context.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) {
        const prev = points[i - 1];
        const curr = points[i];
        const cx = (prev[0] + curr[0]) * 0.5;
        context.quadraticCurveTo(prev[0], prev[1], cx, (prev[1] + curr[1]) * 0.5);
    }
    context.stroke();
}

function drawWaveform(w, h, gainScale, preset, palette) {
    const top = h * LAYOUT.waveformTop;
    const bottom = h * LAYOUT.waveformBottom;
    const baseline = (top + bottom) * 0.5;
    const waveAmp = h * preset.waveAmp * 0.45 * Math.min(gainScale, 1.1);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, w, bottom - top);
    ctx.clip();

    ctx.lineWidth = 2;
    ctx.strokeStyle = palette.waveStroke;
    ctx.beginPath();

    for (let i = 0; i < timeData.length; i += 1) {
        const x = (i / (timeData.length - 1)) * w;
        const centered = (timeData[i] - 128) / 128;
        const y = baseline + centered * waveAmp;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.stroke();
    ctx.restore();
}

function drawFeatureBadges(w, h, palette, bands) {

    const features = [
        { label: "LOW", value: bands.low, x: 20 },
        { label: "MID", value: bands.mid, x: 120 },
        { label: "HIGH", value: bands.high, x: 220 }
    ];

    ctx.save();
    features.forEach((item) => {
        const barW = 72;
        const barH = 8;
        ctx.fillStyle = palette.badgeTrack;
        ctx.fillRect(item.x, 20, barW, barH);
        ctx.fillStyle = palette.badgeFill;
        ctx.fillRect(item.x, 20, barW * Math.max(0, Math.min(1, item.value)), barH);

        ctx.fillStyle = palette.labelColor;
        ctx.font = "12px JetBrains Mono";
        ctx.fillText(item.label, item.x, 46);
    });
    ctx.restore();
}

function computeRms(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) {
        const x = (buffer[i] - 128) / 128;
        sum += x * x;
    }
    return Math.sqrt(sum / buffer.length);
}

function bandEnergy(buffer, fromRatio, toRatio) {
    const start = Math.floor(buffer.length * fromRatio);
    const end = Math.max(start + 1, Math.floor(buffer.length * toRatio));
    let sum = 0;
    for (let i = start; i < end; i += 1) {
        sum += buffer[i] / 255;
    }
    return sum / (end - start);
}

function startRender() {
    if (rafId) {
        cancelAnimationFrame(rafId);
    }
    drawFrame();
}

function stopRender() {
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
}

function drawSingleFrameIfReady() {
    if (!analyser || !freqData || !timeData) {
        return;
    }
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    drawFrame();
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
}

function applyDefaults() {
    fftSizeSelect.value = DEFAULTS.fftSize;
    smoothingInput.value = String(DEFAULTS.smoothing);
    gainInput.value = String(DEFAULTS.gain);
    presetSelect.value = DEFAULTS.preset;
    mirrorToggle.checked = DEFAULTS.mirror;
    peakToggle.checked = DEFAULTS.peak;
    spectrumStyleSelect.value = DEFAULTS.spectrumStyle;
    showSpectrogramToggle.checked = DEFAULTS.showSpectrogram;
    trailInput.value = String(DEFAULTS.trail);
    loopToggle.checked = DEFAULTS.loop;
    beatDetectToggle.checked = DEFAULTS.beatDetect;
    beatSensitivityInput.value = String(DEFAULTS.beatSensitivity);
    beatCooldownInput.value = String(DEFAULTS.beatCooldown);
    beatPulseGainInput.value = String(DEFAULTS.beatPulseGain);

    smoothingValue.textContent = (DEFAULTS.smoothing / 100).toFixed(2);
    gainValue.textContent = (DEFAULTS.gain / 100).toFixed(2);
    trailValue.textContent = (DEFAULTS.trail / 100).toFixed(2);
    beatSensitivityValue.textContent = (DEFAULTS.beatSensitivity / 100).toFixed(2);
    beatCooldownValue.textContent = String(DEFAULTS.beatCooldown);
    beatPulseGainValue.textContent = (DEFAULTS.beatPulseGain / 100).toFixed(2);
    audioEl.loop = DEFAULTS.loop;

    beatPulse = 0;
    fluxHistory = [];
    prevFluxBand = null;
    spectrogramScrollCarry = 0;
    spectrogramLastAudioTime = audioEl.currentTime || 0;

    if (analyser) {
        analyser.fftSize = Number(DEFAULTS.fftSize);
        analyser.smoothingTimeConstant = DEFAULTS.smoothing / 100;
        resetDataBuffers();
    }
    if (gainNode) {
        gainNode.gain.value = DEFAULTS.gain / 100;
    }

    drawSingleFrameIfReady();
}

pickFileBtn.addEventListener("click", () => audioFile.click());

audioFile.addEventListener("change", () => {
    const file = audioFile.files && audioFile.files[0];
    if (!file) {
        return;
    }

    const objectUrl = URL.createObjectURL(file);
    audioEl.src = objectUrl;
    fileName.textContent = file.name;
    playBtn.disabled = false;
    stopBtn.disabled = false;
    currentTimeEl.textContent = "00:00";
    totalTimeEl.textContent = "00:00";
});

loopToggle.addEventListener("change", () => {
    audioEl.loop = loopToggle.checked;
});

resetParamsBtn.addEventListener("click", () => {
    applyDefaults();
});

window.addEventListener("keydown", async (event) => {
    if (event.code !== "Space") {
        return;
    }
    if (event.target && (event.target.tagName === "INPUT" || event.target.tagName === "SELECT")) {
        return;
    }
    if (playBtn.disabled) {
        return;
    }
    event.preventDefault();
    playBtn.click();
});

playBtn.addEventListener("click", async () => {
    ensureAudioGraph();
    if (audioCtx.state === "suspended") {
        await audioCtx.resume();
    }

    if (audioEl.paused) {
        await audioEl.play();
    } else {
        audioEl.pause();
    }
});

stopBtn.addEventListener("click", () => {
    audioEl.pause();
    audioEl.currentTime = 0;
    playBtn.textContent = "播放";
});

audioEl.addEventListener("ended", () => {
    playBtn.textContent = "播放";
    stopRender();
});

audioEl.addEventListener("loadedmetadata", () => {
    totalTimeEl.textContent = formatTime(audioEl.duration);
});

audioEl.addEventListener("durationchange", () => {
    totalTimeEl.textContent = formatTime(audioEl.duration);
});

audioEl.addEventListener("timeupdate", () => {
    currentTimeEl.textContent = formatTime(audioEl.currentTime);
});

audioEl.addEventListener("play", async () => {
    ensureAudioGraph();
    if (audioCtx && audioCtx.state === "suspended") {
        await audioCtx.resume();
    }
    playBtn.textContent = "暂停";
    startRender();
});

audioEl.addEventListener("pause", () => {
    playBtn.textContent = "播放";
    stopRender();
});

audioEl.addEventListener("seeking", () => {
    if (!audioEl.paused) {
        stopRender();
    }
});

audioEl.addEventListener("seeked", () => {
    if (audioEl.paused) {
        drawSingleFrameIfReady();
        return;
    }
    startRender();
});

fftSizeSelect.addEventListener("change", () => {
    if (!analyser) {
        return;
    }
    analyser.fftSize = Number(fftSizeSelect.value);
    resetDataBuffers();
});

smoothingInput.addEventListener("input", () => {
    const value = Number(smoothingInput.value) / 100;
    smoothingValue.textContent = value.toFixed(2);
    if (analyser) {
        analyser.smoothingTimeConstant = value;
    }
});

gainInput.addEventListener("input", () => {
    const value = Number(gainInput.value) / 100;
    gainValue.textContent = value.toFixed(2);
    if (gainNode) {
        gainNode.gain.value = value;
    }
});

trailInput.addEventListener("input", () => {
    const value = Number(trailInput.value) / 100;
    trailValue.textContent = value.toFixed(2);
});

beatSensitivityInput.addEventListener("input", () => {
    beatSensitivityValue.textContent = (Number(beatSensitivityInput.value) / 100).toFixed(2);
});

beatCooldownInput.addEventListener("input", () => {
    beatCooldownValue.textContent = String(Number(beatCooldownInput.value));
});

beatPulseGainInput.addEventListener("input", () => {
    beatPulseGainValue.textContent = (Number(beatPulseGainInput.value) / 100).toFixed(2);
});

window.addEventListener("resize", resizeCanvas);

setThemeFromStorage();
bindThemeToggle();
resizeCanvas();
applyDefaults();
