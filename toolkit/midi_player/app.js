// 作者: YoungSimpleBoy
// 日期: 2026-03-22
// 功能: 一个MIDI播放与可视化组件
// ==================== 配置 ====================
let WIDTH = window.innerWidth > 1440 ? 1440 : (window.innerWidth * 0.95);
let HEIGHT = window.innerWidth <= 768 ? WIDTH * 1.0 : 720;
const DEFAULT_SPEED = 200;       // 默认速度：像素/秒
let SPEED = DEFAULT_SPEED;       // 速度：像素/秒（可调节）
const THICKNESS = 8;   // 音符厚度
const MARGIN = 20;      // 边距
const FADE_TIME = 3.3;       // 音符淡出时间（秒）
const FADE_IN_DIST = WIDTH; // 淡入距离（像素）
const FADE_IN_TIME = FADE_IN_DIST / SPEED; // 转换为时间（秒）

// ==================== DOM ====================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const fileInput = document.getElementById('fileInput');
const playBtn = document.getElementById('playBtn');
const exampleSelect = document.getElementById('exampleSelect');
const statusEl = document.getElementById('status');
const themeToggle = document.getElementById('themeToggle');

canvas.width = WIDTH;
canvas.height = HEIGHT;

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

// ==================== 瀑布流方向控制 ====================
let flowDirection = 'horizontal'; // 默认水平

