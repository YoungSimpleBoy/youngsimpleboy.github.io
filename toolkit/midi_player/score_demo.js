// ==================== State ====================
let currentMidi = null;
let currentFileName = '';
let vrvToolkit = null;
let vrvReady = null;

// ==================== Playback State ====================
let playbackState = 'stopped'; // 'stopped' | 'playing' | 'paused'
let toneSynth = null;
let animFrameId = null;
let totalDuration = 0;
let lastHighlighted = new Set();

// ==================== Paging State ====================
let currentPage = 1;
let totalPages = 1;
let allPageSVGs = [];       // post-processed SVG strings per page
let pageNoteIds = [];       // pageNoteIds[p-1] = Set of element IDs on page p
let playbackTrackIdx = -1;  // which original MIDI track is loaded for playback
let lastManualPageTime = 0; // timestamp of last manual page change (suppress auto-turn)
let timeCalibration = [];   // sorted [{midiSec, vrvSec}] for MIDI↔Verovio time mapping

// ==================== GM Instrument System ====================
const GM_PROGRAM_IDS = [
    'acoustic_grand_piano', 'bright_acoustic_piano', 'electric_grand_piano', 'honkytonk_piano', 'electric_piano_1', 'electric_piano_2', 'harpsichord', 'clavinet',
    'celesta', 'glockenspiel', 'music_box', 'vibraphone', 'marimba', 'xylophone', 'tubular_bells', 'dulcimer',
    'drawbar_organ', 'percussive_organ', 'rock_organ', 'church_organ', 'reed_organ', 'accordion', 'harmonica', 'tango_accordion',
    'acoustic_guitar_nylon', 'acoustic_guitar_steel', 'electric_guitar_jazz', 'electric_guitar_clean', 'electric_guitar_muted', 'overdriven_guitar', 'distortion_guitar', 'guitar_harmonics',
    'acoustic_bass', 'electric_bass_finger', 'electric_bass_pick', 'fretless_bass', 'slap_bass_1', 'slap_bass_2', 'synth_bass_1', 'synth_bass_2',
    'violin', 'viola', 'cello', 'contrabass', 'tremolo_strings', 'pizzicato_strings', 'orchestral_harp', 'timpani',
    'string_ensemble_1', 'string_ensemble_2', 'synth_strings_1', 'synth_strings_2', 'choir_aahs', 'voice_oohs', 'synth_voice', 'orchestra_hit',
    'trumpet', 'trombone', 'tuba', 'muted_trumpet', 'french_horn', 'brass_section', 'synth_brass_1', 'synth_brass_2',
    'soprano_sax', 'alto_sax', 'tenor_sax', 'baritone_sax', 'oboe', 'english_horn', 'bassoon', 'clarinet',
    'piccolo', 'flute', 'recorder', 'pan_flute', 'blown_bottle', 'shakuhachi', 'whistle', 'ocarina',
    'lead_1_square', 'lead_2_sawtooth', 'lead_3_calliope', 'lead_4_chiff', 'lead_5_charang', 'lead_6_voice', 'lead_7_fifths', 'lead_8_bass_lead',
    'pad_1_new_age', 'pad_2_warm', 'pad_3_polysynth', 'pad_4_choir', 'pad_5_bowed', 'pad_6_metallic', 'pad_7_halo', 'pad_8_sweep',
    'fx_1_rain', 'fx_2_soundtrack', 'fx_3_crystal', 'fx_4_atmosphere', 'fx_5_brightness', 'fx_6_goblins', 'fx_7_echoes', 'fx_8_scifi',
    'sitar', 'banjo', 'shamisen', 'koto', 'kalimba', 'bagpipe', 'fiddle', 'shanai',
    'tinkle_bell', 'agogo', 'steel_drums', 'woodblock', 'taiko_drum', 'melodic_tom', 'synth_drum', 'reverse_cymbal',
    'guitar_fret_noise', 'breath_noise', 'seashore', 'bird_tweet', 'telephone_ring', 'helicopter', 'applause', 'gunshot'
];
const GM_SOUNDFONT_BASE_URL = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/';
const GM_SPARSE_SAMPLE_URLS = {
    'A0': 'A0.mp3', 'C1': 'C1.mp3', 'D#1': 'Eb1.mp3', 'F#1': 'Gb1.mp3',
    'A1': 'A1.mp3', 'C2': 'C2.mp3', 'D#2': 'Eb2.mp3', 'F#2': 'Gb2.mp3',
    'A2': 'A2.mp3', 'C3': 'C3.mp3', 'D#3': 'Eb3.mp3', 'F#3': 'Gb3.mp3',
    'A3': 'A3.mp3', 'C4': 'C4.mp3', 'D#4': 'Eb4.mp3', 'F#4': 'Gb4.mp3',
    'A4': 'A4.mp3', 'C5': 'C5.mp3', 'D#5': 'Eb5.mp3', 'F#5': 'Gb5.mp3',
    'A5': 'A5.mp3', 'C6': 'C6.mp3', 'D#6': 'Eb6.mp3', 'F#6': 'Gb6.mp3',
    'A6': 'A6.mp3', 'C7': 'C7.mp3', 'D#7': 'Eb7.mp3', 'F#7': 'Gb7.mp3',
    'A7': 'A7.mp3', 'C8': 'C8.mp3'
};
const masterVolume = new Tone.Volume(-6).toDestination();
const reverb = new Tone.Reverb({ decay: 2, wet: 0.2 }).connect(masterVolume);
const instrumentPool = {};

function getTrackInstrumentType(track) {
  if (!track) return 'default';
  if (track.notes?.[0]?.channel === 9) return 'gm_drum';
  if (track.instrument && typeof track.instrument === 'object') {
    if (track.instrument.percussion) return 'gm_drum';
    const prog = track.instrument.number;
    if (typeof prog === 'number' && prog >= 0 && prog < GM_PROGRAM_IDS.length) {
      return `gm:${prog}`;
    }
  }
  return 'default';
}

