const {
    GM_PROGRAM_NAMES,
    createMidiTrackOrder,
    createPlaybackSource,
    extractMidiMeta: readMidiMeta,
    extractNotes,
    getInstrumentNameFromTrack,
    getOrderedPlayableTracks,
    getTrackProgramInfo,
    midiToNoteName,
    parseMidiGrid
} = window.MidiPlayerCore;

// 作者: YoungSimpleBoy
// 日期: 2026-03-22
// 功能: 一个MIDI播放与可视化组件
// ==================== 配置 ====================
function getDefaultCanvasSize() {
    const wrapper = document.getElementById('canvasWrapper');
    const wrapperWidth = wrapper?.clientWidth || wrapper?.getBoundingClientRect().width || 0;
    const bodyStyle = window.getComputedStyle(document.body);
    const bodyPaddingX =
        parseFloat(bodyStyle.paddingLeft || '0') +
        parseFloat(bodyStyle.paddingRight || '0');
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const availableWidth = Math.max(320, viewportWidth - bodyPaddingX);
    const width = Math.min(1440, Math.floor(wrapperWidth || availableWidth));
    const height = window.innerWidth <= 768 ? width * 1.0 : 720;
    return { width, height };
}

let { width: WIDTH, height: HEIGHT } = getDefaultCanvasSize();
const DEFAULT_SPEED = 200;       // 默认速度：像素/秒
let SPEED = DEFAULT_SPEED;       // 速度：像素/秒（可调节）
const THICKNESS = 8;   // 音符厚度
const MARGIN = 20;      // 边距
const FADE_TIME = 3.3;       // 音符淡出时间（秒）
const MAX_CANVAS_PIXEL_RATIO = 2;
const VISUAL_CLOCK_SNAP_THRESHOLD = 0.18;
const VISUAL_CLOCK_BACKWARD_SNAP_THRESHOLD = 0.75;
const VISUAL_CLOCK_MAX_FRAME_DELTA = 0.1;
const VISUAL_CLOCK_CORRECTION_FACTOR = 0.18;
const PROGRESS_UI_INTERVAL_MS = 1000;
const DESKTOP_SIMPLIFIED_NOTE_THRESHOLD = 620;
const MOBILE_SIMPLIFIED_NOTE_THRESHOLD = 180;
const LOW_SPEED_SIMPLIFIED_THRESHOLD = 420;
const MOBILE_LOW_SPEED_SIMPLIFIED_THRESHOLD = 110;

// ==================== DOM ====================
const canvas = document.getElementById('canvas');
const canvasWrapper = document.getElementById('canvasWrapper');
const canvasFsBtn = document.getElementById('canvasFsBtn');
const ctx = canvas.getContext('2d');
const fileInput = document.getElementById('fileInput');
const playBtn = document.getElementById('playBtn');
const loopBtn = document.getElementById('loopBtn');
const exampleSelect = document.getElementById('exampleSelect');
const playbackRateSlider = document.getElementById('playbackRateSlider');
const playbackRateValue = document.getElementById('playbackRateValue');
const audioEngineSelect = document.getElementById('audioEngineSelect');
const audioEngineState = document.getElementById('audioEngineState');
const statusEl = document.getElementById('status');
const themeToggle = document.getElementById('themeToggle');

let canvasPixelRatio = 1;
let visualBackgroundCache = null;

function getFadeInDistance() {
    return WIDTH;
}

function getCanvasPixelRatio() {
    const ratio = window.devicePixelRatio || 1;
    return Math.max(1, Math.min(MAX_CANVAS_PIXEL_RATIO, ratio));
}

function applyCanvasResolution() {
    canvasPixelRatio = getCanvasPixelRatio();
    canvas.width = Math.round(WIDTH * canvasPixelRatio);
    canvas.height = Math.round(HEIGHT * canvasPixelRatio);
    canvas.style.width = `${WIDTH}px`;
    canvas.style.height = `${HEIGHT}px`;
    ctx.setTransform(canvasPixelRatio, 0, 0, canvasPixelRatio, 0, 0);
    visualBackgroundCache = null;
}

applyCanvasResolution();

// ==================== 主题切换 ====================
function isLightTheme() {
    return document.documentElement.classList.contains('light');
}

function toggleTheme() {
    const isLight = document.documentElement.classList.toggle('light');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    // 切换主题时重绘
    drawFrame(currentTime);
}

function initTheme() {
    // 优先读取本地存储
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.classList.toggle('light', savedTheme === 'light');
    } else {
        // 检测系统主题
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('light', !prefersDark);
    }

    // 监听系统主题变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
            document.documentElement.classList.toggle('light', !e.matches);
            drawFrame(currentTime);
        }
    });
}

if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
}

function resizeCanvas(width, height) {
    WIDTH = Math.max(320, Math.round(width));
    HEIGHT = Math.max(240, Math.round(height));
    applyCanvasResolution();

    if (!isPlaying) {
        drawFrame(currentTime);
    }
}

function updateCanvasSizeForCurrentMode() {
    if (document.fullscreenElement === canvasWrapper && canvasWrapper) {
        const rect = canvasWrapper.getBoundingClientRect();
        resizeCanvas(rect.width, rect.height);
        return;
    }

    const defaultSize = getDefaultCanvasSize();
    resizeCanvas(defaultSize.width, defaultSize.height);
}

async function toggleCanvasFullscreen() {
    if (!canvasWrapper) return;

    try {
        if (document.fullscreenElement === canvasWrapper) {
            await document.exitFullscreen();
        } else {
            await canvasWrapper.requestFullscreen();
        }
    } catch (err) {
        statusEl.textContent = `全屏切换失败: ${err.message}`;
    }
}

if (canvasFsBtn) {
    canvasFsBtn.addEventListener('click', toggleCanvasFullscreen);
}

document.addEventListener('fullscreenchange', () => {
    const isFullscreen = document.fullscreenElement === canvasWrapper;
    if (canvasWrapper) {
        canvasWrapper.classList.toggle('fullscreen', isFullscreen);
    }
    if (canvasFsBtn) {
        canvasFsBtn.textContent = isFullscreen ? '×' : '⛶';
    }
    updateCanvasSizeForCurrentMode();
});

window.addEventListener('resize', () => {
    updateCanvasSizeForCurrentMode();
});

// ==================== 瀑布流方向控制 ====================
let flowDirection = 'horizontal'; // 默认水平

const directionButtons = document.querySelectorAll('.direction-btn');

function setFlowDirection(direction) {
    flowDirection = direction;
    directionButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.direction === direction);
    });
    if (!isPlaying && typeof currentTime !== 'undefined') {
        drawFrame(currentTime);
    }
}

if (directionButtons.length > 0) {
    directionButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const nextDirection = btn.dataset.direction;
            if (nextDirection) {
                setFlowDirection(nextDirection);
            }
        });
    });

    // 初始化按钮激活态，避免在状态变量初始化前调用 setFlowDirection
    directionButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.direction === flowDirection);
    });
}

// 新增：垂直模式下的音高 -> X坐标映射（低音在左，高音在右）
function midiToX(midi) {
    const range = window.midiRange || { min: 48, max: 84 };
    const availableWidth = WIDTH - 2 * MARGIN;
    const normalized = (midi - range.min) / (range.max - range.min);
    return MARGIN + normalized * availableWidth;
}

// ==================== 状态 ====================
let notes = [];
let gridLines = []; // 新增：用于存储基于 Tick 解析好的小节线
let maxNoteDuration = 0;
let isPlaying = false;
let currentTime = 0;
let totalDuration = 0;
let isDraggingProgress = false;
let isLoopEnabled = false;
let visualClockState = {
    initialized: false,
    time: 0,
    lastFrameMs: 0
};
let lastProgressUiUpdateMs = 0;
let lastRenderedCurrentTimeText = '';
let lastRenderedTotalTimeText = '';
let lastRenderedProgressValue = -1;

