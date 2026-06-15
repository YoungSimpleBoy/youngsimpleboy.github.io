const STORAGE_KEY = 'midi-player-piano-keymap-v2';
const THEME_KEY = 'theme';
const BASE_MIDI = 55;
const KEY_COUNT = 37;
const MIN_OCTAVE_SHIFT = -2;
const MAX_OCTAVE_SHIFT = 2;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

const DEFAULT_MAPPING = [
  { code: 'KeyZ', label: 'Z' },
  { code: 'KeyS', label: 'S' },
  { code: 'KeyX', label: 'X' },
  { code: 'KeyD', label: 'D' },
  { code: 'KeyC', label: 'C' },
  { code: 'KeyV', label: 'V' },
  { code: 'KeyG', label: 'G' },
  { code: 'KeyB', label: 'B' },
  { code: 'KeyH', label: 'H' },
  { code: 'KeyN', label: 'N' },
  { code: 'KeyM', label: 'M' },
  { code: 'KeyK', label: 'K' },
  { code: 'Comma', label: ',' },
  { code: 'KeyL', label: 'L' },
  { code: 'Period', label: '.' },
  { code: 'Semicolon', label: ';' },
  { code: 'Slash', label: '/' },
  { code: 'KeyQ', label: 'Q' },
  { code: 'Digit2', label: '2' },
  { code: 'KeyW', label: 'W' },
  { code: 'Digit3', label: '3' },
  { code: 'KeyE', label: 'E' },
  { code: 'KeyR', label: 'R' },
  { code: 'Digit5', label: '5' },
  { code: 'KeyT', label: 'T' },
  { code: 'Digit6', label: '6' },
  { code: 'KeyY', label: 'Y' },
  { code: 'Digit7', label: '7' },
  { code: 'KeyU', label: 'U' },
  { code: 'KeyI', label: 'I' },
  { code: 'Digit9', label: '9' },
  { code: 'KeyO', label: 'O' },
  { code: 'Digit0', label: '0' },
  { code: 'KeyP', label: 'P' },
  { code: 'BracketLeft', label: '[' },
  { code: 'Equal', label: '=' },
  { code: 'BracketRight', label: ']' },
];
const DEFAULT_SUSTAIN_MAPPING = { code: 'Space', label: '空格' };

const CODE_LABELS = {
  Space: '空格',
  Backspace: '退格',
  Enter: '回车',
  Tab: 'Tab',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
};

const BLOCKED_MAPPING_CODES = new Set([
  'Escape',
  'Tab',
  'CapsLock',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]);

const elements = {
  piano: document.getElementById('piano'),
  mappingGrid: document.getElementById('mappingGrid'),
  captureBanner: document.getElementById('captureBanner'),
  captureNote: document.getElementById('captureNote'),
  captureCancel: document.getElementById('captureCancel'),
  mappingSaveStatus: document.getElementById('mappingSaveStatus'),
  resetMappingButton: document.getElementById('resetMappingButton'),
  clearMappingButton: document.getElementById('clearMappingButton'),
  octaveDown: document.getElementById('octaveDown'),
  octaveUp: document.getElementById('octaveUp'),
  octaveRange: document.getElementById('octaveRange'),
  volumeSlider: document.getElementById('volumeSlider'),
  volumeValue: document.getElementById('volumeValue'),
  sustainButton: document.getElementById('sustainButton'),
  sustainState: document.getElementById('sustainState'),
  sustainShortcut: document.getElementById('sustainShortcut'),
  sustainMappingKey: document.getElementById('sustainMappingKey'),
  releaseAllButton: document.getElementById('releaseAllButton'),
  nowPlaying: document.getElementById('nowPlaying'),
  audioStatus: document.getElementById('audioStatus'),
  audioStatusDot: document.getElementById('audioStatusDot'),
  themeToggle: document.getElementById('themeToggle'),
};

let mappingState = loadMapping();
let mapping = mappingState.notes;
let sustainMapping = mappingState.sustain;
let octaveShift = 0;
let captureTarget = null;
let sustainEnabled = false;
let sustainKeyboardPressed = false;
let audioStarted = false;
let samplerReady = false;
let saveStatusTimer = null;

const sourceNotes = new Map();
const noteSources = new Map();
const sustainedNotes = new Set();
const voiceInstruments = new Map();
const pressedCodes = new Set();

const masterVolume = new Tone.Volume(-8).toDestination();
const reverb = new Tone.Reverb({ decay: 1.8, wet: 0.18 }).connect(masterVolume);
const fallbackSynth = new Tone.PolySynth(Tone.Synth, {
  maxPolyphony: 32,
  oscillator: { type: 'triangle8' },
  envelope: {
    attack: 0.005,
    decay: 0.65,
    sustain: 0.28,
    release: 1.4,
  },
}).connect(reverb);