async function getInstrumentInstance(type) {
  if (instrumentPool[type]) return instrumentPool[type];
  let inst;
  if (type === 'gm_drum') {
    inst = new Tone.PolySynth(Tone.MembraneSynth, {
      envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.15 }
    });
  } else if (type.startsWith('gm:')) {
    const program = parseInt(type.slice(3), 10);
    const gmId = GM_PROGRAM_IDS[program];
    if (!gmId) {
      inst = new Tone.PolySynth(Tone.Synth, { maxPolyphony: 32 });
    } else {
      const gmName = GM_NAMES[program] || gmId;
      setStatus(`正在加载 GM 音色: ${gmName}...`);
      inst = new Tone.Sampler({
        urls: GM_SPARSE_SAMPLE_URLS,
        release: 1.1,
        baseUrl: `${GM_SOUNDFONT_BASE_URL}${gmId}-mp3/`,
        onload: () => {
          inst.volume.value = 6;
        }
      });
    }
  } else {
    inst = new Tone.PolySynth(Tone.Synth, { maxPolyphony: 32 });
  }
  inst.connect(reverb);
  instrumentPool[type] = inst;
  if (typeof inst.loaded === 'boolean' && !inst.loaded) {
    try {
      await Tone.loaded();
    } catch (err) {
      console.warn('Soundfont load failed, fallback:', type, err);
      if (!instrumentPool['default']) {
        instrumentPool['default'] = new Tone.PolySynth(Tone.Synth, { maxPolyphony: 32 }).connect(reverb);
      }
      instrumentPool[type] = instrumentPool['default'];
      return instrumentPool[type];
    }
  }
  return inst;
}

// ==================== Theme ====================
document.getElementById('themeToggle').addEventListener('click', () => {
  const isLight = document.body.classList.toggle('light');
  document.getElementById('themeToggle').textContent = isLight ? '\u263d \u5207\u6362\u4e3b\u9898' : '\u2600 \u5207\u6362\u4e3b\u9898';
});

// ==================== Status ====================
function setStatus(msg) {
  document.getElementById('statusMsg').textContent = msg;
}

// ==================== MIDI Loading ====================
function parseMidi(buffer) {
  try {
    const midi = new Midi(buffer);
    currentMidi = midi;
    updateTrackSelect(midi);
    const dur = Math.ceil(midi.duration);
    const total = midi.tracks.reduce((s, t) => s + t.notes.length, 0);
    setStatus(`\u5df2\u52a0\u8f7d\uff1a${midi.tracks.length} \u8f68\uff0c\u5171 ${total} \u4e2a\u97f3\u7b26\uff0c\u65f6\u957f\u7ea6 ${dur} \u79d2`);
    document.getElementById('renderBtn').disabled = false;
  } catch (e) {
    setStatus('MIDI \u89e3\u6790\u5931\u8d25\uff1a' + e.message);
    console.error(e);
  }
}

document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  currentFileName = file.name.replace(/\.(mid|midi)$/i, '');
  setStatus('\u6b63\u5728\u89e3\u6790...');
  const reader = new FileReader();
  reader.onload = (evt) => parseMidi(evt.target.result);
  reader.readAsArrayBuffer(file);
  e.target.value = '';
});

document.getElementById('exampleSelect').addEventListener('change', async (e) => {
  const url = e.target.value;
  if (!url) return;
  setStatus('\u6b63\u5728\u52a0\u8f7d\u793a\u4f8b...');
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const buffer = await resp.arrayBuffer();
    currentFileName = url.split('/').pop().replace(/\.(mid|midi)$/i, '');
    parseMidi(buffer);
  } catch (err) {
    setStatus('\u52a0\u8f7d\u793a\u4f8b\u5931\u8d25\uff1a' + err.message);
  }
});

// ==================== Track Select ====================
function updateTrackSelect(midi) {
  const sel = document.getElementById('trackSelect');
  sel.innerHTML = '';
  let hasTrack = false;
  midi.tracks.forEach((track, i) => {
    if (!track.notes.length) return;
    const name = track.name || track.instrument?.name || `\u97f3\u8f68 ${i + 1}`;
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `[${i + 1}] ${name}\uff08${track.notes.length} \u97f3\u7b26\uff09`;
    sel.appendChild(opt);
    hasTrack = true;
  });
  if (!hasTrack) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '\u65e0\u53ef\u7528\u97f3\u8f68';
    sel.appendChild(opt);
  }
  sel.disabled = false;
}

// ==================== Piano Mode UI ====================
document.getElementById('pianoMode').addEventListener('change', (e) => {
  const show = e.target.checked;
  document.querySelectorAll('.piano-opt').forEach(el => {
    el.style.display = show ? '' : 'none';
  });
});

// ==================== Verovio Initialization ====================
function getVerovio() {
  if (vrvToolkit) return Promise.resolve(vrvToolkit);
  if (vrvReady) return vrvReady;

  vrvReady = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!vrvToolkit) reject(new Error('Verovio WASM \u52a0\u8f7d\u8d85\u65f6\uff0830\u79d2\uff09'));
    }, 30000);

    function attempt() {
      if (typeof verovio === 'undefined') {
        setTimeout(attempt, 100);
        return;
      }
      try {
        vrvToolkit = new verovio.toolkit();
        clearTimeout(timeout);
        resolve(vrvToolkit);
      } catch (_e) {
        // WASM binary not compiled yet — register callback
        if (verovio.module) {
          verovio.module.onRuntimeInitialized = () => {
            try {
              vrvToolkit = new verovio.toolkit();
              clearTimeout(timeout);
              resolve(vrvToolkit);
            } catch (err) {
              clearTimeout(timeout);
              reject(err);
            }
          };
        } else {
          setTimeout(attempt, 200);
        }
      }
    }
    attempt();
  });
  return vrvReady;
}

// ==================== MIDI → MusicXML ====================
const DIVISIONS = 4; // divisions per quarter note (16th-note resolution)

// Standard note durations in divisions (descending), for greedy decomposition
const STD_DURS = [
  { d: 16, type: 'whole', dot: false },
  { d: 12, type: 'half', dot: true },
  { d: 8, type: 'half', dot: false },
  { d: 6, type: 'quarter', dot: true },
  { d: 4, type: 'quarter', dot: false },
  { d: 3, type: 'eighth', dot: true },
  { d: 2, type: 'eighth', dot: false },
  { d: 1, type: '16th', dot: false },
];

function decompDuration(dur) {
  const parts = [];
  let rem = dur;
  while (rem > 0) {
    const fit = STD_DURS.find(s => s.d <= rem);
    if (!fit) break;
    parts.push(fit);
    rem -= fit.d;
  }
  return parts;
}