// ==================== 音轨控制 ====================
const trackHues = [200, 280, 120, 30, 320, 60]; // 音轨颜色
let trackInfo = []; // 存储音轨信息: {name, noteCount, enabled, hue, minMidi, maxMidi}

function lowerBoundByTime(items, target, getTime) {
    let low = 0;
    let high = items.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (getTime(items[middle]) < target) low = middle + 1;
        else high = middle;
    }
    return low;
}

function upperBoundByTime(items, target, getTime) {
    let low = 0;
    let high = items.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (getTime(items[middle]) <= target) low = middle + 1;
        else high = middle;
    }
    return low;
}

function getVisibleGridWindow(now, isHorizontal, hitX, hitY) {
    if (gridLines.length === 0) return { start: 0, end: 0 };

    const startTime = isHorizontal
        ? now + (-20 - hitX) / SPEED
        : now + (hitY - (HEIGHT + 20)) / SPEED;
    const endTime = isHorizontal
        ? now + (WIDTH + 20 - hitX) / SPEED
        : now + (hitY + 20) / SPEED;

    return {
        start: lowerBoundByTime(gridLines, startTime, line => line.time),
        end: upperBoundByTime(gridLines, endTime, line => line.time)
    };
}

function getVisibleNoteWindow(now, isHorizontal, hitX, hitY) {
    if (notes.length === 0) return { start: 0, end: 0 };

    const fadeInDistance = getFadeInDistance();
    const latestStart = isHorizontal
        ? now + (WIDTH + fadeInDistance - hitX) / SPEED
        : now + (hitY + fadeInDistance) / SPEED;
    const earliestEnd = now - FADE_TIME;
    const earliestStart = earliestEnd - maxNoteDuration;

    return {
        start: lowerBoundByTime(notes, earliestStart, note => note.time),
        end: upperBoundByTime(notes, latestStart, note => note.time)
    };
}
let midiMeta = null; // 存储文件级别的元信息

function extractMidiMeta(midi, fileName) {
    midiMeta = readMidiMeta(midi, fileName);
    updateMidiInfo();
}

function updateMidiInfo() {
    const midiInfoEl = document.getElementById('midiInfo');
    if (!midiMeta) {
        midiInfoEl.innerHTML = '<span class="midi-info-empty">加载 MIDI 文件后显示文件信息</span>';
        return;
    }

    midiInfoEl.innerHTML = `
        <svg class="midi-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
        </svg>
        <span class="midi-filename">${midiMeta.fileName}</span>
        <span class="midi-divider">|</span>
        <span class="midi-meta">${midiMeta.timeSig}</span>
        <span class="midi-divider">|</span>
        <span class="midi-meta">${midiMeta.bpm} BPM</span>
        <span class="midi-divider">|</span>
        <span class="midi-meta">${midiMeta.keySig} 大调</span>
        <span class="midi-divider">|</span>
        <span class="midi-meta">${midiMeta.totalNotes} 个音符</span>
    `;
}

function getTrackAutoLabel(track) {
    if (track.isPercussion) {
        return '自动（MIDI）: Standard Drum Kit';
    }
    if (typeof track.gmProgram === 'number' && GM_PROGRAM_NAMES[track.gmProgram]) {
        return `自动（MIDI）: GM ${track.gmProgram + 1} ${GM_PROGRAM_NAMES[track.gmProgram]}`;
    }
    return '自动（MIDI）: 默认音色';
}

function buildTrackInstrumentOptions(track) {
    const sampleOptions = [
        { value: 'piano', label: '钢琴' },
        { value: 'violin', label: '小提琴' },
        { value: 'viola', label: '中提琴' },
        { value: 'cello', label: '大提琴' },
        { value: 'piccolo', label: '短笛' },
        { value: 'flute', label: '长笛' },
        { value: 'acoustic_guitar', label: '吉他' },
        { value: 'music_box', label: '八音盒' },
        { value: 'shamisen', label: '三味线' },
        { value: 'voice', label: '人声' }
    ];

    const synthOptions = [
        { value: 'default', label: '正弦合成器' },
        { value: 'fm', label: 'FM 电钢琴' },
        { value: 'am', label: 'AM 复古' },
        { value: 'fat', label: '胖锯齿波' }
    ];

    const autoHtml = `<option value="midi_auto">${getTrackAutoLabel(track)}</option>`;
    const sampleHtml = sampleOptions.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
    const synthHtml = synthOptions.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');

    let gmHtml = '';
    if (isGmLibraryExpanded) {
        const gmItems = GM_PROGRAM_NAMES.map((name, idx) => {
            return `<option value="gm:${idx}">GM ${idx + 1}: ${name}</option>`;
        }).join('');
        gmHtml = `<optgroup label="GM 标准音色">${gmItems}</optgroup>`;
    } else if (typeof track.instrument === 'string' && track.instrument.startsWith('gm:')) {
        const gmIndex = parseInt(track.instrument.slice(3), 10);
        if (!Number.isNaN(gmIndex) && gmIndex >= 0 && gmIndex < GM_PROGRAM_NAMES.length) {
            gmHtml = `<optgroup label="GM 标准音色（已折叠）"><option value="gm:${gmIndex}">当前: GM ${gmIndex + 1}: ${GM_PROGRAM_NAMES[gmIndex]}</option></optgroup>`;
        }
    }

    return `${autoHtml}<optgroup label="采样音色（需加载）">${sampleHtml}</optgroup><optgroup label="合成器音色">${synthHtml}</optgroup>${gmHtml}`;
}

function initTrackPanel() {
    const trackPanel = document.getElementById('trackPanel');
    const trackList = document.getElementById('trackList');
    const oldToolbar = trackPanel.querySelector('.track-instrument-toolbar');
    if (oldToolbar) {
        oldToolbar.remove();
    }

    if (trackInfo.length === 0) {
        trackList.innerHTML = '<p class="track-empty">加载 MIDI 文件后显示音轨信息</p>';
        return;
    }

    trackList.innerHTML = '';

    const toolbarEl = document.createElement('div');
    toolbarEl.className = 'track-instrument-toolbar';
    toolbarEl.innerHTML = `
        <button type="button" class="gm-library-toggle-btn">${isGmLibraryExpanded ? '收起 GM 音色库' : '展开 GM 音色库'}</button>
        <span class="gm-library-tip">采样/合成器已分类，GM 列表可折叠</span>
    `;
    const gmToggleBtn = toolbarEl.querySelector('.gm-library-toggle-btn');
    gmToggleBtn.addEventListener('click', () => {
        isGmLibraryExpanded = !isGmLibraryExpanded;
        initTrackPanel();
    });
    trackPanel.insertBefore(toolbarEl, trackList);

    trackInfo.forEach((track, index) => {
        const trackEl = document.createElement('div');
        trackEl.className = 'track-item';
        trackEl.innerHTML = `
            <label class="track-toggle">
                <input type="checkbox" data-track="${index}" ${track.enabled ? 'checked' : ''}>
                <span class="track-checkbox" style="--track-hue: ${track.hue}"></span>
            </label>
            <span class="track-name" style="--track-hue: ${track.hue}">${track.name}</span>
            <span class="track-instrument-name" style="margin-left:4px;color:#888;font-size:13px;">${track.instrumentName ? '（' + track.instrumentName + '）' : ''}</span>
            <span class="track-sep">-</span>
            <span class="track-notes">${track.noteCount}个</span>
            <span class="track-sep">-</span>
            <span class="track-range">${track.noteRange}</span>
            <select class="track-instrument-select" data-track="${index}">
                ${buildTrackInstrumentOptions(track)}
            </select>
            <span class="track-sep">-</span>
            <input type="range" class="track-volume-slider" data-track="${index}" 
                min="0" max="2" step="0.05" value="${track.volume}" 
                style="--track-hue: ${track.hue}" title="调整音轨音量">
        `;
        // 绑定选择器事件
        const instSelect = trackEl.querySelector('.track-instrument-select');
        instSelect.value = track.instrument; // 设置初始值
        instSelect.addEventListener('change', async (e) => {
            const trackIndex = parseInt(e.target.dataset.track);
            const selectedType = e.target.value;
            trackInfo[trackIndex].instrument = selectedType;

            const resolvedType = audioEngine.resolveTrackInstrumentType(trackInfo[trackIndex]);
            if (resolvedType) {
                statusEl.textContent = `加载音轨音色中...`;
                await audioEngine.getInstrument(resolvedType);
                statusEl.textContent = `音轨 ${trackInfo[trackIndex].name} 音色就绪`;
            }
        });
        // 监听静音切换
        const checkbox = trackEl.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => {
            const trackIndex = parseInt(e.target.dataset.track);
            trackInfo[trackIndex].enabled = e.target.checked;
            if (!isPlaying) {
                drawFrame(currentTime);
            }
        });
        // 监听音量滑动
        const volumeSlider = trackEl.querySelector('.track-volume-slider');
        volumeSlider.addEventListener('input', (e) => {
            const trackIndex = parseInt(e.target.dataset.track);
            trackInfo[trackIndex].volume = parseFloat(e.target.value);
        });

        trackList.appendChild(trackEl);
    });
}