let instrument = fallbackSynth;

const pianoSampler = new Tone.Sampler({
  urls: {
    A0: 'A0.mp3',
    C1: 'C1.mp3',
    'D#1': 'Eb1.mp3',
    'F#1': 'Gb1.mp3',
    A1: 'A1.mp3',
    C2: 'C2.mp3',
    'D#2': 'Eb2.mp3',
    'F#2': 'Gb2.mp3',
    A2: 'A2.mp3',
    C3: 'C3.mp3',
    'D#3': 'Eb3.mp3',
    'F#3': 'Gb3.mp3',
    A3: 'A3.mp3',
    C4: 'C4.mp3',
    'D#4': 'Eb4.mp3',
    'F#4': 'Gb4.mp3',
    A4: 'A4.mp3',
    C5: 'C5.mp3',
    'D#5': 'Eb5.mp3',
    'F#5': 'Gb5.mp3',
    A5: 'A5.mp3',
    C6: 'C6.mp3',
    'D#6': 'Eb6.mp3',
    'F#6': 'Gb6.mp3',
    A6: 'A6.mp3',
    C7: 'C7.mp3',
    'D#7': 'Eb7.mp3',
    'F#7': 'Gb7.mp3',
    A7: 'A7.mp3',
    C8: 'C8.mp3',
  },
  baseUrl: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_grand_piano-mp3/',
  release: 1.1,
  onload: () => {
    samplerReady = true;
    instrument = pianoSampler;
    setAudioStatus(audioStarted ? '钢琴采样音色已就绪' : '钢琴采样已加载，等待演奏');
  },
  onerror: () => {
    setAudioStatus('钢琴采样加载失败，正在使用合成音色', false);
  },
}).connect(reverb);

function cloneDefaultMapping() {
  return DEFAULT_MAPPING.map(item => ({ ...item }));
}

function loadMapping() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.notes) || saved.notes.length !== KEY_COUNT) {
      return {
        notes: cloneDefaultMapping(),
        sustain: { ...DEFAULT_SUSTAIN_MAPPING },
      };
    }
    const notes = saved.notes.map(item => {
      if (!item || typeof item.code !== 'string') return null;
      return {
        code: item.code,
        label: typeof item.label === 'string' ? item.label : codeToLabel(item.code),
      };
    });
    const sustain = saved.sustain === null
      ? null
      : saved.sustain && typeof saved.sustain.code === 'string'
        ? {
            code: saved.sustain.code,
            label: typeof saved.sustain.label === 'string'
              ? saved.sustain.label
              : codeToLabel(saved.sustain.code),
          }
        : { ...DEFAULT_SUSTAIN_MAPPING };
    return { notes, sustain };
  } catch (_) {
    return {
      notes: cloneDefaultMapping(),
      sustain: { ...DEFAULT_SUSTAIN_MAPPING },
    };
  }
}

function saveMapping(message = '映射已保存。') {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    notes: mapping,
    sustain: sustainMapping,
  }));
  elements.mappingSaveStatus.textContent = message;
  clearTimeout(saveStatusTimer);
  saveStatusTimer = setTimeout(() => {
    elements.mappingSaveStatus.textContent = '映射会自动保存在当前浏览器中。';
  }, 2200);
}

function midiToNoteName(midi) {
  const pitchClass = ((midi % 12) + 12) % 12;
  return `${NOTE_NAMES[pitchClass]}${Math.floor(midi / 12) - 1}`;
}

function slotToMidi(slot) {
  return BASE_MIDI + slot + octaveShift * 12;
}