// Key-aware enharmonic spelling: flat keys → flats, sharp keys → sharps
function midiToPitch(num, keyFifths) {
  const SHARP = [
    { step: 'C', alter: 0 }, { step: 'C', alter: 1 },
    { step: 'D', alter: 0 }, { step: 'D', alter: 1 },
    { step: 'E', alter: 0 }, { step: 'F', alter: 0 },
    { step: 'F', alter: 1 }, { step: 'G', alter: 0 },
    { step: 'G', alter: 1 }, { step: 'A', alter: 0 },
    { step: 'A', alter: 1 }, { step: 'B', alter: 0 },
  ];
  const FLAT = [
    { step: 'C', alter: 0 }, { step: 'D', alter: -1 },
    { step: 'D', alter: 0 }, { step: 'E', alter: -1 },
    { step: 'E', alter: 0 }, { step: 'F', alter: 0 },
    { step: 'G', alter: -1 }, { step: 'G', alter: 0 },
    { step: 'A', alter: -1 }, { step: 'A', alter: 0 },
    { step: 'B', alter: -1 }, { step: 'B', alter: 0 },
  ];
  const table = (keyFifths || 0) < 0 ? FLAT : SHARP;
  return { ...table[num % 12], octave: Math.floor(num / 12) - 1 };
}

function bestClef(notes) {
  if (!notes.length) return { sign: 'G', line: 2 };
  const avg = notes.reduce((s, n) => s + n.midi, 0) / notes.length;
  return avg >= 55 ? { sign: 'G', line: 2 } : { sign: 'F', line: 4 };
}

// Snap note onsets/offsets to the quantization grid
function quantizeNotes(trackNotes, ppq) {
  const grid = ppq / DIVISIONS;
  return trackNotes
    .map(n => {
      const qs = Math.round(n.ticks / grid);
      const qe = Math.round((n.ticks + n.durationTicks) / grid);
      return { qStart: qs, qEnd: Math.max(qe, qs + 1), midi: n.midi };
    })
    .sort((a, b) => a.qStart - b.qStart || a.midi - b.midi);
}

// Build measure map that respects mid-piece time-signature changes
function buildMeasureMap(timeSigEvents, ppq, totalDivisions) {
  const tsList = (timeSigEvents || []).map(ts => ({
    divStart: Math.round(ts.ticks * DIVISIONS / ppq),
    beats: ts.timeSignature[0],
    beatType: ts.timeSignature[1],
  }));
  if (tsList.length === 0) tsList.push({ divStart: 0, beats: 4, beatType: 4 });

  const measures = [];
  let pos = 0;
  let tsIdx = 0;

  while (pos <= totalDivisions) {
    while (tsIdx < tsList.length - 1 && tsList[tsIdx + 1].divStart <= pos) tsIdx++;
    const { beats, beatType } = tsList[tsIdx];
    const mLen = DIVISIONS * beats * 4 / beatType;
    const tsChanged = measures.length === 0 ||
      measures[measures.length - 1].beats !== beats ||
      measures[measures.length - 1].beatType !== beatType;
    measures.push({ start: pos, len: mLen, beats, beatType, tsChanged });
    pos += mLen;
  }
  return measures;
}

// Build tempo events in division coordinates
function buildTempoMap(tempoEvents, ppq) {
  const map = (tempoEvents || []).map(t => ({
    divStart: Math.round((t.ticks || 0) * DIVISIONS / ppq),
    bpm: t.bpm,
  }));
  if (map.length === 0) map.push({ divStart: 0, bpm: 120 });
  return map;
}

// Convert a quantized division position to milliseconds using the tempo map
// This produces the EXACT same timeline Verovio uses internally
function divisionToMs(divPos, tempos) {
  let ms = 0, pos = 0, tidx = 0;
  const sorted = tempos.length > 1
    ? [...tempos].sort((a, b) => a.divStart - b.divStart)
    : tempos;
  while (pos < divPos) {
    while (tidx < sorted.length - 1 && sorted[tidx + 1].divStart <= pos) tidx++;
    const nextChange = (tidx < sorted.length - 1) ? sorted[tidx + 1].divStart : Infinity;
    const end = Math.min(divPos, nextChange);
    // divisions / DIVISIONS = quarter notes; quarter notes * 60000/bpm = ms
    ms += ((end - pos) / DIVISIONS) * (60000 / sorted[tidx].bpm);
    pos = end;
  }
  return ms;
}

// ==================== Time Calibration (MIDI ↔ Verovio) ====================
// Build a piecewise mapping between original MIDI time (seconds) and Verovio's
// internal time by computing divisionToMs for each note's quantized position.
// This is deterministic — no heuristic matching needed.
function buildTimeCalibration(trackNotes, ppq, tempoEvents) {
  const grid = ppq / DIVISIONS;
  const tempos = buildTempoMap(tempoEvents, ppq);
  const raw = [{ midiSec: 0, vrvSec: 0 }];
  for (const note of trackNotes) {
    const qStart = Math.round(note.ticks / grid);
    const vrvMs = divisionToMs(qStart, tempos);
    raw.push({ midiSec: note.time, vrvSec: vrvMs / 1000 });
  }
  raw.sort((a, b) => a.midiSec - b.midiSec);
  // Deduplicate and ensure strict monotonicity
  const cal = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    if (raw[i].midiSec > cal[cal.length - 1].midiSec &&
        raw[i].vrvSec >= cal[cal.length - 1].vrvSec) {
      cal.push(raw[i]);
    }
  }
  return cal;
}

// Piecewise linear interpolation: MIDI seconds → Verovio milliseconds
function midiSecToVrvMs(sec) {
  const cal = timeCalibration;
  if (cal.length < 2) return sec * 1000;
  if (sec <= cal[0].midiSec) return cal[0].vrvSec * 1000;
  if (sec >= cal[cal.length - 1].midiSec) {
    // Extrapolate from last segment
    const a = cal[cal.length - 2], b = cal[cal.length - 1];
    const span = b.midiSec - a.midiSec;
    if (span <= 0) return b.vrvSec * 1000;
    const slope = (b.vrvSec - a.vrvSec) / span;
    return (b.vrvSec + slope * (sec - b.midiSec)) * 1000;
  }
  let lo = 0, hi = cal.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cal[mid].midiSec <= sec) lo = mid; else hi = mid;
  }
  const a = cal[lo], b = cal[hi];
  const span = b.midiSec - a.midiSec;
  if (span <= 0) return a.vrvSec * 1000;
  const t = (sec - a.midiSec) / span;
  return (a.vrvSec + t * (b.vrvSec - a.vrvSec)) * 1000;
}

// Piecewise linear interpolation: Verovio milliseconds → MIDI seconds
function vrvMsToMidiSec(vrvMs) {
  const cal = timeCalibration;
  if (cal.length < 2) return vrvMs / 1000;
  const vs = vrvMs / 1000;
  if (vs <= cal[0].vrvSec) return cal[0].midiSec;
  if (vs >= cal[cal.length - 1].vrvSec) {
    const a = cal[cal.length - 2], b = cal[cal.length - 1];
    const span = b.vrvSec - a.vrvSec;
    if (span <= 0) return b.midiSec;
    const slope = (b.midiSec - a.midiSec) / span;
    return b.midiSec + slope * (vs - b.vrvSec);
  }
  let lo = 0, hi = cal.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cal[mid].vrvSec <= vs) lo = mid; else hi = mid;
  }
  const a = cal[lo], b = cal[hi];
  const span = b.vrvSec - a.vrvSec;
  if (span <= 0) return a.midiSec;
  const t = (vs - a.vrvSec) / span;
  return a.midiSec + t * (b.midiSec - a.midiSec);
}