function extractTrackInfo(midi, trackOrder = null) {
    trackInfo = [];
    let trackIndex = 0;

    getOrderedPlayableTracks(midi, trackOrder).forEach(({ track, index: sourceTrackIndex }) => {
        // 获取音轨名称，优先解码二进制，保留中文
        let name = '';
        if (track.name) {
            // 多编码尝试，优先显示含中文的最长解码结果
            let candidates = [];
            let bytes = null;
            if (typeof track.name === 'string') {
                candidates.push(track.name);
                let arr = [];
                for (let i = 0; i < track.name.length; i++) {
                    arr.push(track.name.charCodeAt(i) & 0xFF);
                }
                bytes = new Uint8Array(arr);
            } else if (track.name instanceof Uint8Array) {
                bytes = track.name;
            } else if (track.name instanceof ArrayBuffer) {
                bytes = new Uint8Array(track.name);
            } else if (Array.isArray(track.name)) {
                bytes = new Uint8Array(track.name);
            }
            if (bytes) {
                try {
                    const decoder = new TextDecoder('utf-8');
                    candidates.push(decoder.decode(bytes));
                } catch {}
                try {
                    candidates.push(window.Encoding.convert(bytes, {to:'UNICODE',type:'string'}));
                } catch {}
                try {
                    candidates.push(window.Encoding.convert(bytes, {to:'UNICODE',type:'string',from:'BIG5'}));
                } catch {}
            }
            let best = '';
            let maxLen = 0;
            for (const s of candidates) {
                if (!s) continue;
                let cleaned = s.replace(/[\x00\u0000\0]/g, '').trim();
                if (/[\u4e00-\u9fa5]/.test(cleaned) && cleaned.length > maxLen) {
                    best = cleaned;
                    maxLen = cleaned.length;
                } else if (!best && cleaned.length > maxLen) {
                    best = cleaned;
                    maxLen = cleaned.length;
                }
            }
            name = best;
        }
        if (!name || name === '') {
            name = `音轨 ${trackIndex + 1}`;
        }
        const trackProgramInfo = getTrackProgramInfo(track, midi);
        // 稳健提取乐器名：优先 @tonejs/midi 的 instrument.name，其次 program 映射
        const instrumentName = getInstrumentNameFromTrack(track, midi);
        // 不再拼接乐器名到name，乐器名单独存储
        if (name.length > 20) {
            name = name.substring(0, 17) + '...';
        }
        // 计算音轨音域
        let minMidi = 127, maxMidi = 0;
        track.notes.forEach(note => {
            if (note.midi < minMidi) minMidi = note.midi;
            if (note.midi > maxMidi) maxMidi = note.midi;
        });
        const noteRange = `${midiToNoteName(minMidi)} - ${midiToNoteName(maxMidi)}`;

        trackInfo.push({
            name: name,
            instrumentName: instrumentName || '',
            noteCount: track.notes.length,
            noteRange: noteRange, // 占位
            enabled: true,
            volume: 1.0,
            instrument: 'midi_auto', // 默认自动按 MIDI Program 分配
            gmProgram: trackProgramInfo.program,
            isPercussion: trackProgramInfo.isPercussion,
            sourceTrackIndex,
            midiChannel: track.notes[0]?.channel ?? null,
            hue: trackHues[trackIndex % trackHues.length]
        });
        trackIndex++;
    });

    initTrackPanel();
}

// ==================== 小节线 ====================
const infoToggle = document.getElementById('infoToggle');
infoToggle.addEventListener('change', (e) => {
    targetExtraInfoAlpha = e.target.checked ? 1 : 0;
    if (!isPlaying) {
        animateTransition();
    }
});
function animateTransition() {
    if (Math.abs(currentExtraInfoAlpha - targetExtraInfoAlpha) > 0.01) {
        drawFrame(currentTime); // 触发重绘
        requestAnimationFrame(animateTransition);
    } else {
        currentExtraInfoAlpha = targetExtraInfoAlpha; // 强制归位
        drawFrame(currentTime);
    }
}
let targetExtraInfoAlpha = 1;  // 目标透明度 (0 或 1)
let currentExtraInfoAlpha = 1; // 当前渲染使用的透明度 (0.0 到 1.0 之间)
const FADE_SPEED = 0.05;       // 渐变速度，数值越大过渡越快

// ==================== 音频 ====================
let playbackRate = 1;
let isGmLibraryExpanded = false;
const SOUNDFONT_STORAGE_KEY = 'midiPlayerSoundFontUrl';
const FLUIDSYNTH_SOUNDFONTS = [
    {
        optionValue: 'fluidsynth-arachno',
        url: 'soundfonts/Arachno.sf2',
        label: 'Arachno SoundFont',
        shortLabel: 'Arachno SF2'
    },
    {
        optionValue: 'fluidsynth-generaluser',
        url: 'soundfonts/GeneralUser-GS.sf2',
        label: 'GeneralUser GS',
        shortLabel: 'GeneralUser GS'
    }
];

function getSavedSoundFontUrl() {
    try {
        const savedUrl = localStorage.getItem(SOUNDFONT_STORAGE_KEY);
        if (FLUIDSYNTH_SOUNDFONTS.some(item => item.url === savedUrl)) {
            return savedUrl;
        }
    } catch (error) {
        console.warn('读取 SoundFont 选择失败:', error);
    }
    return FLUIDSYNTH_SOUNDFONTS[0].url;
}

let currentFluidSynthSoundFontUrl = getSavedSoundFontUrl();

function getSoundFontByUrl(url) {
    return FLUIDSYNTH_SOUNDFONTS.find(item => item.url === url) || FLUIDSYNTH_SOUNDFONTS[0];
}

function parseAudioEngineSelection(value = audioEngineSelect?.value || 'tone') {
    if (value === 'tone') {
        return {
            engineName: 'tone',
            soundFontUrl: currentFluidSynthSoundFontUrl
        };
    }

    const soundFont = FLUIDSYNTH_SOUNDFONTS.find(item => item.optionValue === value) ||
        getSoundFontByUrl(currentFluidSynthSoundFontUrl);
    return {
        engineName: 'fluidsynth',
        soundFontUrl: soundFont.url
    };
}