function codeToLabel(code) {
  if (CODE_LABELS[code]) return CODE_LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

function setAudioStatus(message, ready = true) {
  elements.audioStatus.textContent = message;
  elements.audioStatusDot.classList.toggle('loading', !ready);
}

async function ensureAudio() {
  if (audioStarted) return;
  await Tone.start();
  audioStarted = true;
  setAudioStatus(samplerReady ? '钢琴采样音色已就绪' : '正在使用合成音色，钢琴采样加载中', samplerReady);
}

function renderPiano() {
  const whiteLayer = document.createElement('div');
  whiteLayer.className = 'white-keys';
  const blackKeys = [];
  const whiteKeyCount = Array.from({ length: KEY_COUNT }, (_, slot) =>
    slotToMidi(slot)
  ).filter(midi => !BLACK_PITCH_CLASSES.has(((midi % 12) + 12) % 12)).length;
  elements.piano.style.setProperty('--white-count', String(whiteKeyCount));
  let whiteCount = 0;

  for (let slot = 0; slot < KEY_COUNT; slot++) {
    const midi = slotToMidi(slot);
    const pitchClass = ((midi % 12) + 12) % 12;
    const isBlack = BLACK_PITCH_CLASSES.has(pitchClass);
    const key = createPianoKey(slot, midi, isBlack);

    if (isBlack) {
      key.style.setProperty('--black-left', `${whiteCount / whiteKeyCount * 100}%`);
      blackKeys.push(key);
    } else {
      whiteLayer.appendChild(key);
      whiteCount++;
    }
  }

  elements.piano.innerHTML = '';
  elements.piano.appendChild(whiteLayer);
  for (const key of blackKeys) elements.piano.appendChild(key);
  updatePianoActiveStates();
}

function createPianoKey(slot, midi, isBlack) {
  const key = document.createElement('button');
  key.type = 'button';
  key.className = `piano-key ${isBlack ? 'black' : 'white'}`;
  key.dataset.slot = String(slot);
  key.setAttribute('aria-label', `${midiToNoteName(midi)}，键盘 ${mapping[slot]?.label || '未映射'}`);

  const noteLabel = document.createElement('span');
  noteLabel.className = 'key-note';
  noteLabel.textContent = midiToNoteName(midi);

  const bindingLabel = document.createElement('span');
  bindingLabel.className = 'key-binding';
  bindingLabel.textContent = mapping[slot]?.label || '—';

  key.append(noteLabel, bindingLabel);
  return key;
}

function renderMapping() {
  const fragment = document.createDocumentFragment();

  for (let slot = 0; slot < KEY_COUNT; slot++) {
    const item = document.createElement('div');
    item.className = 'mapping-item';

    const note = document.createElement('span');
    note.className = 'mapping-note';
    note.textContent = midiToNoteName(slotToMidi(slot));

    const keyButton = document.createElement('button');
    keyButton.type = 'button';
    keyButton.className = 'mapping-key';
    keyButton.dataset.slot = String(slot);
    keyButton.textContent = mapping[slot]?.label || '未映射';
    keyButton.title = `修改 ${note.textContent} 的键盘映射`;
    keyButton.classList.toggle('is-empty', !mapping[slot]);
    keyButton.classList.toggle(
      'is-capturing',
      captureTarget?.type === 'note' && captureTarget.slot === slot
    );

    item.append(note, keyButton);
    fragment.appendChild(item);
  }

  elements.mappingGrid.innerHTML = '';
  elements.mappingGrid.appendChild(fragment);
  elements.sustainMappingKey.textContent = sustainMapping?.label || '未映射';
  elements.sustainShortcut.textContent = sustainMapping?.label || '未映射';
  elements.sustainMappingKey.classList.toggle('is-empty', !sustainMapping);
  elements.sustainMappingKey.classList.toggle(
    'is-capturing',
    captureTarget?.type === 'sustain'
  );
}

function renderRange() {
  elements.octaveRange.textContent =
    `${midiToNoteName(slotToMidi(0))} – ${midiToNoteName(slotToMidi(KEY_COUNT - 1))}`;
  elements.octaveDown.disabled = octaveShift <= MIN_OCTAVE_SHIFT;
  elements.octaveUp.disabled = octaveShift >= MAX_OCTAVE_SHIFT;
}

function refreshNoteLabels() {
  renderRange();
  renderPiano();
  renderMapping();
}

function sourceForPointer(event) {
  return `pointer:${event.pointerId}`;
}

async function pressSlot(slot, source, velocity = 0.86) {
  if (sourceNotes.has(source)) return;

  const midi = slotToMidi(slot);
  sourceNotes.set(source, midi);
  if (!noteSources.has(midi)) noteSources.set(midi, new Set());
  const sources = noteSources.get(midi);
  const isFirstSource = sources.size === 0;
  sources.add(source);
  sustainedNotes.delete(midi);
  updatePianoActiveStates();
  updateNowPlaying();

  if (!isFirstSource) return;
  try {
    await ensureAudio();
    if (!noteSources.get(midi)?.has(source)) return;
    const voiceInstrument = instrument;
    voiceInstruments.set(midi, voiceInstrument);
    voiceInstrument.triggerAttack(
      Tone.Frequency(midi, 'midi').toNote(),
      Tone.now(),
      velocity
    );
  } catch (error) {
    setAudioStatus(`音频启动失败：${error.message}`, false);
  }
}

function releaseSource(source) {
  const midi = sourceNotes.get(source);
  if (midi === undefined) return;
  sourceNotes.delete(source);

  const sources = noteSources.get(midi);
  if (sources) {
    sources.delete(source);
    if (sources.size === 0) {
      noteSources.delete(midi);
      if (sustainEnabled) {
        sustainedNotes.add(midi);
      } else {
        releaseMidi(midi);
      }
    }
  }
  updatePianoActiveStates();
  updateNowPlaying();
}

function releaseMidi(midi) {
  const voiceInstrument = voiceInstruments.get(midi) || instrument;
  try {
    voiceInstrument.triggerRelease(Tone.Frequency(midi, 'midi').toNote());
  } catch (_) {}
  voiceInstruments.delete(midi);
  sustainedNotes.delete(midi);
}

function releaseAll() {
  sourceNotes.clear();
  noteSources.clear();
  sustainedNotes.clear();
  pressedCodes.clear();
  try {
    fallbackSynth.releaseAll();
    pianoSampler.releaseAll();
  } catch (_) {}
  voiceInstruments.clear();
  updatePianoActiveStates();
  updateNowPlaying();
}

function updatePianoActiveStates() {
  document.querySelectorAll('.piano-key').forEach(key => {
    const midi = slotToMidi(Number(key.dataset.slot));
    key.classList.toggle(
      'active',
      noteSources.has(midi) || sustainedNotes.has(midi)
    );
  });
}

function updateNowPlaying() {
  const activeMidis = [...new Set([
    ...noteSources.keys(),
    ...sustainedNotes,
  ])].sort((a, b) => a - b);
  elements.nowPlaying.textContent = activeMidis.length
    ? activeMidis.map(midiToNoteName).join(' · ')
    : '—';
}

function setSustain(enabled) {
  sustainEnabled = enabled;
  elements.sustainButton.setAttribute('aria-pressed', String(enabled));
  elements.sustainState.textContent = enabled ? '开启' : '关闭';

  if (!enabled) {
    for (const midi of [...sustainedNotes]) {
      if (!noteSources.has(midi)) releaseMidi(midi);
    }
    updatePianoActiveStates();
    updateNowPlaying();
  }
}

function startCapture(target) {
  releaseAll();
  setSustain(false);
  captureTarget = target;
  elements.captureNote.textContent = target.type === 'sustain'
    ? '延音踏板'
    : midiToNoteName(slotToMidi(target.slot));
  elements.captureBanner.hidden = false;
  renderMapping();
}

function cancelCapture() {
  captureTarget = null;
  elements.captureBanner.hidden = true;
  renderMapping();
}

function assignCapturedKey(code) {
  if (captureTarget === null) return;

  const target = captureTarget;
  const nextMapping = {
    code,
    label: codeToLabel(code),
  };
  const conflictSlot = mapping.findIndex(item => item?.code === code);
  const conflictsWithSustain = sustainMapping?.code === code;

  if (target.type === 'sustain') {
    const oldSustainMapping = sustainMapping;
    sustainMapping = nextMapping;
    if (conflictSlot >= 0) mapping[conflictSlot] = oldSustainMapping;
    saveMapping(
      conflictSlot >= 0
        ? `已交换延音踏板与 ${midiToNoteName(slotToMidi(conflictSlot))} 的映射。`
        : `延音踏板已映射为 ${nextMapping.label}。`
    );
  } else {
    const targetSlot = target.slot;
    const oldTargetMapping = mapping[targetSlot];
    const otherNoteSlot = mapping.findIndex((item, slot) =>
      slot !== targetSlot && item?.code === code
    );
    mapping[targetSlot] = nextMapping;

    if (otherNoteSlot >= 0) {
      mapping[otherNoteSlot] = oldTargetMapping;
      saveMapping(
        `已交换 ${midiToNoteName(slotToMidi(targetSlot))} 与 ${midiToNoteName(slotToMidi(otherNoteSlot))} 的映射。`
      );
    } else if (conflictsWithSustain) {
      sustainMapping = oldTargetMapping;
      saveMapping(`已交换 ${midiToNoteName(slotToMidi(targetSlot))} 与延音踏板的映射。`);
    } else {
      saveMapping(`${midiToNoteName(slotToMidi(targetSlot))} 已映射为 ${nextMapping.label}。`);
    }
  }

  captureTarget = null;
  elements.captureBanner.hidden = true;
  renderMapping();
  renderPiano();
}

function handleCaptureKey(event) {
  event.preventDefault();
  event.stopPropagation();

  if (event.code === 'Escape') {
    cancelCapture();
    return;
  }
  if (event.ctrlKey || event.altKey || event.metaKey ||
      BLOCKED_MAPPING_CODES.has(event.code)) {
    elements.mappingSaveStatus.textContent = '该按键或组合键不能用于演奏映射。';
    return;
  }
  assignCapturedKey(event.code);
}

function findSlotByCode(code) {
  return mapping.findIndex(item => item?.code === code);
}

function changeOctave(delta) {
  const next = Math.max(
    MIN_OCTAVE_SHIFT,
    Math.min(MAX_OCTAVE_SHIFT, octaveShift + delta)
  );
  if (next === octaveShift) return;
  releaseAll();
  octaveShift = next;
  refreshNoteLabels();
}

function initializeTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
  document.body.classList.toggle('light', savedTheme ? savedTheme === 'light' : prefersLight);
  updateThemeIcon();
}