// Slice notes at measure boundaries, inserting tie markers
function sliceAtMeasures(notes, measures) {
  const out = [];
  for (const n of notes) {
    let s = n.qStart;
    while (s < n.qEnd) {
      let mIdx = measures.length - 1;
      for (let i = 0; i < measures.length; i++) {
        if (s < measures[i].start + measures[i].len) { mIdx = i; break; }
      }
      const mEnd = measures[mIdx].start + measures[mIdx].len;
      const e = Math.min(n.qEnd, mEnd);
      out.push({
        qStart: s, qEnd: e, midi: n.midi,
        tieStop: s > n.qStart,
        tieStart: e < n.qEnd,
      });
      s = e;
    }
  }
  return out;
}

// ---- Voice Separation ----
// Split overlapping notes into up to 2 independent voices so that
// long sustained notes are not chopped by short accompaniment notes.
function separateVoices(measureNotes) {
  if (measureNotes.length === 0) return [[], []];

  const onsets = new Map();
  for (const n of measureNotes) {
    if (!onsets.has(n.qStart)) onsets.set(n.qStart, []);
    onsets.get(n.qStart).push(n);
  }

  const v1 = [], v2 = [];
  let v1End = -Infinity, v2End = -Infinity;
  const sortedTimes = [...onsets.keys()].sort((a, b) => a - b);

  for (const t of sortedTimes) {
    const group = onsets.get(t);
    const durSet = new Set(group.map(n => n.qEnd - n.qStart));

    if (durSet.size === 1) {
      // All notes share the same duration → chord in one voice
      if (t >= v1End) {
        v1.push(...group);
        v1End = Math.max(v1End, ...group.map(n => n.qEnd));
      } else if (t >= v2End) {
        v2.push(...group);
        v2End = Math.max(v2End, ...group.map(n => n.qEnd));
      } else {
        v1.push(...group);
        v1End = Math.max(v1End, ...group.map(n => n.qEnd));
      }
    } else {
      // Different durations → longest notes ⇒ voice 1, shorter ⇒ voice 2
      const maxDur = Math.max(...[...durSet]);
      for (const n of group) {
        if ((n.qEnd - n.qStart) === maxDur) {
          v1.push(n);
          v1End = Math.max(v1End, n.qEnd);
        } else {
          v2.push(n);
          v2End = Math.max(v2End, n.qEnd);
        }
      }
    }
  }
  return [v1, v2];
}

// ---- Single-Voice XML Emitter ----
// tempoEvents: optional array of {divStart, bpm} for mid-measure tempo changes (voice 1 only)
function emitVoiceXML(voiceNotes, mStart, mLen, voiceNum, staffNum, keyFifths, forceStem, tempoEvents) {
  const sorted = voiceNotes
    .filter(n => n.qStart >= mStart && n.qStart < mStart + mLen)
    .sort((a, b) => a.qStart - b.qStart || a.midi - b.midi);
  let xml = '';
  let cursor = 0;
  const mTempos = tempoEvents || [];
  let tIdx = 0;

  // Emit <direction><sound tempo> for all tempo events up to (and including) absPos
  function emitTemposUpTo(absPos) {
    while (tIdx < mTempos.length && mTempos[tIdx].divStart <= absPos) {
      const t = mTempos[tIdx++];
      xml += `<direction placement="above"><direction-type><words/></direction-type>`;
      xml += `<sound tempo="${t.bpm}"/></direction>`;
    }
  }

  function noteXML(opts) {
    let s = '<note>';
    if (opts.chord) s += '<chord/>';
    if (opts.isRest) {
      s += '<rest/>';
    } else {
      const p = midiToPitch(opts.midi, keyFifths);
      s += `<pitch><step>${p.step}</step>`;
      if (p.alter) s += `<alter>${p.alter}</alter>`;
      s += `<octave>${p.octave}</octave></pitch>`;
    }
    s += `<duration>${opts.d}</duration>`;
    if (opts.tieStop) s += '<tie type="stop"/>';
    if (opts.tieStart) s += '<tie type="start"/>';
    s += `<voice>${voiceNum}</voice>`;
    s += `<type>${opts.type}</type>`;
    if (opts.dot) s += '<dot/>';
    if (forceStem && !opts.isRest) {
      s += (voiceNum % 2 === 1) ? '<stem>up</stem>' : '<stem>down</stem>';
    }
    if (staffNum) s += `<staff>${staffNum}</staff>`;
    if (opts.tieStop || opts.tieStart) {
      s += '<notations>';
      if (opts.tieStop) s += '<tied type="stop"/>';
      if (opts.tieStart) s += '<tied type="start"/>';
      s += '</notations>';
    }
    s += '</note>';
    return s;
  }

  let i = 0;
  while (i < sorted.length) {
    const pos = sorted[i].qStart - mStart;
    if (cursor < pos) {
      for (const r of decompDuration(pos - cursor))
        xml += noteXML({ isRest: true, d: r.d, type: r.type, dot: r.dot });
      cursor = pos;
    }
    // Emit any pending tempo changes at or before this note position
    emitTemposUpTo(mStart + pos);
    const chord = [];
    while (i < sorted.length && sorted[i].qStart - mStart === pos) chord.push(sorted[i++]);
    const chordDur = Math.min(...chord.map(n => n.qEnd - n.qStart));
    const parts = decompDuration(chordDur);
    for (let dp = 0; dp < parts.length; dp++) {
      for (let ci = 0; ci < chord.length; ci++) {
        const n = chord[ci];
        xml += noteXML({
          midi: n.midi,
          d: parts[dp].d,
          type: parts[dp].type,
          dot: parts[dp].dot,
          chord: ci > 0,
          tieStop: dp === 0 ? n.tieStop : true,
          tieStart: dp === parts.length - 1 ? n.tieStart : true,
        });
      }
    }
    cursor = pos + chordDur;
  }
  // Emit any remaining tempo changes after last note
  emitTemposUpTo(mStart + mLen);
  if (cursor < mLen) {
    for (const r of decompDuration(mLen - cursor))
      xml += noteXML({ isRest: true, d: r.d, type: r.type, dot: r.dot });
  }
  return xml;
}