function getAudioEngineSelectionValue(engineName = audioEngine.getActiveName()) {
    if (engineName !== 'fluidsynth') return 'tone';
    return getSoundFontByUrl(currentFluidSynthSoundFontUrl).optionValue;
}

function getSelectedSoundFontUrl() {
    return parseAudioEngineSelection().soundFontUrl;
}

function getSoundFontLabel(url = getSelectedSoundFontUrl(), key = 'shortLabel') {
    const soundFont = getSoundFontByUrl(url);
    return soundFont?.[key] || soundFont?.label || '自定义 SoundFont';
}

function getFluidSynthSoundFontUrls(soundFontUrl = getSelectedSoundFontUrl()) {
    const selectedUrl = soundFontUrl;
    return [
        selectedUrl,
        ...FLUIDSYNTH_SOUNDFONTS
            .map(item => item.url)
            .filter(url => url !== selectedUrl)
    ];
}

function getFluidSynthEngineOptions(soundFontUrl = getSelectedSoundFontUrl()) {
    return {
        soundFontUrls: getFluidSynthSoundFontUrls(soundFontUrl)
    };
}

function saveSoundFontSelection(url) {
    try {
        localStorage.setItem(SOUNDFONT_STORAGE_KEY, url);
    } catch (error) {
        console.warn('保存 SoundFont 选择失败:', error);
    }
}

const audioEngine = window.MidiPlayerAudio.createController({
    initial: 'tone',
    engineOptions: {
        tone: {
            onStatus(message) {
                statusEl.textContent = message;
            }
        },
        fluidsynth: {
            ...getFluidSynthEngineOptions(),
            onStatus(message) {
                statusEl.textContent = message;
                if (audioEngineState) audioEngineState.textContent = message;
            }
        }
    }
});

function updatePlayButtonIcon(playing) {
    document.getElementById('playIcon').innerHTML = playing
        ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'
        : '<polygon points="5,3 19,12 5,21"/>';
}

async function switchAudioEngine(selectionValue) {
    if (!audioEngineSelect) return;

    const selection = parseAudioEngineSelection(selectionValue);
    const engineName = selection.engineName;
    const soundFontUrl = selection.soundFontUrl;
    const soundFontChanged =
        engineName === 'fluidsynth' &&
        soundFontUrl !== currentFluidSynthSoundFontUrl;
    if (engineName === audioEngine.getActiveName() && !soundFontChanged) return;

    const previousName = audioEngine.getActiveName();
    const resumePosition = currentTime;
    const wasPlaying = isPlaying;
    audioEngineSelect.disabled = true;
    playBtn.disabled = true;

    if (wasPlaying) {
        currentTime = audioEngine.pause();
        isPlaying = false;
        updatePlayButtonIcon(false);
    }

    try {
        if (engineName === 'fluidsynth') {
            saveSoundFontSelection(soundFontUrl);
            await audioEngine.configureEngine(
                'fluidsynth',
                getFluidSynthEngineOptions(soundFontUrl)
            );
            currentFluidSynthSoundFontUrl = soundFontUrl;
        }

        const soundFontLabel = getSoundFontLabel(soundFontUrl);
        statusEl.textContent = engineName === 'fluidsynth'
            ? `正在准备 FluidSynth 高质量模式（${soundFontLabel}）...`
            : '正在切换至 Tone.js 快速模式...';
        if (audioEngineState) audioEngineState.textContent = '切换中...';

        await audioEngine.switchTo(engineName);
        audioEngine.load(notes, trackInfo);
        await audioEngine.preloadTracks(trackInfo);
        currentTime = audioEngine.seek(resumePosition);
        resetVisualClock(currentTime);
        if (audioEngineState) {
            audioEngineState.textContent = engineName === 'fluidsynth'
                ? soundFontLabel
                : '即开即用';
        }
        statusEl.textContent = engineName === 'fluidsynth'
            ? `已切换至 FluidSynth 高质量模式（${soundFontLabel}）`
            : '已切换至 Tone.js 快速模式';

        if (wasPlaying) await startPlay();
    } catch (error) {
        console.error('音频引擎切换失败:', error);
        await audioEngine.switchTo(previousName === 'fluidsynth' ? 'tone' : previousName);
        audioEngine.load(notes, trackInfo);
        currentTime = audioEngine.seek(resumePosition);
        resetVisualClock(currentTime);
        audioEngineSelect.value = getAudioEngineSelectionValue(audioEngine.getActiveName());
        if (audioEngineState) audioEngineState.textContent = '已回退快速模式';
        statusEl.textContent = `高质量引擎加载失败，已回退 Tone.js：${error.message}`;

        if (wasPlaying) await startPlay();
    } finally {
        audioEngineSelect.disabled = false;
        playBtn.disabled = notes.length === 0;
    }
}

if (audioEngineSelect) {
    audioEngineSelect.addEventListener('change', event => {
        switchAudioEngine(event.target.value);
    });
}

function applyPlaybackRate() {
    if (playbackRateValue) {
        const rateText = Number.isInteger(playbackRate) ? playbackRate.toFixed(1) : playbackRate.toString();
        playbackRateValue.textContent = `×${rateText}`;
    }

    currentTime = audioEngine.setPlaybackRate(playbackRate);
    resetVisualClock(currentTime);
}

if (playbackRateSlider) {
    const initialRate = parseFloat(playbackRateSlider.value);
    playbackRate = Number.isFinite(initialRate) && initialRate > 0 ? initialRate : 1;

    playbackRateSlider.addEventListener('input', (e) => {
        const rate = parseFloat(e.target.value);
        playbackRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
        applyPlaybackRate();
    });

    playbackRateSlider.addEventListener('change', () => {
        statusEl.textContent = `播放速度已设置为 ×${playbackRate}`;
    });
}
applyPlaybackRate();
updateLoopButtonUI();

if (loopBtn) {
    loopBtn.addEventListener('click', () => {
        isLoopEnabled = !isLoopEnabled;
        updateLoopButtonUI();
        audioEngine.setLoopEnabled(isLoopEnabled);
    });
}

// ==================== 音量控制 ====================
const volumeSlider = document.getElementById('volumeSlider');
const volumeValue = document.getElementById('volumeValue');

function updateVolume() {
    const dbValue = parseFloat(volumeSlider.value);
    audioEngine.setVolume(dbValue);
    volumeValue.textContent = dbValue + ' dB';
}

volumeSlider.addEventListener('input', updateVolume);
updateVolume(); // 初始化音量

// ==================== 速度控制 ====================
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');

speedSlider.addEventListener('input', () => {
    SPEED = parseInt(speedSlider.value);
    speedValue.textContent = SPEED;
});

// ==================== 进度条控制 ====================
const progressSlider = document.getElementById('progressSlider');
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl = document.getElementById('totalTime');

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getFrameTimestamp(frameMs = performance.now()) {
    return Number.isFinite(frameMs) ? frameMs : performance.now();
}

function resetVisualClock(time = currentTime, frameMs = performance.now()) {
    visualClockState.initialized = true;
    visualClockState.time = Math.max(0, time || 0);
    visualClockState.lastFrameMs = getFrameTimestamp(frameMs);
}

function clearVisualClock() {
    visualClockState.initialized = false;
    visualClockState.time = 0;
    visualClockState.lastFrameMs = 0;
}