const directionSelect = document.getElementById('directionSelect');
if (directionSelect) {
    directionSelect.addEventListener('change', (e) => {
        flowDirection = e.target.value;
        if (!isPlaying && typeof currentTime !== 'undefined') {
            drawFrame(currentTime); // 切换后立即重绘一帧预览
        }
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
let isPlaying = false;
let currentTime = 0;
let totalDuration = 0;
let isDraggingProgress = false;

// ==================== 音轨控制 ====================
const trackHues = [200, 280, 120, 30, 320, 60]; // 音轨颜色
let trackInfo = []; // 存储音轨信息: {name, noteCount, enabled, hue, minMidi, maxMidi}
let midiMeta = null; // 存储文件级别的元信息

// 从 MIDI 编号获取调号名称
function getKeySignatureName(keyFifths) {
    const keys = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];  // 升号调
    const flatKeys = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']; // 降号调

    if (keyFifths >= 0) {
        return keys[keyFifths] || 'C';
    } else {
        return flatKeys[Math.abs(keyFifths)] || 'C';
    }
}

function extractMidiMeta(midi, fileName) {
    // 获取 BPM
    const tempos = midi.header.tempos || [];
    const bpm = tempos.length > 0 ? Math.round(tempos[0].bpm) : 120;

    // 获取拍号
    const timeSigs = midi.header.timeSignatures || [];
    let timeSig = '4/4';
    if (timeSigs.length > 0) {
        const ts = timeSigs[0];
        if (Array.isArray(ts.timeSignature)) {
            timeSig = `${ts.timeSignature[0]}/${ts.timeSignature[1]}`;
        } else if (ts.numerator !== undefined) {
            timeSig = `${ts.numerator}/${ts.denominator || 4}`;
        }
    }

    // 获取调号 (尝试从 key_signatures 中获取)
    let keySig = 'C';
    const keySigs = midi.header.keySignatures || [];
    if (keySigs.length > 0) {
        keySig = getKeySignatureName(keySigs[0].key || 0);
    }

    // 总音符数
    let totalNotes = 0;
    midi.tracks.forEach(track => {
        totalNotes += track.notes.length;
    });

    midiMeta = {
        fileName: fileName,
        bpm: bpm,
        timeSig: timeSig,
        keySig: keySig,
        totalNotes: totalNotes
    };

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

function initTrackPanel() {
    const trackList = document.getElementById('trackList');

    if (trackInfo.length === 0) {
        trackList.innerHTML = '<p class="track-empty">加载 MIDI 文件后显示音轨信息</p>';
        return;
    }

    trackList.innerHTML = '';

    trackInfo.forEach((track, index) => {
        const trackEl = document.createElement('div');
        trackEl.className = 'track-item';
        trackEl.innerHTML = `
            <label class="track-toggle">
                <input type="checkbox" data-track="${index}" ${track.enabled ? 'checked' : ''}>
                <span class="track-checkbox" style="--track-hue: ${track.hue}"></span>
            </label>
            <span class="track-name" style="--track-hue: ${track.hue}">${track.name}</span>
            <span class="track-sep">-</span>
            <span class="track-notes">${track.noteCount}个</span>
            <span class="track-sep">-</span>
            <span class="track-range">${track.noteRange}</span>
            <select class="track-instrument-select" data-track="${index}">
                <option value="inherit">跟随全局</option>
                <option value="default">正弦合成器</option>
                <option value="piano">钢琴</option>
                <option value="fm">FM 电钢琴</option>
                <option value="am">AM 复古</option>
                <option value="fat">胖锯齿波</option>
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
            // 如果选了独立音色，提前加载它
            if (selectedType !== 'inherit') {
                statusEl.textContent = `加载音轨音色中...`;
                await getInstrumentInstance(selectedType);
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

// MIDI音符编号到音名转换
function midiToNoteName(midi) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const note = noteNames[midi % 12];
    return note + octave;
}

function extractTrackInfo(midi) {
    trackInfo = [];
    let trackIndex = 0;

    midi.tracks.forEach((track, idx) => {
        if (track.notes.length > 0) {
            // 获取音轨名称（只使用 name 字段，避免 [object Object]）
            let name = track.name || '';
            // 确保 name 是字符串
            if (typeof name !== 'string') {
                name = String(name || '');
            }
            // 清理名称（有些MIDI会附加设备信息）
            if (name.includes('\x00')) {
                name = name.split('\x00')[0];
            }
            if (!name || name.trim() === '') {
                name = `音轨 ${trackIndex + 1}`;
            }
            // 如果名称太长，截断显示
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
                noteCount: track.notes.length,
                noteRange: noteRange, // 占位
                enabled: true,
                volume: 1.0,
                instrument: 'inherit', // 默认继承全局
                hue: trackHues[trackIndex % trackHues.length]
            });
            trackIndex++;
        }
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
const reverb = new Tone.Reverb({
    decay: 2,
    wet: 0.2
}).toDestination();
let currentInstrument = new Tone.PolySynth(Tone.Synth).connect(reverb);
let globalInstrumentType = 'default'; // 记录当前全局选中的类型

// 乐器池，缓存已创建的乐器实例
const instrumentPool = {
    'default': currentInstrument
};
// 统一乐器创建逻辑
async function getInstrumentInstance(type) {
    if (instrumentPool[type]) return instrumentPool[type];
    let inst;
    if (type === 'fm') {
        inst = new Tone.PolySynth(Tone.FMSynth);
    } else if (type === 'am') {
        inst = new Tone.PolySynth(Tone.AMSynth);
    } else if (type === 'fat') {
        inst = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: "fatsawtooth" }
        });
    } else if (type === 'piano') {
        statusEl.textContent = '正在加载高保真全键盘采样...';
        inst = new Tone.Sampler({
            // 映射表：涵盖了从低音到高音的关键采样点
            // Tone.js 会自动对中间缺失的音符进行"重采样"插值
            urls: {
                "A0": "A0.mp3", "C1": "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3",
                "A1": "A1.mp3", "C2": "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3",
                "A2": "A2.mp3", "C3": "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3",
                "A3": "A3.mp3", "C4": "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3",
                "A4": "A4.mp3", "C5": "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3",
                "A5": "A5.mp3", "C6": "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3",
                "A6": "A6.mp3", "C7": "C7.mp3", "D#7": "Ds7.mp3", "F#7": "Fs7.mp3",
                "A7": "A7.mp3", "C8": "C8.mp3"
            },
            // 关键参数设置
            release: 1.2,       // 松开按键后的余音长度
            baseUrl: "https://tonejs.github.io/audio/salamander/", // Salamander Grand Piano 开源采样库
            onload: () => {
                statusEl.textContent = '钢琴音色就绪 (Salamander Grand)';
                inst.connect(reverb); // 必须连接到混响
                inst.volume.value = parseFloat(volumeSlider.value);
            }
        });
    } else {
        inst = new Tone.PolySynth(Tone.Synth);
    }
    // ... 其他音色如 organ, bell 等

    // 将新创建的乐器连接到输出端
    if (typeof reverb !== 'undefined') {
        inst.connect(reverb);
    } else {
        inst.toDestination();
    }

    instrumentPool[type] = inst;
    return inst;
}

instrumentSelect.addEventListener('change', async (e) => {
    const type = e.target.value;
    await Tone.start();
    
    statusEl.textContent = '切换全局音色...';
    await getInstrumentInstance(type); // 确保全局音色已加载到池中
    globalInstrumentType = type;
    statusEl.textContent = '全局音色已更新';
});

// ==================== 音量控制 ====================
const volumeSlider = document.getElementById('volumeSlider');
const volumeValue = document.getElementById('volumeValue');

function updateVolume() {
    const dbValue = parseFloat(volumeSlider.value);
    // 检查实例是否存在且未被销毁
    if (currentInstrument && !currentInstrument.disposed) {
        currentInstrument.volume.value = dbValue;
    }
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

// ==================== 小节线显示设置 ====================
let showMeasureLines = true; // 显示小节线
let measureLineAlpha = 0.3; // 小节线透明度

// ==================== 核心：网格解析引擎 ====================
function parseMidiGrid(midi) {
    const lines = [];
    const ppq = midi.header.ppq || 480;

    const tempos = midi.header.tempos && midi.header.tempos.length > 0
        ? midi.header.tempos
        : [{ ticks: 0, bpm: 120 }];

    let timeSigs = midi.header.timeSignatures && midi.header.timeSignatures.length > 0
        ? midi.header.timeSignatures
        : [{ ticks: 0, timeSignature: [4, 4] }];

    // 将绝对 Tick 转换为绝对秒数
    function getSecondsFromTick(targetTick) {
        let time = 0;
        let lastTick = 0;
        let lastBpm = tempos[0].bpm;

        for (let i = 0; i < tempos.length; i++) {
            let tempo = tempos[i];
            if (tempo.ticks > targetTick) break;
            let deltaTicks = tempo.ticks - lastTick;
            time += deltaTicks * (60 / lastBpm / ppq);
            lastTick = tempo.ticks;
            lastBpm = tempo.bpm;
        }
        let remainingTicks = targetTick - lastTick;
        time += remainingTicks * (60 / lastBpm / ppq);
        return time;
    }

    let maxTick = 0;
    midi.tracks.forEach(track => {
        track.notes.forEach(note => {
            if (note.ticks + note.durationTicks > maxTick) {
                maxTick = note.ticks + note.durationTicks;
            }
        });
    });

    // 额外加上一小段缓冲
    maxTick += ppq * 16;

    let currentTick = 0;
    let timeSigIndex = 0;
    let measureCount = 1;

    while (currentTick <= maxTick) {
        let currentSig = timeSigs[timeSigIndex];
        while (timeSigIndex + 1 < timeSigs.length && timeSigs[timeSigIndex + 1].ticks <= currentTick) {
            timeSigIndex++;
            currentSig = timeSigs[timeSigIndex];
        }

        // 兼容 @tonejs/midi 不同的时间签名格式
        let num = 4, den = 4;
        if (Array.isArray(currentSig.timeSignature)) {
            num = currentSig.timeSignature[0];
            den = currentSig.timeSignature[1];
        } else if (currentSig.numerator && currentSig.denominator) {
            num = currentSig.numerator;
            den = currentSig.denominator;
        }

        let ticksPerBeat = ppq * (4 / den);
        let ticksPerMeasure = ticksPerBeat * num;

        // 记录小节线
        lines.push({
            time: getSecondsFromTick(currentTick),
            isMeasure: true,
            label: `Bar ${measureCount} (${num}/${den})`
        });

        // 记录内部节拍线
        for (let b = 1; b < num; b++) {
            lines.push({
                time: getSecondsFromTick(currentTick + b * ticksPerBeat),
                isMeasure: false
            });
        }

        currentTick += Math.round(ticksPerMeasure);
        measureCount++;
    }

    return lines;
}

// ==================== 进度条控制 ====================
const progressSlider = document.getElementById('progressSlider');
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl = document.getElementById('totalTime');

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updateProgressUI() {
    if (totalDuration > 0) {
        const progress = (currentTime / totalDuration) * 100;
        if (!isDraggingProgress) {
            progressSlider.value = progress;
        }
        currentTimeEl.textContent = formatTime(currentTime);
        totalTimeEl.textContent = formatTime(totalDuration);
    }
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

        if (isPlaying) {
            Tone.Transport.stop();
            Tone.Transport.cancel();

            notes.forEach(note => {
                if (note.time >= currentTime) {
                    scheduleNoteToTransport(note)
                }
            });

            const lastNote = notes[notes.length - 1].time;
            Tone.Transport.schedule(() => {
                stopPlay(true);
            }, lastNote + 0.5);

            Tone.Transport.start(undefined, currentTime);
        } else {
            drawFrame(currentTime);
        }
    }
    isDraggingProgress = false;
    updateProgressUI();
}

progressSlider.addEventListener('mouseup', handleSeekEnd);
// 添加手机端触摸结束事件
progressSlider.addEventListener('touchend', handleSeekEnd);

// ==================== 工具：停止并清理 ====================
function stopAndClear() {
    isPlaying = false;
    Tone.Transport.stop();
    Tone.Transport.cancel();
    currentTime = 0;
    document.getElementById('playIcon').innerHTML = '<polygon points="5,3 19,12 5,21"/>';
    updateProgressUI();
    // 清除音轨信息和文件元信息
    trackInfo = [];
    midiMeta = null;
    updateMidiInfo();
    initTrackPanel();
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

        // 解析并预存小节线网格
        gridLines = parseMidiGrid(midi);

        // 提取文件级元信息
        extractMidiMeta(midi, file.name);

        notes = [];
        let minMidi = 127, maxMidi = 0;
        let trackIndex = 0;

        // 提取音轨信息
        extractTrackInfo(midi);

        midi.tracks.forEach(track => {
            if (track.notes.length > 0) {
                const trackColor = trackIndex;
                track.notes.forEach(note => {
                    notes.push({
                        midi: note.midi,
                        time: note.time,
                        duration: note.duration,
                        name: note.name,
                        velocity: note.velocity || 0.8,
                        track: trackColor
                    });
                    minMidi = Math.min(minMidi, note.midi);
                    maxMidi = Math.max(maxMidi, note.midi);
                });
                trackIndex++;
            }
        });

        notes.sort((a, b) => a.time - b.time);

        window.midiRange = {
            min: Math.max(0, minMidi - 1),
            max: Math.min(127, maxMidi + 1)
        };

        playBtn.disabled = false;
        statusEl.textContent = `已加载: ${file.name} (${notes.length} 个音符)`;
        totalDuration = notes[notes.length - 1].time + notes[notes.length - 1].duration;
        updateProgressUI();

        drawFrame(0);

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

        // 解析并预存小节线网格
        gridLines = parseMidiGrid(midi);

        // 提取文件级元信息
        const fileName = filePath.split('/').pop();
        extractMidiMeta(midi, fileName);

        notes = [];
        let minMidi = 127, maxMidi = 0;
        let trackIndex = 0;

        // 提取音轨信息
        extractTrackInfo(midi);

        midi.tracks.forEach(track => {
            if (track.notes.length > 0) {
                const trackColor = trackIndex;
                track.notes.forEach(note => {
                    notes.push({
                        midi: note.midi,
                        time: note.time,
                        duration: note.duration,
                        name: note.name,
                        velocity: note.velocity || 0.8,
                        track: trackColor
                    });
                    minMidi = Math.min(minMidi, note.midi);
                    maxMidi = Math.max(maxMidi, note.midi);
                });
                trackIndex++;
            }
        });

        notes.sort((a, b) => a.time - b.time);

        window.midiRange = {
            min: Math.max(0, minMidi - 1),
            max: Math.min(127, maxMidi + 1)
        };

        playBtn.disabled = false;
        statusEl.textContent = `已加载: ${filePath} (${notes.length} 个音符)`;
        totalDuration = notes[notes.length - 1].time + notes[notes.length - 1].duration;
        updateProgressUI();

        drawFrame(0);

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

// 音符调度函数
function scheduleNoteToTransport(note) {
    Tone.Transport.schedule((time) => {
        const track = trackInfo[note.track];
        if (!track || !track.enabled || track.volume === 0) return;
        // 优先级：如果音轨是 inherit，使用全局变量 globalInstrumentType，否则用音轨私有音色
        const targetType = track.instrument === 'inherit' ? globalInstrumentType : track.instrument;
        // 从池中获取实例，如果还没加载好则跳过（避免报错导致停播）
        const inst = instrumentPool[targetType];
        if (inst) {
            const finalVelocity = Math.max(0, Math.min(1, note.velocity * track.volume));
            if (finalVelocity > 0.01) {
                inst.triggerAttackRelease(note.name, note.duration, time, finalVelocity);
            }
        }
    }, note.time);
}

// ==================== 播放控制 ====================
async function startPlay() {
    if (notes.length === 0) return;

    await Tone.start();
    isPlaying = true;
    document.getElementById('playIcon').innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    statusEl.textContent = '播放中...';

    const startOffset = currentTime;

    // 清除之前的调度，防止重复调度
    Tone.Transport.cancel();

    // 安排所有音符
    notes.forEach(note => {
        if (note.time >= startOffset) {
            scheduleNoteToTransport(note);
        }
    });

    // 结束时停止
    const lastNote = notes[notes.length - 1].time;
    Tone.Transport.schedule(() => {
        stopPlay(true);
    }, lastNote + 0.5);

    Tone.Transport.start(undefined, startOffset);
    currentTime = startOffset;

    requestAnimationFrame(renderLoop);
}

function pausePlay() {
    isPlaying = false;
    Tone.Transport.pause();
    document.getElementById('playIcon').innerHTML = '<polygon points="5,3 19,12 5,21"/>';
    statusEl.textContent = '已暂停';
}

function stopPlay(isEnd = false) {
    stopAndClear();
    statusEl.textContent = isEnd ? '播放完毕' : '已停止';

    if (!isEnd) {
        drawFrame(0);
    }
}

playBtn.addEventListener('click', () => {
    if (isPlaying) {
        pausePlay();
    } else {
        startPlay();
    }
});

// ==================== 渲染 ====================
function renderLoop() {
    if (!isPlaying) return;

    currentTime = Tone.Transport.seconds;
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

function midiToNoteName(midi) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const note = noteNames[midi % 12];
    return note + octave;
}

function drawFrame(now) {
    // --- 动画平滑过渡逻辑 ---
    if (currentExtraInfoAlpha < targetExtraInfoAlpha) {
        currentExtraInfoAlpha = Math.min(1, currentExtraInfoAlpha + FADE_SPEED);
    } else if (currentExtraInfoAlpha > targetExtraInfoAlpha) {
        currentExtraInfoAlpha = Math.max(0, currentExtraInfoAlpha - FADE_SPEED);
    }
    const shouldDrawExtra = currentExtraInfoAlpha > 0;

    // 主题颜色
    const isLight = isLightTheme();
    const bgColor = isLight ? '#ffffff' : '#000000';
    const gridColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)';
    const centerLineColor = isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)';
    const textColor = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
    const measureColor = isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)';
    const beatColor = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const isHorizontal = flowDirection === 'horizontal';

    // 定义判定线位置
    const hitX = WIDTH / 2;          // 水平模式：在屏幕中间
    const hitY = HEIGHT * 0.8;       // 垂直模式：在屏幕偏下方 (留出底部空间显示音名)

    // 画判定线
    ctx.strokeStyle = centerLineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (isHorizontal) {
        ctx.moveTo(hitX, 0); ctx.lineTo(hitX, HEIGHT);
    } else {
        ctx.moveTo(0, hitY); ctx.lineTo(WIDTH, hitY);
    }
    ctx.stroke();

    // 画音高网格线
    const range = window.midiRange || { min: 48, max: 84 };
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.font = '12px Segoe UI, sans-serif';

    for (let i = range.min; i <= range.max; i++) {
        ctx.beginPath();
        if (isHorizontal) {
            const y = midiToY(i);
            ctx.moveTo(0, y);
            ctx.lineTo(WIDTH, y);
            ctx.stroke();

            if (shouldDrawExtra && i % 12 === 0) {
                ctx.fillStyle = textColor;
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(midiToNoteName(i), hitX - 10, y);
            }
        } else {
            // 垂直模式的网格线
            const x = midiToX(i);
            ctx.moveTo(x, 0);
            ctx.lineTo(x, HEIGHT);
            ctx.stroke();

            if (shouldDrawExtra && i % 12 === 0) {
                ctx.fillStyle = textColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(midiToNoteName(i), x, hitY + 10);
            }
        }
    }

    // 画小节线
    if (shouldDrawExtra && gridLines.length > 0) {
        gridLines.forEach(line => {
            const timeDelta = line.time - now;
            if (isHorizontal) {
                const x = hitX + timeDelta * SPEED;
                if (x >= -20 && x <= WIDTH + 20) {
                    ctx.strokeStyle = line.isMeasure ? measureColor : beatColor;
                    ctx.lineWidth = line.isMeasure ? 2 : 1;
                    ctx.beginPath();
                    ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT);
                    ctx.stroke();

                    if (line.isMeasure && line.label) {
                        ctx.fillStyle = textColor;
                        ctx.font = 'bold 13px "Segoe UI", Tahoma, sans-serif';
                        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                        ctx.fillText(line.label, x + 10, 22);
                    }
                }
            } else {
                // 垂直模式的小节线 (从上往下掉)
                const y = hitY - timeDelta * SPEED;
                if (y >= -20 && y <= HEIGHT + 20) {
                    ctx.strokeStyle = line.isMeasure ? measureColor : beatColor;
                    ctx.lineWidth = line.isMeasure ? 2 : 1;
                    ctx.beginPath();
                    ctx.moveTo(0, y); ctx.lineTo(WIDTH, y);
                    ctx.stroke();

                    if (line.isMeasure && line.label) {
                        ctx.fillStyle = textColor;
                        ctx.font = 'bold 13px "Segoe UI", Tahoma, sans-serif';
                        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
                        ctx.fillText(line.label, 10, y - 5);
                    }
                }
            }
        });
    }

    // 画音符
    const isMobile = window.innerWidth <= 768;
    const GLOW_BLUR = isMobile ? 10 : 30; // 手机端性能优化

    notes.forEach(note => {
        const timeDelta = note.time - now;
        const timeSinceEnd = now - (note.time + note.duration);

        // 音符完全消失后不再渲染
        if (timeDelta > FADE_TIME + 0.5) return;

        const length = note.duration * SPEED;

        // 检查音轨是否启用
        if (trackInfo.length > 0 && !trackInfo[note.track]?.enabled) return;

        // 计算颜色
        let hue, lightness, saturation;
        if (timeSinceEnd > 0) {
            hue = isLight ? 0 : 0;
            saturation = '0%';
            lightness = isLight ? 70 + (1 - timeSinceEnd / FADE_TIME) * 15 : 30 + (1 - timeSinceEnd / FADE_TIME) * 20;
        } else {
            const trackHue = trackInfo.length > 0 && trackInfo[note.track] ? trackInfo[note.track].hue : trackHues[note.track % trackHues.length];
            hue = trackHue + note.velocity * 20;
            saturation = '100%';
            lightness = isLight ? 50 : 65;
        }

        let alpha = 1;

        if (isHorizontal) {
            const x = hitX + timeDelta * SPEED;
            const y = midiToY(note.midi);

            if (x > WIDTH + FADE_IN_DIST) return;

            if (timeSinceEnd > 0) alpha = Math.max(0, 1 - timeSinceEnd / FADE_TIME);
            if (x > hitX && x < WIDTH) alpha = Math.max(0, (WIDTH - x) / FADE_IN_DIST);

            ctx.fillStyle = `hsla(${hue}, ${timeSinceEnd > 0 ? '0%' : saturation}, ${lightness}%, ${alpha})`;
            if (timeSinceEnd <= 0) {
                ctx.shadowColor = ctx.fillStyle;
                ctx.shadowBlur = GLOW_BLUR;
            }

            ctx.beginPath();
            ctx.roundRect(x, y - THICKNESS / 2, length, THICKNESS, 5);
            ctx.fill();

        } else {
            // === 垂直模式渲染逻辑 ===
            const y = hitY - timeDelta * SPEED; // timeDelta > 0 意味着在未来（屏幕上方）
            const x = midiToX(note.midi);

            if (y < -FADE_IN_DIST) return; // 超过屏幕上方太远则不渲染

            if (timeSinceEnd > 0) alpha = Math.max(0, 1 - timeSinceEnd / FADE_TIME);
            // 从屏幕顶部淡入
            if (y < hitY && y > 0) {
                alpha = Math.min(1, Math.max(0, y / (HEIGHT * 0.25)));
            }

            ctx.fillStyle = `hsla(${hue}, ${timeSinceEnd > 0 ? '0%' : saturation}, ${lightness}%, ${alpha})`;
            if (timeSinceEnd <= 0) {
                ctx.shadowColor = ctx.fillStyle;
                ctx.shadowBlur = GLOW_BLUR;
            }

            ctx.beginPath();
            // 垂直下落时，音符的头部（最先接触判定线的部分）在 y，尾部在 y - length（朝屏幕上方延伸）
            // 所以方块的起点Y坐标是 y - length，高度是 length
            ctx.roundRect(x - THICKNESS / 2, y - length, THICKNESS, length, 5);
            ctx.fill();
        }
    });

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