// ---- Main Converter ----
function midiToMusicXML(midi, trackIdx, isPiano, splitNote, title) {
  const ppq = midi.header.ppq;
  const track = midi.tracks[trackIdx];

  // Key signature
  const keySigs = midi.header.keySignatures || [];
  let keyFifths = 0;
  let keyMode = 'major';
  if (keySigs.length > 0) {
    const k = keySigs[0].key;
    keyMode = keySigs[0].scale || 'major';
    if (typeof k === 'number') {
      keyFifths = k;
    } else if (typeof k === 'string') {
      keyFifths = KEY_NAME_TO_FIFTHS[k] || 0;
      // @tonejs/midi gives the tonic name; minor keys share key sig with relative major
      // e.g. A minor → fifths=0 (same as C major), not fifths=3 (A major)
      if (keyMode === 'minor') keyFifths -= 3;
    }
  }

  // Quantize
  const qAll = quantizeNotes(track.notes, ppq);
  const maxEnd = qAll.reduce((m, n) => Math.max(m, n.qEnd), 0);

  // Measure map (dynamic time signatures)
  const measures = buildMeasureMap(midi.header.timeSignatures, ppq, maxEnd);
  // Tempo map
  const tempos = buildTempoMap(midi.header.tempos, ppq);

  // Split for piano or single staff
  const trebleQ = isPiano ? qAll.filter(n => n.midi >= splitNote) : qAll;
  const bassQ = isPiano ? qAll.filter(n => n.midi < splitNote) : null;
  const trebleSliced = sliceAtMeasures(trebleQ, measures);
  const bassSliced = bassQ ? sliceAtMeasures(bassQ, measures) : null;
  const sClef = isPiano ? null : bestClef(qAll);

  // XML header
  const safeTitle = (title || 'Untitled').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let x = '<?xml version="1.0" encoding="UTF-8"?>\n';
  x += '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" ';
  x += '"http://www.musicxml.org/dtds/partwise.dtd">\n';
  x += '<score-partwise version="4.0">\n';
  x += `<work><work-title>${safeTitle}</work-title></work>\n`;
  x += '<identification>';
  x += '<creator type="composer">MIDI Player</creator>';
  x += '<encoding><software>MIDI Player - Score Viewer</software></encoding>';
  x += '</identification>\n';
  x += '<part-list><score-part id="P1"><part-name>';
  const pName = isPiano ? 'Piano' : (getInstrumentName(track) || 'Voice');
  x += pName.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  x += '</part-name></score-part></part-list>\n';
  x += '<part id="P1">\n';

  for (let mi = 0; mi < measures.length; mi++) {
    const m = measures[mi];
    x += `<measure number="${mi + 1}">`;

    // Attributes: first measure or time-signature change
    if (mi === 0 || m.tsChanged) {
      x += '<attributes>';
      if (mi === 0) x += `<divisions>${DIVISIONS}</divisions>`;
      if (mi === 0) {
        x += `<key><fifths>${keyFifths}</fifths>`;
        if (keyMode === 'minor') x += '<mode>minor</mode>';
        x += '</key>';
      }
      x += `<time><beats>${m.beats}</beats><beat-type>${m.beatType}</beat-type></time>`;
      if (mi === 0) {
        if (isPiano) {
          x += '<staves>2</staves>';
          x += '<clef number="1"><sign>G</sign><line>2</line></clef>';
          x += '<clef number="2"><sign>F</sign><line>4</line></clef>';
        } else {
          x += `<clef><sign>${sClef.sign}</sign><line>${sClef.line}</line></clef>`;
        }
      }
      x += '</attributes>';
    }

    // Collect ALL tempo events in this measure
    const temposInMeasure = tempos.filter(t =>
      t.divStart >= m.start && t.divStart < m.start + m.len);
    // Ensure first measure always has a tempo
    if (mi === 0 && !temposInMeasure.some(t => t.divStart === m.start)) {
      temposInMeasure.unshift({ divStart: m.start, bpm: tempos[0].bpm });
    }
    temposInMeasure.sort((a, b) => a.divStart - b.divStart);

    // Emit measure-start tempos as visible metronome markings
    const startTempos = temposInMeasure.filter(t => t.divStart === m.start);
    const midTempos = temposInMeasure.filter(t => t.divStart > m.start);
    for (const t of startTempos) {
      x += '<direction placement="above"><direction-type>';
      x += `<metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(t.bpm)}</per-minute></metronome>`;
      x += `</direction-type><sound tempo="${t.bpm}"/></direction>`;
    }

    // --- Write voices ---
    // Pass mid-measure tempos to voice 1 only (first voice emitted)
    if (isPiano) {
      // Treble staff (voices 1 & 2)
      const tNotes = trebleSliced.filter(n =>
        n.qStart >= m.start && n.qStart < m.start + m.len);
      const [tv1, tv2] = separateVoices(tNotes);
      const tMulti = tv2.length > 0;
      x += emitVoiceXML(tv1, m.start, m.len, 1, 1, keyFifths, tMulti, midTempos);
      if (tMulti) {
        x += `<backup><duration>${m.len}</duration></backup>`;
        x += emitVoiceXML(tv2, m.start, m.len, 2, 1, keyFifths, true);
      }
      // Bass staff (voices 3 & 4)
      x += `<backup><duration>${m.len}</duration></backup>`;
      const bNotes = bassSliced.filter(n =>
        n.qStart >= m.start && n.qStart < m.start + m.len);
      const [bv1, bv2] = separateVoices(bNotes);
      const bMulti = bv2.length > 0;
      x += emitVoiceXML(bv1, m.start, m.len, 3, 2, keyFifths, bMulti);
      if (bMulti) {
        x += `<backup><duration>${m.len}</duration></backup>`;
        x += emitVoiceXML(bv2, m.start, m.len, 4, 2, keyFifths, true);
      }
    } else {
      // Single staff (voices 1 & 2)
      const notes = trebleSliced.filter(n =>
        n.qStart >= m.start && n.qStart < m.start + m.len);
      const [v1, v2] = separateVoices(notes);
      const multi = v2.length > 0;
      x += emitVoiceXML(v1, m.start, m.len, 1, null, keyFifths, multi, midTempos);
      if (multi) {
        x += `<backup><duration>${m.len}</duration></backup>`;
        x += emitVoiceXML(v2, m.start, m.len, 2, null, keyFifths, true);
      }
    }

    x += '</measure>\n';
  }
  x += '</part>\n</score-partwise>';
  return x;
}