function getSmoothedPlaybackTime(audioTime, frameMs = performance.now()) {
    const safeAudioTime = Math.max(0, Math.min(totalDuration || Infinity, audioTime || 0));
    const timestamp = getFrameTimestamp(frameMs);

    if (!visualClockState.initialized) {
        resetVisualClock(safeAudioTime, timestamp);
        return safeAudioTime;
    }

    const frameDelta = Math.max(
        0,
        Math.min(VISUAL_CLOCK_MAX_FRAME_DELTA, (timestamp - visualClockState.lastFrameMs) / 1000)
    );
    visualClockState.lastFrameMs = timestamp;

    const predictedTime = visualClockState.time + frameDelta * playbackRate;
    const drift = safeAudioTime - predictedTime;
    const movedFarBackward = safeAudioTime < visualClockState.time - VISUAL_CLOCK_BACKWARD_SNAP_THRESHOLD;

    if (movedFarBackward || drift > VISUAL_CLOCK_SNAP_THRESHOLD) {
        visualClockState.time = safeAudioTime;
        return safeAudioTime;
    }

    const maxCorrection = Math.max(0.004, frameDelta * 0.55);
    const correction = Math.max(
        -maxCorrection,
        Math.min(maxCorrection, drift * VISUAL_CLOCK_CORRECTION_FACTOR)
    );
    visualClockState.time = Math.min(
        totalDuration || Infinity,
        Math.max(visualClockState.time, predictedTime + correction)
    );
    return visualClockState.time;
}

function updateProgressUI(force = false) {
    const timestamp = performance.now();
    if (
        !force &&
        isPlaying &&
        timestamp - lastProgressUiUpdateMs < PROGRESS_UI_INTERVAL_MS
    ) {
        return;
    }
    lastProgressUiUpdateMs = timestamp;

    if (totalDuration > 0) {
        const progress = (currentTime / totalDuration) * 100;
        const roundedProgress = Math.round(progress * 10) / 10;
        if (!isDraggingProgress && (force || Math.abs(roundedProgress - lastRenderedProgressValue) >= 0.1)) {
            progressSlider.value = progress;
            lastRenderedProgressValue = roundedProgress;
        }

        const currentText = formatTime(currentTime);
        const totalText = formatTime(totalDuration);
        if (force || currentText !== lastRenderedCurrentTimeText) {
            currentTimeEl.textContent = currentText;
            lastRenderedCurrentTimeText = currentText;
        }
        if (force || totalText !== lastRenderedTotalTimeText) {
            totalTimeEl.textContent = totalText;
            lastRenderedTotalTimeText = totalText;
        }
    } else {
        if (!isDraggingProgress) {
            progressSlider.value = 0;
            lastRenderedProgressValue = 0;
        }
        if (force || lastRenderedCurrentTimeText !== '0:00') {
            currentTimeEl.textContent = '0:00';
            lastRenderedCurrentTimeText = '0:00';
        }
        if (force || lastRenderedTotalTimeText !== '0:00') {
            totalTimeEl.textContent = '0:00';
            lastRenderedTotalTimeText = '0:00';
        }
    }
}

function updateLoopButtonUI() {
    if (!loopBtn) return;
    loopBtn.classList.toggle('active', isLoopEnabled);
    loopBtn.setAttribute('aria-pressed', isLoopEnabled ? 'true' : 'false');
    loopBtn.title = isLoopEnabled ? '循环播放：开启' : '循环播放：关闭';
}

// 拖动进度条开始
progressSlider.addEventListener('mousedown', () => isDraggingProgress = true);
progressSlider.addEventListener('touchstart', () => isDraggingProgress = true, { passive: true });

// 拖动进度条结束
function handleSeekEnd() {
    if (notes.length > 0 && gridLines.length > 0) {
        const percent = parseFloat(progressSlider.value);
        const rawSeekTime = (percent / 100) * totalDuration;

        let snappedTime = gridLines
            .filter(line => line.isMeasure)
            .reduce((prev, curr) => {
                return (Math.abs(curr.time - rawSeekTime) < Math.abs(prev.time - rawSeekTime) ? curr : prev);
            }).time;

        currentTime = snappedTime;
        progressSlider.value = (currentTime / totalDuration) * 100;
        audioEngine.seek(currentTime);
        resetVisualClock(currentTime);

        if (!isPlaying) {
            drawFrame(currentTime);
        }
    }
    isDraggingProgress = false;
    updateProgressUI(true);
}

progressSlider.addEventListener('mouseup', handleSeekEnd);
// 添加手机端触摸结束事件
progressSlider.addEventListener('touchend', handleSeekEnd);

// ==================== 工具：停止并清理 ====================
function resetPlaybackState(resetToStart = true) {
    isPlaying = false;
    audioEngine.stop(resetToStart);
    if (resetToStart) {
        currentTime = 0;
    }
    clearVisualClock();
    updatePlayButtonIcon(false);
    updateProgressUI(true);
}

function clearLoadedMidiData() {
    notes = [];
    gridLines = [];
    maxNoteDuration = 0;
    totalDuration = 0;
    currentTime = 0;
    clearVisualClock();
    playBtn.disabled = true;
    // 清除音轨信息和文件元信息
    trackInfo = [];
    midiMeta = null;
    audioEngine.load(notes, trackInfo, null);
    updateMidiInfo();
    initTrackPanel();
    updateProgressUI();
    drawFrame(0);
}

function stopAndClear() {
    resetPlaybackState(true);
    clearLoadedMidiData();
}

async function applyLoadedMidi(midi, arrayBuffer, fileName, statusName = fileName) {
    const trackOrder = createMidiTrackOrder(midi, arrayBuffer);
    gridLines = parseMidiGrid(midi);
    extractMidiMeta(midi, fileName);
    extractTrackInfo(midi, trackOrder);

    const parsed = extractNotes(midi, trackOrder);
    notes = parsed.notes;
    maxNoteDuration = notes.reduce(
        (max, note) => Math.max(max, note.duration || 0),
        0
    );
    totalDuration = parsed.duration;
    window.midiRange = parsed.range;
    audioEngine.load(notes, trackInfo, createPlaybackSource(midi, arrayBuffer, trackOrder));
    let loadStatus = `已加载: ${statusName} (${notes.length} 个音符)`;
    try {
        await audioEngine.preloadTracks(trackInfo);
    } catch (error) {
        if (audioEngine.getActiveName() !== 'fluidsynth') throw error;

        console.error('FluidSynth 初始化失败:', error);
        await audioEngine.switchTo('tone');
        audioEngine.load(notes, trackInfo);
        await audioEngine.preloadTracks(trackInfo);
        if (audioEngineSelect) audioEngineSelect.value = 'tone';
        if (audioEngineState) audioEngineState.textContent = '已回退快速模式';
        loadStatus += `；高质量引擎加载失败，已回退 Tone.js：${error.message}`;
    }

    playBtn.disabled = notes.length === 0;
    statusEl.textContent = loadStatus;
    clearVisualClock();
    updateProgressUI(true);
    drawFrame(0);
}

// ==================== 加载 MIDI ====================
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    stopAndClear();
    statusEl.textContent = '正在加载...';

    try {
        const buffer = await file.arrayBuffer();
        const midi = new Midi(buffer);
        await applyLoadedMidi(midi, buffer, file.name);
    } catch (err) {
        console.error('加载失败:', err);
        statusEl.textContent = '加载失败: ' + err.message;
    }
});

// ==================== 加载示例 MIDI ====================
async function loadExampleMidi(filePath) {
    if (!filePath) return;

    stopAndClear();
    statusEl.textContent = '正在加载示例...';

    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error('文件不存在');
        const buffer = await response.arrayBuffer();
        const midi = new Midi(buffer);
        const fileName = filePath.split('/').pop();
        await applyLoadedMidi(midi, buffer, fileName, filePath);
    } catch (err) {
        console.error('加载失败:', err);
        statusEl.textContent = '加载示例失败: ' + err.message;
    }
}