function updateThemeIcon() {
  const isLight = document.body.classList.contains('light');
  elements.themeToggle.querySelector('.theme-icon').textContent = isLight ? '☾' : '☀';
}

elements.piano.addEventListener('pointerdown', event => {
  const key = event.target.closest('.piano-key');
  if (!key) return;
  event.preventDefault();
  key.blur();
  key.setPointerCapture(event.pointerId);
  pressSlot(Number(key.dataset.slot), sourceForPointer(event), 0.9);
});

for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  elements.piano.addEventListener(eventName, event => {
    releaseSource(sourceForPointer(event));
  });
}

elements.mappingGrid.addEventListener('click', event => {
  const button = event.target.closest('.mapping-key');
  if (!button) return;
  startCapture({ type: 'note', slot: Number(button.dataset.slot) });
});

document.addEventListener('keydown', event => {
  if (captureTarget !== null) {
    handleCaptureKey(event);
    return;
  }

  if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
  const targetTag = event.target.tagName;
  if (targetTag === 'INPUT' || targetTag === 'SELECT' || targetTag === 'TEXTAREA') return;

  if (sustainMapping?.code === event.code) {
    event.preventDefault();
    if (event.repeat || sustainKeyboardPressed) return;
    sustainKeyboardPressed = true;
    setSustain(true);
    return;
  }

  const slot = findSlotByCode(event.code);
  if (slot < 0) return;
  event.preventDefault();
  if (event.repeat || pressedCodes.has(event.code)) return;
  pressedCodes.add(event.code);
  pressSlot(slot, `keyboard:${event.code}`);
});