// ==================== Metadata ====================
const KEY_NAME_TO_FIFTHS = {
  'Cb':-7,'Gb':-6,'Db':-5,'Ab':-4,'Eb':-3,'Bb':-2,'F':-1,
  'C':0,'G':1,'D':2,'A':3,'E':4,'B':5,'F#':6,'C#':7
};

const GM_NAMES = [
  'Acoustic Grand Piano','Bright Acoustic Piano','Electric Grand Piano','Honky-tonk Piano',
  'Electric Piano 1','Electric Piano 2','Harpsichord','Clavinet',
  'Celesta','Glockenspiel','Music Box','Vibraphone','Marimba','Xylophone','Tubular Bells','Dulcimer',
  'Drawbar Organ','Percussive Organ','Rock Organ','Church Organ','Reed Organ','Accordion','Harmonica','Tango Accordion',
  'Acoustic Guitar (nylon)','Acoustic Guitar (steel)','Electric Guitar (jazz)','Electric Guitar (clean)',
  'Electric Guitar (muted)','Overdriven Guitar','Distortion Guitar','Guitar Harmonics',
  'Acoustic Bass','Electric Bass (finger)','Electric Bass (pick)','Fretless Bass',
  'Slap Bass 1','Slap Bass 2','Synth Bass 1','Synth Bass 2',
  'Violin','Viola','Cello','Contrabass','Tremolo Strings','Pizzicato Strings','Orchestral Harp','Timpani',
  'String Ensemble 1','String Ensemble 2','Synth Strings 1','Synth Strings 2',
  'Choir Aahs','Voice Oohs','Synth Voice','Orchestra Hit',
  'Trumpet','Trombone','Tuba','Muted Trumpet','French Horn','Brass Section','Synth Brass 1','Synth Brass 2',
  'Soprano Sax','Alto Sax','Tenor Sax','Baritone Sax','Oboe','English Horn','Bassoon','Clarinet',
  'Piccolo','Flute','Recorder','Pan Flute','Blown Bottle','Shakuhachi','Whistle','Ocarina',
  'Lead 1','Lead 2','Lead 3','Lead 4','Lead 5','Lead 6','Lead 7','Lead 8',
  'Pad 1','Pad 2','Pad 3','Pad 4','Pad 5','Pad 6','Pad 7','Pad 8',
  'FX 1','FX 2','FX 3','FX 4','FX 5','FX 6','FX 7','FX 8',
  'Sitar','Banjo','Shamisen','Koto','Kalimba','Bag pipe','Fiddle','Shanai',
  'Tinkle Bell','Agogo','Steel Drums','Woodblock','Taiko Drum','Melodic Tom','Synth Drum','Reverse Cymbal',
  'Guitar Fret Noise','Breath Noise','Seashore','Bird Tweet','Telephone Ring','Helicopter','Applause','Gunshot'
];

function getInstrumentName(track) {
  if (track.notes?.[0]?.channel === 9) return 'Standard Drum Kit';
  if (track.instrument && typeof track.instrument === 'object') {
    if (track.instrument.percussion) return 'Standard Drum Kit';
    if (typeof track.instrument.name === 'string' && track.instrument.name.trim())
      return track.instrument.name.trim();
    const prog = track.instrument.number;
    if (typeof prog === 'number' && prog >= 0 && prog <= 127)
      return GM_NAMES[prog] || '';
  }
  return track.name?.trim() || '';
}

function getKeySigDisplay(keyFifths, keyMode) {
  const sharpKeys = ['C','G','D','A','E','B','F#','C#'];
  const flatKeys  = ['C','F','Bb','Eb','Ab','Db','Gb','Cb'];
  const name = keyFifths >= 0 ? (sharpKeys[keyFifths] || 'C') : (flatKeys[-keyFifths] || 'C');
  return name + (keyMode === 'minor' ? ' m' : '');
}