// 示例选择器事件
exampleSelect.addEventListener('change', (e) => {
    if (e.target.value) {
        loadExampleMidi(e.target.value);
    }
});

// ==================== 播放控制 ====================
async function startPlay() {
    if (notes.length === 0) return;

    if (totalDuration > 0 && currentTime >= totalDuration - 0.02) {
        currentTime = 0;
        audioEngine.seek(0);
        resetVisualClock(0);
        updateProgressUI(true);
    }

    applyPlaybackRate();
    const startOffset = currentTime;
    const playbackOptions = {
        loop: isLoopEnabled,
        onLoop() {
            currentTime = 0;
            resetVisualClock(0);
        },
        onEnded() {
            finishPlayAtEnd();
        }
    };

    try {
        await audioEngine.play(startOffset, playbackOptions);
    } catch (error) {
        if (audioEngine.getActiveName() !== 'fluidsynth') throw error;

        console.error('FluidSynth 播放启动失败:', error);
        await audioEngine.switchTo('tone');
        audioEngine.load(notes, trackInfo);
        currentTime = audioEngine.seek(startOffset);
        resetVisualClock(currentTime);
        if (audioEngineSelect) audioEngineSelect.value = 'tone';
        if (audioEngineState) audioEngineState.textContent = '已回退快速模式';
        statusEl.textContent = `FluidSynth 启动失败，已回退 Tone.js：${error.message}`;
        await audioEngine.play(startOffset, playbackOptions);
    }

    isPlaying = true;
    currentTime = startOffset;
    resetVisualClock(currentTime);
    updatePlayButtonIcon(true);
    statusEl.textContent = '播放中...';

    requestAnimationFrame(renderLoop);
}

function pausePlay() {
    currentTime = audioEngine.pause();
    resetVisualClock(currentTime);
    isPlaying = false;
    updatePlayButtonIcon(false);
    statusEl.textContent = '已暂停';
}

function stopPlay(isEnd = false) {
    resetPlaybackState(true);
    statusEl.textContent = isEnd ? '播放完毕' : '已停止';

    if (notes.length > 0) {
        drawFrame(0);
    }
}

function finishPlayAtEnd() {
    isPlaying = false;
    currentTime = totalDuration;
    resetVisualClock(currentTime);
    updatePlayButtonIcon(false);
    updateProgressUI(true);
    statusEl.textContent = '播放完毕';

    if (notes.length > 0) {
        drawFrame(currentTime);
    }
}

playBtn.addEventListener('click', async () => {
    try {
        if (isPlaying) {
            pausePlay();
        } else {
            await startPlay();
        }
    } catch (error) {
        console.error('播放失败:', error);
        isPlaying = false;
        updatePlayButtonIcon(false);
        statusEl.textContent = `播放失败：${error.message}`;
    }
});

// ==================== 渲染 ====================
function renderLoop(frameMs) {
    if (!isPlaying) return;

    const audioTime = Math.min(totalDuration, audioEngine.getCurrentTime());
    currentTime = Math.min(totalDuration, getSmoothedPlaybackTime(audioTime, frameMs));
    updateProgressUI();
    drawFrame(currentTime);

    requestAnimationFrame(renderLoop);
}

function midiToY(midi) {
    const range = window.midiRange || { min: 48, max: 84 };
    const availableHeight = HEIGHT - 2 * MARGIN;
    const normalized = (midi - range.min) / (range.max - range.min);
    return MARGIN + (1 - normalized) * availableHeight;
}

function getVisualizerTheme(isLight) {
    if (isLight) {
        return {
            isLight: true,
            gridColor: 'rgba(92, 65, 28, 0.15)',
            centerLineColor: 'rgba(79, 43, 13, 0.72)',
            centerLineGlow: 'rgba(187, 132, 48, 0.18)',
            textColor: 'rgba(67, 42, 16, 0.68)',
            measureColor: 'rgba(91, 52, 16, 0.42)',
            beatColor: 'rgba(102, 76, 38, 0.18)',
            labelFont: '12px Georgia, "Times New Roman", serif',
            measureFont: 'bold 13px Georgia, "Times New Roman", serif'
        };
    }

    return {
        isLight: false,
        gridColor: 'rgba(255,255,255,0.08)',
        centerLineColor: 'rgba(255,255,255,0.3)',
        centerLineGlow: 'rgba(120, 150, 255, 0.18)',
        textColor: 'rgba(255,255,255,0.5)',
        measureColor: 'rgba(255,255,255,0.3)',
        beatColor: 'rgba(255,255,255,0.12)',
        labelFont: '12px Segoe UI, sans-serif',
        measureFont: 'bold 13px "Segoe UI", Tahoma, sans-serif'
    };
}

function paintVisualizerBackground(targetCtx, theme) {
    if (!theme.isLight) {
        const darkBg = targetCtx.createRadialGradient(WIDTH * 0.5, HEIGHT * 0.45, 0, WIDTH * 0.5, HEIGHT * 0.45, Math.max(WIDTH, HEIGHT) * 0.75);
        darkBg.addColorStop(0, '#090d18');
        darkBg.addColorStop(0.62, '#02040a');
        darkBg.addColorStop(1, '#000000');
        targetCtx.fillStyle = darkBg;
        targetCtx.fillRect(0, 0, WIDTH, HEIGHT);
        return;
    }

    const parchment = targetCtx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    parchment.addColorStop(0, '#f4e8c8');
    parchment.addColorStop(0.5, '#e8d2a0');
    parchment.addColorStop(1, '#d7b877');
    targetCtx.fillStyle = parchment;
    targetCtx.fillRect(0, 0, WIDTH, HEIGHT);

    const centerGlow = targetCtx.createRadialGradient(WIDTH * 0.42, HEIGHT * 0.38, 0, WIDTH * 0.42, HEIGHT * 0.38, Math.max(WIDTH, HEIGHT) * 0.72);
    centerGlow.addColorStop(0, 'rgba(255, 250, 229, 0.58)');
    centerGlow.addColorStop(0.54, 'rgba(255, 244, 208, 0.16)');
    centerGlow.addColorStop(1, 'rgba(88, 54, 18, 0.20)');
    targetCtx.fillStyle = centerGlow;
    targetCtx.fillRect(0, 0, WIDTH, HEIGHT);

    const stains = [
        [0.14, 0.18, 0.28, 'rgba(110, 72, 26, 0.075)'],
        [0.82, 0.22, 0.22, 'rgba(92, 56, 18, 0.055)'],
        [0.72, 0.78, 0.30, 'rgba(124, 80, 24, 0.06)'],
        [0.28, 0.86, 0.24, 'rgba(74, 48, 18, 0.05)']
    ];

    stains.forEach(([xRatio, yRatio, rRatio, color]) => {
        const radius = Math.max(WIDTH, HEIGHT) * rRatio;
        const stain = targetCtx.createRadialGradient(WIDTH * xRatio, HEIGHT * yRatio, 0, WIDTH * xRatio, HEIGHT * yRatio, radius);
        stain.addColorStop(0, color);
        stain.addColorStop(1, 'rgba(110, 72, 26, 0)');
        targetCtx.fillStyle = stain;
        targetCtx.fillRect(0, 0, WIDTH, HEIGHT);
    });

    targetCtx.save();
    targetCtx.strokeStyle = 'rgba(96, 62, 22, 0.16)';
    targetCtx.lineWidth = 1;
    targetCtx.strokeRect(14, 14, WIDTH - 28, HEIGHT - 28);
    targetCtx.strokeStyle = 'rgba(255, 247, 219, 0.28)';
    targetCtx.strokeRect(19, 19, WIDTH - 38, HEIGHT - 38);
    targetCtx.restore();
}