document.addEventListener('keyup', event => {
  if (sustainKeyboardPressed && sustainMapping?.code === event.code) {
    event.preventDefault();
    sustainKeyboardPressed = false;
    setSustain(false);
    return;
  }
  if (!pressedCodes.has(event.code)) return;
  event.preventDefault();
  pressedCodes.delete(event.code);
  releaseSource(`keyboard:${event.code}`);
});

elements.captureCancel.addEventListener('click', cancelCapture);
elements.sustainMappingKey.addEventListener('click', () => {
  startCapture({ type: 'sustain' });
});
elements.resetMappingButton.addEventListener('click', () => {
  cancelCapture();
  sustainKeyboardPressed = false;
  setSustain(false);
  releaseAll();
  mapping = cloneDefaultMapping();
  sustainMapping = { ...DEFAULT_SUSTAIN_MAPPING };
  saveMapping('已恢复默认键盘映射。');
  renderMapping();
  renderPiano();
});
elements.clearMappingButton.addEventListener('click', () => {
  cancelCapture();
  sustainKeyboardPressed = false;
  setSustain(false);
  releaseAll();
  mapping = new Array(KEY_COUNT).fill(null);
  sustainMapping = null;
  saveMapping('已清空全部键盘映射。');
  renderMapping();
  renderPiano();
});
elements.octaveDown.addEventListener('click', () => changeOctave(-1));
elements.octaveUp.addEventListener('click', () => changeOctave(1));
elements.sustainButton.addEventListener('click', () => setSustain(!sustainEnabled));
elements.releaseAllButton.addEventListener('click', () => {
  sustainKeyboardPressed = false;
  setSustain(false);
  releaseAll();
});
elements.volumeSlider.addEventListener('input', event => {
  const value = Number(event.target.value);
  masterVolume.volume.rampTo(value, 0.05);
  elements.volumeValue.value = `${value} dB`;
  elements.volumeValue.textContent = `${value} dB`;
});
elements.themeToggle.addEventListener('click', () => {
  const isLight = document.body.classList.toggle('light');
  localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark');
  updateThemeIcon();
});

window.addEventListener('blur', () => {
  sustainKeyboardPressed = false;
  setSustain(false);
  releaseAll();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    sustainKeyboardPressed = false;
    setSustain(false);
    releaseAll();
  }
});

initializeTheme();
renderRange();
renderPiano();
renderMapping();