function extractMeta(midi, trackIdx) {
  const track = midi.tracks[trackIdx];
  const tempos = midi.header.tempos || [];
  const bpm = tempos.length > 0 ? Math.round(tempos[0].bpm) : 120;
  const tsArr = midi.header.timeSignatures?.[0]?.timeSignature || [4, 4];
  const timeSigStr = tsArr[0] + '/' + tsArr[1];
  const keySigs = midi.header.keySignatures || [];
  let keyFifths = 0;
  let keyMode = 'major';
  if (keySigs.length > 0) {
    const k = keySigs[0].key;
    keyMode = keySigs[0].scale || 'major';
    if (typeof k === 'number') keyFifths = k;
    else if (typeof k === 'string') {
      keyFifths = KEY_NAME_TO_FIFTHS[k] || 0;
      if (keyMode === 'minor') keyFifths -= 3;
    }
  }
  return {
    bpm,
    timeSigStr,
    keySigDisplay: getKeySigDisplay(keyFifths, keyMode),
    instrumentName: getInstrumentName(track),
  };
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function updateScoreInfoBar(meta) {
  const bar = document.getElementById('scoreInfoBar');
  bar.style.display = 'flex';
  const instEl = document.getElementById('infoInstrument');
  if (meta.instrumentName) {
    instEl.style.display = '';
    instEl.innerHTML = '<span class="info-label">\ud83c\udfb9</span> ' + escHtml(meta.instrumentName);
  } else {
    instEl.style.display = 'none';
  }
  document.getElementById('infoKey').innerHTML =
    '<span class="info-label">\u8c03\u53f7</span> ' + escHtml(meta.keySigDisplay);
  document.getElementById('infoTimeSig').innerHTML =
    '<span class="info-label">\u62cd\u53f7</span> ' + escHtml(meta.timeSigStr);
  document.getElementById('infoBpm').innerHTML =
    '<span class="info-label">\u901f\u5ea6</span> \u2669=' + meta.bpm;
}

// ==================== Playback ====================
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function updatePlaybackUI() {
  const playBtn = document.getElementById('playBtn');
  const stopBtn = document.getElementById('stopBtn');
  playBtn.textContent = playbackState === 'playing' ? '⏸ 暂停' : '▶ 播放';
  stopBtn.disabled = playbackState === 'stopped';
}

function updateProgress(seconds) {
  const bar = document.getElementById('progressBar');
  const display = document.getElementById('timeDisplay');
  bar.value = totalDuration > 0 ? (seconds / totalDuration) * 1000 : 0;
  display.textContent = `${formatTime(seconds)} / ${formatTime(totalDuration)}`;
}

async function ensureInstrument() {
  const track = currentMidi?.tracks[playbackTrackIdx];
  const type = getTrackInstrumentType(track);
  toneSynth = await getInstrumentInstance(type);
  const gmName = type.startsWith('gm:') ? (GM_NAMES[parseInt(type.slice(3), 10)] || type) : type;
  if (type !== 'default') setStatus(`音色就绪: ${gmName}`);
}

// Schedule playback using original MIDI timing (note.time / note.duration in seconds).
// MusicXML now contains ALL tempo events, so Verovio's internal MIDI timeline
// matches the original MIDI — getElementsAtTime(sec*1000) stays in sync.
function schedulePlayback() {
  Tone.Transport.cancel();
  if (!currentMidi || playbackTrackIdx < 0) return;
  const track = currentMidi.tracks[playbackTrackIdx];
  if (!track || !track.notes.length) return;
  for (const note of track.notes) {
    const startSec = note.time;
    const durSec = Math.max(0.01, note.duration);
    Tone.Transport.schedule((time) => {
      try {
        toneSynth.triggerAttackRelease(
          Tone.Frequency(note.midi, 'midi').toNote(),
          Math.min(durSec, 8),
          time,
          note.velocity || 0.8
        );
      } catch (_) {}
    }, `${startSec}s`);
  }
  totalDuration = track.notes.reduce((mx, n) => Math.max(mx, n.time + n.duration), 0);
}

async function startPlayback() {
  if (!currentMidi || !vrvToolkit || playbackTrackIdx < 0) return;
  if (playbackState === 'stopped') {
    await Tone.start();
    await ensureInstrument();
    schedulePlayback();
    Tone.Transport.seconds = 0;
  }
  Tone.Transport.start();
  playbackState = 'playing';
  updatePlaybackUI();
  startSyncLoop();
}

function pausePlayback() {
  Tone.Transport.pause();
  playbackState = 'paused';
  updatePlaybackUI();
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
}

function stopPlayback() {
  if (playbackState === 'stopped') return;
  Tone.Transport.stop();
  Tone.Transport.cancel();
  playbackState = 'stopped';
  updatePlaybackUI();
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  clearHighlights();
  updateProgress(0);
}

function togglePlayback() {
  if (playbackState === 'playing') pausePlayback();
  else startPlayback();
}

// ---- Sync Loop ----
function findPageForNotes(noteIds) {
  for (let p = 0; p < pageNoteIds.length; p++) {
    for (const id of noteIds) {
      if (pageNoteIds[p].has(id)) return p + 1;
    }
  }
  return null;
}

function startSyncLoop() {
  function tick() {
    if (playbackState !== 'playing') return;
    const sec = Tone.Transport.seconds;
    updateProgress(sec);
    if (sec >= totalDuration) { stopPlayback(); return; }
    try {
      const result = vrvToolkit.getElementsAtTime(midiSecToVrvMs(sec));
      if (result && result.notes && result.notes.length > 0) {
        const targetPage = findPageForNotes(result.notes);
        const manualOverride = Date.now() - lastManualPageTime < 3000;
        if (!manualOverride && targetPage && targetPage !== currentPage) {
          showPage(targetPage, () => highlightNotes(result.notes));
        } else {
          // Highlight whatever is on current page (silently skips missing IDs)
          highlightNotes(result.notes);
        }
      } else if (lastHighlighted.size > 0) {
        clearHighlights();
      }
    } catch (_) {}
    animFrameId = requestAnimationFrame(tick);
  }
  animFrameId = requestAnimationFrame(tick);
}

// ---- Highlight ----
function highlightNotes(noteIds) {
  const newSet = new Set(noteIds);
  if (newSet.size === lastHighlighted.size) {
    let same = true;
    for (const id of newSet) { if (!lastHighlighted.has(id)) { same = false; break; } }
    if (same) return;
  }
  for (const id of lastHighlighted) {
    if (!newSet.has(id)) {
      const el = document.getElementById(id);
      if (el) el.classList.remove('note-active');
    }
  }
  let scrollTarget = null;
  for (const id of newSet) {
    if (!lastHighlighted.has(id)) {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('note-active');
        if (!scrollTarget) scrollTarget = el;
      }
    }
  }
  if (scrollTarget) {
    const outer = document.getElementById('scoreOuter');
    const rect = scrollTarget.getBoundingClientRect();
    const outerRect = outer.getBoundingClientRect();
    if (rect.top < outerRect.top || rect.bottom > outerRect.bottom) {
      scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
  lastHighlighted = newSet;
}

function clearHighlights() {
  document.querySelectorAll('.note-active').forEach(el => el.classList.remove('note-active'));
  lastHighlighted = new Set();
}

// ---- Paging ----
function showPage(pageNum, callback) {
  if (pageNum < 1 || pageNum > totalPages) return;
  if (pageNum === currentPage) { if (callback) callback(); return; }
  const container = document.getElementById('scoreContainer');
  // Quick fade transition
  container.classList.add('page-fade');
  setTimeout(() => {
    currentPage = pageNum;
    container.innerHTML = allPageSVGs[pageNum - 1];
    container.classList.remove('page-fade');
    updatePageIndicator();
    if (callback) callback();
  }, 80);
}

function updatePageIndicator() {
  const ind = document.getElementById('pageIndicator');
  if (ind) ind.textContent = `${currentPage} / ${totalPages}`;
  const prev = document.getElementById('prevPageBtn');
  const next = document.getElementById('nextPageBtn');
  if (prev) prev.disabled = currentPage <= 1;
  if (next) next.disabled = currentPage >= totalPages;
}

// Post-process Verovio SVG for dark-mode theming via CSS currentColor
function postProcessSVG(svg) {
  // Replace explicit black fills/strokes with currentColor
  svg = svg.replace(/(fill|stroke)="(#000000|#000|black)"/gi, '$1="currentColor"');
  // Handle style="...fill:#000000..." inline styles
  svg = svg.replace(/(fill|stroke)\s*:\s*(#000000|#000|black)/gi, '$1:currentColor');
  // Set default fill on SVG root for elements that inherit (no explicit fill → default black)
  svg = svg.replace(/<svg([^>]*)>/, (match, attrs) => {
    if (/\bfill\s*=/.test(attrs)) return match;
    return `<svg${attrs} fill="currentColor">`;
  });
  return svg;
}

// ---- Playback Event Listeners ----
document.getElementById('playBtn').addEventListener('click', togglePlayback);
document.getElementById('stopBtn').addEventListener('click', stopPlayback);
document.getElementById('prevPageBtn').addEventListener('click', () => { lastManualPageTime = Date.now(); showPage(currentPage - 1); });
document.getElementById('nextPageBtn').addEventListener('click', () => { lastManualPageTime = Date.now(); showPage(currentPage + 1); });

document.getElementById('progressBar').addEventListener('input', (e) => {
  if (totalDuration <= 0) return;
  const sec = (e.target.value / 1000) * totalDuration;
  const wasPlaying = playbackState === 'playing';
  if (wasPlaying) Tone.Transport.pause();
  Tone.Transport.seconds = sec;
  updateProgress(sec);
  try {
    const result = vrvToolkit.getElementsAtTime(midiSecToVrvMs(sec));
    if (result && result.notes && result.notes.length > 0) {
      const targetPage = findPageForNotes(result.notes);
      if (targetPage && targetPage !== currentPage) {
        showPage(targetPage, () => highlightNotes(result.notes));
      } else {
        highlightNotes(result.notes);
      }
    } else {
      clearHighlights();
    }
  } catch (_) {}
  if (wasPlaying) Tone.Transport.start();
});

// ---- Click-to-seek on Score ----
document.getElementById('scoreContainer').addEventListener('click', (e) => {
  if (playbackState === 'stopped' || !vrvToolkit) return;
  let target = e.target;
  while (target && target.id !== 'scoreContainer') {
    if (target.classList && target.classList.contains('note')) break;
    target = target.parentElement;
  }
  if (!target || !target.id || target.id === 'scoreContainer') return;
  try {
    const info = vrvToolkit.getTimeForElement(target.id);
    if (info && typeof info.realTimeOffsetMilliseconds === 'number') {
      const wasPlaying = playbackState === 'playing';
      if (wasPlaying) Tone.Transport.pause();
      Tone.Transport.seconds = vrvMsToMidiSec(info.realTimeOffsetMilliseconds);
      updateProgress(Tone.Transport.seconds);
      highlightNotes([target.id]);
      if (wasPlaying) Tone.Transport.start();
    }
  } catch (_) {}
});

// ==================== Render with Verovio ====================
document.getElementById('renderBtn').addEventListener('click', renderScore);

async function renderScore() {
  if (!currentMidi) return;
  stopPlayback();

  const sel = document.getElementById('trackSelect');
  const trackIdx = parseInt(sel.value);
  const track = currentMidi.tracks[trackIdx];
  if (!track || !track.notes.length) {
    setStatus('\u8be5\u97f3\u8f68\u65e0\u97f3\u7b26\u6570\u636e');
    return;
  }

  const isPiano = document.getElementById('pianoMode').checked;
  const splitNote = isPiano ? (parseInt(document.getElementById('splitSelect').value) || 60) : 60;

  const container = document.getElementById('scoreContainer');

  try {
    // 1. Initialise Verovio (lazy, first call loads WASM)
    setStatus('\u6b63\u5728\u521d\u59cb\u5316 Verovio \u5f15\u64ce...');
    const tk = await getVerovio();

    // 2. Convert MIDI track to MusicXML
    setStatus('\u6b63\u5728\u8f6c\u6362\u97f3\u8f68\u4e3a MusicXML...');
    const musicxml = midiToMusicXML(currentMidi, trackIdx, isPiano, splitNote, currentFileName);

    // 3. Update info bar
    const meta = extractMeta(currentMidi, trackIdx);
    updateScoreInfoBar(meta);

    // 4. Configure Verovio — paged rendering (~3 systems per page)
    setStatus('正在渲染五线谱 (Verovio)...');
    const containerPx = container.parentElement.clientWidth - 24;
    const pixelWidth = Math.max(containerPx, 360);
    const zoom = 100;
    const pageWidth = Math.round(pixelWidth / zoom * 100 * 254 / 96);
    // Target ~3 systems: single staff ≈ 600 units/system, piano ≈ 1000
    const pageHeight = isPiano ? 2000 : 2000;

    tk.setOptions({
      pageWidth: pageWidth,
      pageHeight: pageHeight,
      adjustPageHeight: false,
      scale: zoom,
      breaks: 'auto',
      header: 'auto',
      footer: 'none',
      spacingStaff: 8,
      spacingSystem: 12,
    });

    // 5. Load MusicXML into Verovio
    const ok = tk.loadData(musicxml);
    if (!ok) {
      setStatus('Verovio 无法解析 MusicXML 数据');
      return;
    }

    // 6. Render all pages to array, show first page only
    container.className = '';
    container.innerHTML = '';

    totalPages = tk.getPageCount();
    allPageSVGs = [];
    pageNoteIds = [];
    for (let p = 1; p <= totalPages; p++) {
      const svg = postProcessSVG(tk.renderToSVG(p));
      allPageSVGs.push(svg);
      // Build element ID set for this page (for page lookup in sync loop)
      const ids = new Set();
      const idRe = /\bid="([^"]+)"/g;
      let m;
      while ((m = idRe.exec(svg)) !== null) ids.add(m[1]);
      pageNoteIds.push(ids);
    }
    currentPage = 1;
    container.innerHTML = allPageSVGs[0];
    updatePageIndicator();

    // 7. Prepare Verovio timing data & build MIDI↔Verovio time calibration
    try { tk.renderToMIDI(); } catch (_) {}
    timeCalibration = buildTimeCalibration(
      track.notes, currentMidi.header.ppq, currentMidi.header.tempos
    );
    console.log(`Time calibration: ${timeCalibration.length} points, last: midi=${timeCalibration[timeCalibration.length-1].midiSec.toFixed(2)}s → vrv=${timeCalibration[timeCalibration.length-1].vrvSec.toFixed(2)}s`);
    playbackTrackIdx = trackIdx;
    totalDuration = track.notes.reduce((mx, n) => Math.max(mx, n.time + n.duration), 0);
    if (totalDuration <= 0) totalDuration = currentMidi.duration || 0;

    // Show playback bar
    document.getElementById('playbackBar').classList.add('visible');
    updatePlaybackUI();
    updateProgress(0);

    // 7. Status message
    const trackName = track.name || track.instrument?.name || `\u97f3\u8f68 ${trackIdx + 1}`;
    if (isPiano) {
      const splitNames = { 55: 'G3', 57: 'A3', 60: 'C4', 62: 'D4', 64: 'E4' };
      const splitLabel = splitNames[splitNote] || ('MIDI ' + splitNote);
      setStatus(`\u5df2\u6e32\u67d3\u300c${trackName}\u300d\u94a2\u7434\u8c31\uff0c\u5206\u5272\u70b9 ${splitLabel}`);
    } else {
      setStatus(`\u5df2\u6e32\u67d3\u300c${trackName}\u300d\uff1a${track.notes.length} \u4e2a\u97f3\u7b26`);
    }
  } catch (e) {
    setStatus('\u6e32\u67d3\u5931\u8d25\uff1a' + e.message);
    console.error(e);
  }
}