function drawVisualizerBackground(theme) {
    const themeKey = theme.isLight ? 'light' : 'dark';
    const cacheKey = `${themeKey}:${WIDTH}:${HEIGHT}:${canvasPixelRatio}`;

    if (!visualBackgroundCache || visualBackgroundCache.key !== cacheKey) {
        const cacheCanvas = document.createElement('canvas');
        cacheCanvas.width = Math.round(WIDTH * canvasPixelRatio);
        cacheCanvas.height = Math.round(HEIGHT * canvasPixelRatio);
        const cacheCtx = cacheCanvas.getContext('2d');
        cacheCtx.setTransform(canvasPixelRatio, 0, 0, canvasPixelRatio, 0, 0);
        paintVisualizerBackground(cacheCtx, theme);
        visualBackgroundCache = { key: cacheKey, canvas: cacheCanvas };
    }

    ctx.drawImage(visualBackgroundCache.canvas, 0, 0, WIDTH, HEIGHT);
}

function strokeGuideLine(x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}

function snapStrokePosition(value, lineWidth = 1) {
    const pixelWidth = Math.max(1, Math.round(lineWidth * canvasPixelRatio));
    const offset = pixelWidth % 2 === 1 ? 0.5 : 0;
    return (Math.round(value * canvasPixelRatio) + offset) / canvasPixelRatio;
}

function drawPlaybackLine(theme, isHorizontal, hitX, hitY) {
    ctx.save();
    ctx.lineCap = 'round';

    if (isHorizontal) {
        const glowWidth = theme.isLight ? 8 : 7;
        const lineWidth = theme.isLight ? 2.5 : 2;
        const glowX = snapStrokePosition(hitX, glowWidth);
        const lineX = snapStrokePosition(hitX, lineWidth);
        strokeGuideLine(glowX, 0, glowX, HEIGHT, theme.centerLineGlow, glowWidth);
        strokeGuideLine(lineX, 0, lineX, HEIGHT, theme.centerLineColor, lineWidth);
    } else {
        const glowWidth = theme.isLight ? 8 : 7;
        const lineWidth = theme.isLight ? 2.5 : 2;
        const glowY = snapStrokePosition(hitY, glowWidth);
        const lineY = snapStrokePosition(hitY, lineWidth);
        strokeGuideLine(0, glowY, WIDTH, glowY, theme.centerLineGlow, glowWidth);
        strokeGuideLine(0, lineY, WIDTH, lineY, theme.centerLineColor, lineWidth);
    }

    ctx.restore();
}

function getTrackHueForNote(note) {
    return trackInfo.length > 0 && trackInfo[note.track]
        ? trackInfo[note.track].hue
        : trackHues[note.track % trackHues.length];
}

function getNoteVisualStyle(note, timeSinceEnd, alpha, theme, glowBlur, simplified = false) {
    const fadeRatio = Math.max(0, 1 - timeSinceEnd / FADE_TIME);

    if (timeSinceEnd > 0) {
        if (theme.isLight) {
            return {
                top: `rgba(126, 96, 52, ${alpha * 0.34})`,
                middle: `rgba(84, 58, 28, ${alpha * 0.30})`,
                bottom: `rgba(54, 34, 16, ${alpha * 0.22})`,
                stroke: `rgba(67, 43, 18, ${alpha * 0.18})`,
                shadowColor: 'rgba(74, 48, 18, 0.18)',
                shadowBlur: simplified ? 0 : 2,
                shadowOffsetY: simplified ? 0 : 1,
                strokeWidth: simplified ? 0 : 1,
                flat: simplified
            };
        }

        const lightness = 30 + fadeRatio * 20;
        return {
            top: `hsla(0, 0%, ${lightness + 8}%, ${alpha})`,
            middle: `hsla(0, 0%, ${lightness}%, ${alpha})`,
            bottom: `hsla(0, 0%, ${Math.max(12, lightness - 10)}%, ${alpha})`,
            stroke: `rgba(255, 255, 255, ${alpha * 0.12})`,
            shadowColor: 'transparent',
            shadowBlur: 0,
            shadowOffsetY: 0,
            strokeWidth: 0,
            flat: simplified
        };
    }

    const hue = getTrackHueForNote(note);
    const velocity = Number.isFinite(note.velocity) ? note.velocity : 0.8;

    if (theme.isLight) {
        const lightness = 38 + velocity * 13;
        return {
            top: `hsla(${hue}, 62%, ${Math.min(72, lightness + 16)}%, ${alpha})`,
            middle: `hsla(${hue}, 64%, ${lightness}%, ${alpha})`,
            bottom: `hsla(${hue}, 58%, ${Math.max(24, lightness - 12)}%, ${alpha})`,
            stroke: `hsla(${hue}, 64%, 24%, ${alpha * 0.58})`,
            shadowColor: `rgba(62, 39, 14, ${alpha * 0.22})`,
            shadowBlur: simplified ? 0 : (window.innerWidth <= 768 ? 2 : 4),
            shadowOffsetY: simplified ? 0 : 2,
            strokeWidth: simplified ? 0 : 1,
            flat: simplified
        };
    }

    const lightness = 58 + velocity * 10;
    return {
        top: `hsla(${hue}, 100%, ${Math.min(78, lightness + 10)}%, ${alpha})`,
        middle: `hsla(${hue}, 100%, ${lightness}%, ${alpha})`,
        bottom: `hsla(${hue}, 100%, ${Math.max(38, lightness - 14)}%, ${alpha})`,
        stroke: `hsla(${hue}, 100%, 76%, ${alpha * 0.42})`,
        shadowColor: `hsla(${hue}, 100%, 60%, ${alpha})`,
        shadowBlur: simplified ? 0 : glowBlur,
        shadowOffsetY: 0,
        strokeWidth: 0,
        flat: simplified
    };
}

function drawNoteBlock(x, y, width, height, style, isHorizontal) {
    if (style.flat && style.shadowBlur === 0 && style.strokeWidth === 0) {
        ctx.fillStyle = style.middle;
        ctx.fillRect(x, y, width, height);
        return;
    }

    const radius = Math.min(6, Math.max(1, Math.abs(width) / 2), Math.max(1, Math.abs(height) / 2));
    let fillStyle = style.middle;

    if (!style.flat) {
        const gradient = isHorizontal
            ? ctx.createLinearGradient(x, y, x, y + height)
            : ctx.createLinearGradient(x, y, x + width, y);

        gradient.addColorStop(0, style.top);
        gradient.addColorStop(0.52, style.middle);
        gradient.addColorStop(1, style.bottom);
        fillStyle = gradient;
    }

    ctx.save();
    ctx.shadowColor = style.shadowColor;
    ctx.shadowBlur = style.shadowBlur;
    ctx.shadowOffsetY = style.shadowOffsetY;
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();

    if (style.strokeWidth > 0) {
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = style.strokeWidth;
        ctx.stroke();
    }
    ctx.restore();
}

function shouldUseSimplifiedNoteRendering(visibleNoteCandidates, isMobile) {
    const baseThreshold = isMobile
        ? MOBILE_SIMPLIFIED_NOTE_THRESHOLD
        : DESKTOP_SIMPLIFIED_NOTE_THRESHOLD;
    if (visibleNoteCandidates >= baseThreshold) return true;

    const lowSpeedThreshold = isMobile
        ? MOBILE_LOW_SPEED_SIMPLIFIED_THRESHOLD
        : LOW_SPEED_SIMPLIFIED_THRESHOLD;
    return SPEED <= 80 && visibleNoteCandidates >= lowSpeedThreshold;
}

function drawFrame(now) {
    if (Math.abs(canvasPixelRatio - getCanvasPixelRatio()) > 0.001) {
        applyCanvasResolution();
    } else {
        ctx.setTransform(canvasPixelRatio, 0, 0, canvasPixelRatio, 0, 0);
    }

    // --- 动画平滑过渡逻辑 ---
    if (currentExtraInfoAlpha < targetExtraInfoAlpha) {
        currentExtraInfoAlpha = Math.min(1, currentExtraInfoAlpha + FADE_SPEED);
    } else if (currentExtraInfoAlpha > targetExtraInfoAlpha) {
        currentExtraInfoAlpha = Math.max(0, currentExtraInfoAlpha - FADE_SPEED);
    }
    const shouldDrawExtra = currentExtraInfoAlpha > 0;

    // 主题颜色
    const isLight = isLightTheme();
    const visualTheme = getVisualizerTheme(isLight);
    drawVisualizerBackground(visualTheme);

    const isHorizontal = flowDirection === 'horizontal';

    // 定义判定线位置
    const hitX = WIDTH / 2;          // 水平模式：在屏幕中间
    const hitY = HEIGHT * 0.8;       // 垂直模式：在屏幕偏下方 (留出底部空间显示音名)

    // 画判定线
    drawPlaybackLine(visualTheme, isHorizontal, hitX, hitY);

    // 画音高网格线
    const range = window.midiRange || { min: 48, max: 84 };
    ctx.strokeStyle = visualTheme.gridColor;
    ctx.lineWidth = 1;
    ctx.font = visualTheme.labelFont;

    for (let i = range.min; i <= range.max; i++) {
        ctx.beginPath();
        if (isHorizontal) {
            const y = snapStrokePosition(midiToY(i), 1);
            ctx.moveTo(0, y);
            ctx.lineTo(WIDTH, y);
            ctx.stroke();

            if (shouldDrawExtra && i % 12 === 0) {
                ctx.fillStyle = visualTheme.textColor;
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(midiToNoteName(i), hitX - 10, y);
            }
        } else {
            // 垂直模式的网格线
            const x = snapStrokePosition(midiToX(i), 1);
            ctx.moveTo(x, 0);
            ctx.lineTo(x, HEIGHT);
            ctx.stroke();

            if (shouldDrawExtra && i % 12 === 0) {
                ctx.fillStyle = visualTheme.textColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(midiToNoteName(i), x, hitY + 10);
            }
        }
    }

    // 画小节线
    if (shouldDrawExtra && gridLines.length > 0) {
        const gridWindow = getVisibleGridWindow(now, isHorizontal, hitX, hitY);
        for (let lineIndex = gridWindow.start; lineIndex < gridWindow.end; lineIndex++) {
            const line = gridLines[lineIndex];
            const timeDelta = line.time - now;
            if (isHorizontal) {
                const rawX = hitX + timeDelta * SPEED;
                if (rawX >= -20 && rawX <= WIDTH + 20) {
                    const lineWidth = line.isMeasure ? 2 : 1;
                    const x = snapStrokePosition(rawX, lineWidth);
                    ctx.strokeStyle = line.isMeasure ? visualTheme.measureColor : visualTheme.beatColor;
                    ctx.lineWidth = lineWidth;
                    ctx.beginPath();
                    ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT);
                    ctx.stroke();

                    if (line.isMeasure && line.label) {
                        ctx.fillStyle = visualTheme.textColor;
                        ctx.font = visualTheme.measureFont;
                        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                        ctx.fillText(line.label, x + 10, 22);
                    }
                }
            } else {
                // 垂直模式的小节线 (从上往下掉)
                const rawY = hitY - timeDelta * SPEED;
                if (rawY >= -20 && rawY <= HEIGHT + 20) {
                    const lineWidth = line.isMeasure ? 2 : 1;
                    const y = snapStrokePosition(rawY, lineWidth);
                    ctx.strokeStyle = line.isMeasure ? visualTheme.measureColor : visualTheme.beatColor;
                    ctx.lineWidth = lineWidth;
                    ctx.beginPath();
                    ctx.moveTo(0, y); ctx.lineTo(WIDTH, y);
                    ctx.stroke();

                    if (line.isMeasure && line.label) {
                        ctx.fillStyle = visualTheme.textColor;
                        ctx.font = visualTheme.measureFont;
                        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
                        ctx.fillText(line.label, 10, y - 5);
                    }
                }
            }
        }
    }

    // 画音符
    const isMobile = window.innerWidth <= 768;
    const fadeInDistance = getFadeInDistance();
    const noteWindow = getVisibleNoteWindow(now, isHorizontal, hitX, hitY);
    const visibleNoteCandidates = noteWindow.end - noteWindow.start;
    const simplifiedNotes = shouldUseSimplifiedNoteRendering(visibleNoteCandidates, isMobile);
    const GLOW_BLUR = simplifiedNotes
        ? (visualTheme.isLight ? 0 : (isMobile ? 4 : 10))
        : (isMobile ? 10 : 30);

    for (let noteIndex = noteWindow.start; noteIndex < noteWindow.end; noteIndex++) {
        const note = notes[noteIndex];
        const timeDelta = note.time - now;
        const timeSinceEnd = now - (note.time + note.duration);

        // 音符完全消失后不再渲染
        if (timeSinceEnd > FADE_TIME) continue;

        const length = note.duration * SPEED;

        // 检查音轨是否启用
        if (trackInfo.length > 0 && !trackInfo[note.track]?.enabled) continue;

        let alpha = 1;

        if (isHorizontal) {
            const x = hitX + timeDelta * SPEED;
            const y = midiToY(note.midi);

            if (x > WIDTH + fadeInDistance || x + length < -20) continue;

            if (timeSinceEnd > 0) alpha = Math.max(0, 1 - timeSinceEnd / FADE_TIME);
            if (x > hitX && x < WIDTH) alpha = Math.max(0, (WIDTH - x) / fadeInDistance);

            const style = getNoteVisualStyle(
                note,
                timeSinceEnd,
                alpha,
                visualTheme,
                GLOW_BLUR,
                simplifiedNotes
            );
            drawNoteBlock(x, y - THICKNESS / 2, Math.max(2, length), THICKNESS, style, true);

        } else {
            // === 垂直模式渲染逻辑 ===
            const y = hitY - timeDelta * SPEED; // timeDelta > 0 意味着在未来（屏幕上方）
            const x = midiToX(note.midi);

            if (y < -fadeInDistance || y - length > HEIGHT + 20) continue;

            if (timeSinceEnd > 0) alpha = Math.max(0, 1 - timeSinceEnd / FADE_TIME);
            // 从屏幕顶部淡入
            if (y < hitY && y > 0) {
                alpha = Math.min(1, Math.max(0, y / (HEIGHT * 0.25)));
            }

            // 垂直下落时，音符的头部（最先接触判定线的部分）在 y，尾部在 y - length（朝屏幕上方延伸）
            // 所以方块的起点Y坐标是 y - length，高度是 length
            const style = getNoteVisualStyle(
                note,
                timeSinceEnd,
                alpha,
                visualTheme,
                GLOW_BLUR,
                simplifiedNotes
            );
            drawNoteBlock(x - THICKNESS / 2, y - length, THICKNESS, Math.max(2, length), style, false);
        }
    }

    ctx.shadowBlur = 0;
}

// ==================== 键盘 ====================
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        if (notes.length > 0) {
            if (isPlaying) pausePlay();
            else startPlay();
        }
    }
    if (e.code === 'KeyR') {
        stopPlay();
    }
});

// ==================== 初始 ====================
initTheme();
drawFrame(0);
