// ==================== State ====================
let currentMidi = null;

// ==================== Theme ====================
document.getElementById('themeToggle').addEventListener('click', () => {
  const isLight = document.body.classList.toggle('light');
  document.getElementById('themeToggle').textContent = isLight ? '☽ 切换主题' : '☀ 切换主题';
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
    const noteTotalCount = midi.tracks.reduce((s, t) => s + t.notes.length, 0);
    setStatus(`已加载：${midi.tracks.length} 轨，共 ${noteTotalCount} 个音符，时长约 ${dur} 秒`);
    document.getElementById('renderBtn').disabled = false;
  } catch (e) {
    setStatus('MIDI 解析失败：' + e.message);
    console.error(e);
  }
}

document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  setStatus('正在解析...');
  const reader = new FileReader();
  reader.onload = (evt) => parseMidi(evt.target.result);
  reader.readAsArrayBuffer(file);
  e.target.value = '';
});

document.getElementById('exampleSelect').addEventListener('change', async (e) => {
  const url = e.target.value;
  if (!url) return;
  setStatus('正在加载示例...');
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buffer = await resp.arrayBuffer();
    parseMidi(buffer);
  } catch (err) {
    setStatus('加载示例失败：' + err.message);
  }
});

// ==================== Track Select ====================
function updateTrackSelect(midi) {
  const sel = document.getElementById('trackSelect');
  sel.innerHTML = '';
  let hasTrack = false;
  midi.tracks.forEach((track, i) => {
    if (!track.notes.length) return;
    const name = track.name || track.instrument?.name || `音轨 ${i + 1}`;
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `[${i + 1}] ${name}（${track.notes.length} 音符）`;
    sel.appendChild(opt);
    hasTrack = true;
  });
  if (!hasTrack) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '无可用音轨';
    sel.appendChild(opt);
  }
  sel.disabled = false;
}

// ==================== Render ====================
document.getElementById('renderBtn').addEventListener('click', renderScore);

// MIDI note number → VexFlow key string + accidental info
const NOTE_NAMES       = ['c','c#','d','d#','e','f','f#','g','g#','a','a#','b'];
const NOTE_NAMES_FLAT  = ['c','db','d','eb','e','f','gb','g','ab','a','bb','b'];
const NOTE_IS_SHARP    = [0,   1,   0,  1,   0,  0,  1,   0,  1,   0,  1,   0 ];
const IS_BLACK_KEY     = [false,true,false,true,false,false,true,false,true,false,true,false];

// Pitch classes (of the resulting sharpened/flatted note) covered per added sharp/flat
const KEY_SHARP_BK_PCS = [6, 1, 8, 3, 10, 5, 0];   // F# C# G# D# A# E# B#
const KEY_FLAT_BK_PCS  = [10, 3, 8, 1,  6, 11, 4]; // Bb Eb Ab Db Gb Cb Fb

// GM Program 0-127 instrument names
const GM_PROGRAM_NAMES = [
  'Acoustic Grand Piano','Bright Acoustic Piano','Electric Grand Piano','Honky-tonk Piano','Electric Piano 1','Electric Piano 2','Harpsichord','Clavinet',
  'Celesta','Glockenspiel','Music Box','Vibraphone','Marimba','Xylophone','Tubular Bells','Dulcimer',
  'Drawbar Organ','Percussive Organ','Rock Organ','Church Organ','Reed Organ','Accordion','Harmonica','Tango Accordion',
  'Acoustic Guitar (nylon)','Acoustic Guitar (steel)','Electric Guitar (jazz)','Electric Guitar (clean)','Electric Guitar (muted)','Overdriven Guitar','Distortion Guitar','Guitar Harmonics',
  'Acoustic Bass','Electric Bass (finger)','Electric Bass (pick)','Fretless Bass','Slap Bass 1','Slap Bass 2','Synth Bass 1','Synth Bass 2',
  'Violin','Viola','Cello','Contrabass','Tremolo Strings','Pizzicato Strings','Orchestral Harp','Timpani',
  'String Ensemble 1','String Ensemble 2','Synth Strings 1','Synth Strings 2','Choir Aahs','Voice Oohs','Synth Voice','Orchestra Hit',
  'Trumpet','Trombone','Tuba','Muted Trumpet','French Horn','Brass Section','Synth Brass 1','Synth Brass 2',
  'Soprano Sax','Alto Sax','Tenor Sax','Baritone Sax','Oboe','English Horn','Bassoon','Clarinet',
  'Piccolo','Flute','Recorder','Pan Flute','Blown Bottle','Shakuhachi','Whistle','Ocarina',
  'Lead 1 (square)','Lead 2 (sawtooth)','Lead 3 (calliope)','Lead 4 (chiff)','Lead 5 (charang)','Lead 6 (voice)','Lead 7 (fifths)','Lead 8 (bass+lead)',
  'Pad 1 (new age)','Pad 2 (warm)','Pad 3 (polysynth)','Pad 4 (choir)','Pad 5 (bowed)','Pad 6 (metallic)','Pad 7 (halo)','Pad 8 (sweep)',
  'FX 1 (rain)','FX 2 (soundtrack)','FX 3 (crystal)','FX 4 (atmosphere)','FX 5 (brightness)','FX 6 (goblins)','FX 7 (echoes)','FX 8 (sci-fi)',
  'Sitar','Banjo','Shamisen','Koto','Kalimba','Bag pipe','Fiddle','Shanai',
  'Tinkle Bell','Agogo','Steel Drums','Woodblock','Taiko Drum','Melodic Tom','Synth Drum','Reverse Cymbal',
  'Guitar Fret Noise','Breath Noise','Seashore','Bird Tweet','Telephone Ring','Helicopter','Applause','Gunshot'
];

function midiNoteToVex(midiNum) {
  const octave = Math.floor(midiNum / 12) - 1;
  const pc     = midiNum % 12;
  return {
    key:        NOTE_NAMES[pc] + '/' + octave,
    accidental: NOTE_IS_SHARP[pc] ? '#' : null
  };
}

// Key-aware note spelling: uses flat names for flat keys, and respects key signature accidentals
function buildKeyAccidentalSet(keyFifths) {
  const set = new Set();
  const limit = Math.min(Math.abs(keyFifths), 7);
  if (keyFifths > 0) { for (let i = 0; i < limit; i++) set.add(KEY_SHARP_BK_PCS[i]); }
  else if (keyFifths < 0) { for (let i = 0; i < limit; i++) set.add(KEY_FLAT_BK_PCS[i]); }
  return set;
}

function midiNoteToVexWithKey(midiNum, useFlat, keyAccSet) {
  const octave = Math.floor(midiNum / 12) - 1;
  const pc     = midiNum % 12;
  const name   = useFlat ? NOTE_NAMES_FLAT[pc] : NOTE_NAMES[pc];
  let accidental = null;
  if (IS_BLACK_KEY[pc] && !keyAccSet.has(pc)) {
    accidental = useFlat ? 'b' : '#';
  }
  return { key: name + '/' + octave, accidental };
}

// ==================== Score Metadata ====================
function getKeySignatureName(keyFifths) {
  const sharpKeys = ['C','G','D','A','E','B','F#','C#'];
  const flatKeys  = ['C','F','Bb','Eb','Ab','Db','Gb','Cb'];
  return keyFifths >= 0 ? (sharpKeys[keyFifths] || 'C') : (flatKeys[-keyFifths] || 'C');
}

function getInstrumentName(track) {
  if (track.notes?.[0]?.channel === 9) return 'Standard Drum Kit';
  if (track.instrument && typeof track.instrument === 'object') {
    if (track.instrument.percussion) return 'Standard Drum Kit';
    if (typeof track.instrument.name === 'string' && track.instrument.name.trim())
      return track.instrument.name.trim();
    const prog = track.instrument.number;
    if (typeof prog === 'number' && prog >= 0 && prog <= 127)
      return GM_PROGRAM_NAMES[prog] || '';
  }
  return track.name?.trim() || '';
}

function extractScoreMeta(midi, trackIdx) {
  const track     = midi.tracks[trackIdx];
  const tempos    = midi.header.tempos || [];
  const bpm       = tempos.length > 0 ? Math.round(tempos[0].bpm) : 120;
  const timeSigArr = midi.header.timeSignatures?.[0]?.timeSignature || [4, 4];
  const timeSigStr = timeSigArr[0] + '/' + timeSigArr[1];
  const keySigs   = midi.header.keySignatures || [];
  const keyFifths = keySigs.length > 0 ? (keySigs[0].key ?? 0) : 0;
  const keyMode   = keySigs.length > 0 ? (keySigs[0].scale || 'major') : 'major';
  const keySigName    = getKeySignatureName(keyFifths);
  const keySigDisplay = keySigName + (keyMode === 'minor' ? ' m' : '');
  const instrumentName = getInstrumentName(track);
  return { bpm, timeSigStr, keySigName, keySigDisplay, keyFifths, instrumentName };
}

function updateScoreInfoBar(meta) {
  const bar = document.getElementById('scoreInfoBar');
  bar.style.display = 'flex';
  const instEl = document.getElementById('infoInstrument');
  if (meta.instrumentName) {
    instEl.style.display = '';
    instEl.innerHTML = `<span class="info-label">🎹</span> ${meta.instrumentName}`;
  } else {
    instEl.style.display = 'none';
  }
  document.getElementById('infoKey').innerHTML =
    `<span class="info-label">调号</span> ${meta.keySigDisplay}`;
  document.getElementById('infoTimeSig').innerHTML =
    `<span class="info-label">拍号</span> ${meta.timeSigStr}`;
  document.getElementById('infoBpm').innerHTML =
    `<span class="info-label">速度</span> ♩=${meta.bpm}`;
}

// Quantize a tick to the nearest 32nd-note grid
function quantizeTick(tick, ppq) {
  const grid = ppq / 8; // 32nd note = ppq/8
  return Math.round(tick / grid) * grid;
}

// Duration ratios relative to a quarter note (ppq)
// Dotted notes: base duration name + dot:true (use addDotToAll() when drawing)
const DURATIONS = [
  { vex: 'w',   mult: 4,      dot: false },
  { vex: 'h',   mult: 3,      dot: true  },
  { vex: 'h',   mult: 2,      dot: false },
  { vex: 'q',   mult: 1.5,    dot: true  },
  { vex: 'q',   mult: 1,      dot: false },
  { vex: '8',   mult: 0.75,   dot: true  },
  { vex: '8',   mult: 0.5,    dot: false },
  { vex: '16',  mult: 0.375,  dot: true  },
  { vex: '16',  mult: 0.25,   dot: false },
  { vex: '32',  mult: 0.125,  dot: false },
];

function ticksToDur(ticks, ppq) {
  let best = DURATIONS[4]; // default quarter
  let bestDiff = Infinity;
  for (const d of DURATIONS) {
    const diff = Math.abs(ticks - d.mult * ppq);
    if (diff < bestDiff) { bestDiff = diff; best = d; }
  }
  return { vex: best.vex, ticks: best.mult * ppq, dot: best.dot };
}

// Build measure data from a MIDI track
function buildMeasures(track, ppq, timeSig, keyFifths = 0) {
  const [beatsNum, beatsDenom] = timeSig;
  const measureTicks = beatsNum * ppq * (4 / beatsDenom);
  if (!track.notes.length) return [];

  const useFlat   = keyFifths < 0;
  const keyAccSet = buildKeyAccidentalSet(keyFifths);

  // ---- Step 1: Chord grouping with tolerance window ----
  // Notes within CHORD_WINDOW ticks of each other are treated as simultaneous chords
  const CHORD_WINDOW = Math.max(Math.round(ppq / 16), 8);
  const groups = [];
  for (const note of [...track.notes].sort((a, b) => a.ticks - b.ticks)) {
    const qt = quantizeTick(note.ticks, ppq);
    const g  = groups.find(g => Math.abs(g.tick - qt) <= CHORD_WINDOW);
    if (g) { g.notes.push(note); }
    else    { groups.push({ tick: qt, notes: [note] }); }
  }
  groups.sort((a, b) => a.tick - b.tick);

  // ---- Step 2: IOI-based duration estimation ----
  // MIDI performers shorten notes; the "written" duration is better estimated
  // from the inter-onset interval (time to next note onset) than from note-off.
  for (let i = 0; i < groups.length; i++) {
    const maxRaw = Math.max(...groups[i].notes.map(n => n.durationTicks));
    if (i < groups.length - 1) {
      const ioi = groups[i + 1].tick - groups[i].tick;
      groups[i].rawDurTicks = maxRaw < ioi * 0.92 ? ioi : maxRaw;
    } else {
      groups[i].rawDurTicks = maxRaw;
    }
  }

  // ---- Step 3: Triplet detection ----
  // Look for 3 consecutive equally-spaced onsets spanning 1 beat (8th triplets)
  // or 2 beats (quarter triplets).
  const tripletInfo = new Array(groups.length).fill(null);
  for (let i = 0; i <= groups.length - 3; i++) {
    if (tripletInfo[i]) continue;
    const ioi1 = groups[i + 1].tick - groups[i].tick;
    const ioi2 = groups[i + 2].tick - groups[i + 1].tick;
    if (ioi1 <= 0 || ioi2 <= 0) continue;
    const relVar = Math.abs(ioi1 - ioi2) / Math.max(ioi1, ioi2);
    if (relVar > 0.22) continue;
    const span = ioi1 + ioi2;
    const isEighthTriplet  = Math.abs(span - ppq)       / ppq       < 0.20;
    const isQuarterTriplet = Math.abs(span - 2 * ppq)   / (2 * ppq) < 0.20;
    if (isEighthTriplet || isQuarterTriplet) {
      const baseDur = isEighthTriplet ? '8' : 'q';
      const slotT   = span / 3;
      const gid     = i;
      for (let k = 0; k < 3; k++) {
        tripletInfo[i + k] = { index: k, groupId: gid, baseDur };
        groups[i + k].rawDurTicks = slotT;
      }
      i += 2;
    }
  }

  // ---- Step 4: Expand notes that cross barlines into tied segments ----
  const expandedEvents = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const g        = groups[gi];
    const noteInfos = g.notes.map(n => midiNoteToVexWithKey(n.midi, useFlat, keyAccSet));
    const triplet  = tripletInfo[gi];
    let tick      = g.tick;
    let remain    = g.rawDurTicks;
    let tieEndSeg = false;

    while (remain > ppq * 0.09) {
      const mIdx    = Math.floor(tick / measureTicks);
      const mEnd    = (mIdx + 1) * measureTicks;
      const portion = Math.min(remain, mEnd - tick);
      let dur, durTicks, dot;
      if (triplet) {
        dur = triplet.baseDur; durTicks = portion; dot = false;
      } else {
        const d = ticksToDur(portion, ppq);
        dur = d.vex; durTicks = d.ticks; dot = d.dot;
      }
      // For cross-barline first/middle segments, track cursor with the exact
      // portion so no trailing gap appears in the source measure.
      const cursorTicks = (!triplet && portion < remain) ? portion : durTicks;
      expandedEvents.push({
        tick, noteInfos, dur, durTicks: cursorTicks, dot,
        tieEnd:   tieEndSeg,
        tieStart: portion < remain && !triplet,
        triplet:  tieEndSeg ? null : triplet
      });
      remain    -= portion;
      tieEndSeg  = true;
      tick       = mEnd;
    }
  }

  // ---- Step 5: Build per-measure arrays with rest fill ----
  if (!expandedEvents.length) return [];
  const lastEnd       = expandedEvents[expandedEvents.length - 1].tick +
                        expandedEvents[expandedEvents.length - 1].durTicks;
  const totalMeasures = Math.ceil(lastEnd / measureTicks);
  const renderCount   = Math.min(totalMeasures, 48);

  const measures = [];
  for (let m = 0; m < renderCount; m++) {
    const startTick = m * measureTicks;
    const endTick   = startTick + measureTicks;
    const inMeasure = expandedEvents.filter(e => e.tick >= startTick && e.tick < endTick);
    const items  = [];
    let   cursor = startTick;

    for (const ev of inMeasure) {
      let gap = ev.tick - cursor;
      while (gap >= ppq * 0.25) {
        const rd = ticksToDur(gap, ppq);
        items.push({ isRest: true, dur: rd.vex, durTicks: rd.ticks, dot: rd.dot || false,
                     tieStart: false, tieEnd: false, triplet: null });
        cursor += rd.ticks;
        gap = ev.tick - cursor;
      }
      items.push({ isRest: false, ...ev });
      cursor = ev.tick + ev.durTicks;
    }

    let trailing = endTick - cursor;
    while (trailing >= ppq * 0.25) {
      const rd = ticksToDur(trailing, ppq);
      items.push({ isRest: true, dur: rd.vex, durTicks: rd.ticks, dot: rd.dot || false,
                   tieStart: false, tieEnd: false, triplet: null });
      trailing -= rd.ticks;
      if (trailing <= 0) break;
    }

    measures.push(items);
  }

  return measures;
}

// Build VexFlow note objects + tie descriptors + tuplets from one measure's items
function buildVfNotes(VF, items, clef) {
  const restKey = clef === 'bass' ? 'd/3' : 'b/4';
  const vfNotes = [];
  const metas   = [];

  for (const item of items) {
    if (item.isRest) {
      const rn = new VF.StaveNote({ clef, keys: [restKey], duration: item.dur + 'r' });
      if (item.dot) rn.addDotToAll();
      vfNotes.push(rn);
      metas.push({ isRest: true, tieStart: false, tieEnd: false, triplet: null, n: 0 });
    } else {
      const keys    = item.noteInfos.map(n => n.key);
      const durCode = item.triplet ? item.triplet.baseDur : item.dur;
      const sn      = new VF.StaveNote({ clef, keys, duration: durCode });
      if (item.dot && !item.triplet) sn.addDotToAll();
      vfNotes.push(sn);
      metas.push({ isRest: false, tieStart: item.tieStart, tieEnd: item.tieEnd,
                   triplet: item.triplet, n: item.noteInfos.length });
    }
  }

  if (!vfNotes.length) {
    vfNotes.push(new VF.StaveNote({ clef, keys: [restKey], duration: 'wr' }));
    metas.push({ isRest: true, tieStart: false, tieEnd: false, triplet: null, n: 0 });
  }

  // Tie descriptors
  const ties = [];
  for (let i = 0; i < metas.length; i++) {
    if (metas[i].isRest) continue;
    const idxArr = Array.from({ length: metas[i].n }, (_, k) => k);
    if (metas[i].tieEnd) {
      // Incoming tie from previous measure → draw right half-arc
      ties.push({ first_note: null, last_note: vfNotes[i],
                  first_indices: idxArr, last_indices: idxArr });
    }
    if (metas[i].tieStart) {
      // Outgoing tie to next measure → draw left half-arc
      ties.push({ first_note: vfNotes[i], last_note: null,
                  first_indices: idxArr, last_indices: idxArr });
    }
  }

  // Tuplets (triplets) — also pre-create beams for 8th-note groups to prevent
  // generateBeams from accidentally crossing group boundaries.
  const tuplets       = [];
  const tripletBeams  = [];
  const tupletNoteSet = new Set();
  const seenGroups    = new Set();
  for (let i = 0; i < metas.length; i++) {
    const tri = metas[i].triplet;
    if (!tri || tri.index !== 0 || seenGroups.has(tri.groupId)) continue;
    seenGroups.add(tri.groupId);
    const tripletNotes = [];
    for (let j = i; j < metas.length && tripletNotes.length < 3; j++) {
      if (metas[j].triplet && metas[j].triplet.groupId === tri.groupId)
        tripletNotes.push(vfNotes[j]);
    }
    if (tripletNotes.length === 3) {
      tuplets.push(new VF.Tuplet(tripletNotes, { num_notes: 3, notes_occupied: 2 }));
      if (tri.baseDur === '8') tripletBeams.push(new VF.Beam(tripletNotes));
      tripletNotes.forEach(n => tupletNoteSet.add(n));
    }
  }

  return { vfNotes, ties, tuplets, tripletBeams, tupletNoteSet };
}

// Draw measures onto the container using VexFlow
function drawScore(container, measures, timeSig, keySigName = 'C', meta = {}) {
  const VF = Vex.Flow;
  const [beatsNum, beatsDenom] = timeSig;

  // Layout constants
  const MEASURES_PER_ROW  = 4;
  const BASE_W            = 240;  // base stave width per measure
  const ROW_HEIGHT        = 140;
  const MARGIN_X          = 20;
  const MARGIN_Y          = 52;  // extra top space for header text
  const FIRST_EXTRA       = 140;  // space for clef + key sig + time sig

  const numRows   = Math.ceil(measures.length / MEASURES_PER_ROW);
  const svgWidth  = MARGIN_X + FIRST_EXTRA + BASE_W * MEASURES_PER_ROW + MARGIN_X;
  const svgHeight = MARGIN_Y + numRows * ROW_HEIGHT;

  container.innerHTML = '';
  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(svgWidth, svgHeight);
  const ctx = renderer.getContext();

  // --- Header text (instrument name + tempo) ---
  if (meta.instrumentName) {
    ctx.save();
    ctx.setFont('Georgia', 13, 'italic bold');
    ctx.setFillStyle('#333');
    ctx.fillText(meta.instrumentName, MARGIN_X, MARGIN_Y - 20);
    ctx.restore();
  }
  if (meta.bpm) {
    ctx.save();
    ctx.setFont('Arial', 11, 'bold');
    ctx.setFillStyle('#555');
    ctx.fillText('\u2669 = ' + meta.bpm, MARGIN_X + FIRST_EXTRA + 6, MARGIN_Y - 10);
    ctx.restore();
  }

  for (let row = 0; row < numRows; row++) {
    const baseY = MARGIN_Y + row * ROW_HEIGHT;

    for (let col = 0; col < MEASURES_PER_ROW; col++) {
      const mIdx = row * MEASURES_PER_ROW + col;
      if (mIdx >= measures.length) break;

      // Stave x / width
      const staveX = col === 0
        ? MARGIN_X
        : MARGIN_X + FIRST_EXTRA + col * BASE_W;
      const staveW = col === 0 ? BASE_W + FIRST_EXTRA : BASE_W;

      const stave = new VF.Stave(staveX, baseY, staveW);
      if (col === 0) {
        if (row === 0) {
          stave.addClef('treble').addKeySignature(keySigName).addTimeSignature(beatsNum + '/' + beatsDenom);
        } else {
          stave.addClef('treble').addKeySignature(keySigName);
        }
      }
      stave.setContext(ctx).draw();

      // Build VexFlow note objects, ties, tuplets, and pre-built beams for triplet groups
      const { vfNotes, ties, tuplets, tripletBeams, tupletNoteSet } = buildVfNotes(VF, measures[mIdx], 'treble');

      try {
        const voice = new VF.Voice({ num_beats: beatsNum, beat_value: beatsDenom })
          .setMode(VF.Voice.Mode.SOFT);
        voice.addTickables(vfNotes);
        VF.Accidental.applyAccidentals([voice], keySigName);
        new VF.Formatter().joinVoices([voice]).format([voice], staveW - 12);
        voice.draw(ctx, stave);

        ties.forEach(t => { try { new VF.StaveTie(t).setContext(ctx).draw(); } catch(e){} });
        tripletBeams.forEach(b => { try { b.setContext(ctx).draw(); } catch(e){} });
        const nonTupletNotes = vfNotes.filter(n => !tupletNoteSet.has(n));
        const beams = VF.Beam.generateBeams(nonTupletNotes, {
          groups: [new VF.Fraction(beatsNum <= 3 ? 1 : 2, beatsDenom)]
        });
        beams.forEach(b => b.setContext(ctx).draw());
        tuplets.forEach(t => { try { t.setContext(ctx).draw(); } catch(e){} });
      } catch (e) {
        console.warn(`Measure ${mIdx} render error:`, e.message);
      }
    }
  }
}

// ==================== Piano Mode ====================

// Split a track's notes into treble/bass by split point and build measures for each
function buildPianoMeasures(track, ppq, timeSig, splitNote, keyFifths = 0) {
  splitNote = splitNote || 60;
  const trebleNotes = track.notes.filter(n => n.midi >= splitNote);
  const bassNotes   = track.notes.filter(n => n.midi < splitNote);

  const trebleMeasures = trebleNotes.length ? buildMeasures({ notes: trebleNotes }, ppq, timeSig, keyFifths) : [];
  const bassMeasures   = bassNotes.length   ? buildMeasures({ notes: bassNotes },   ppq, timeSig, keyFifths) : [];

  // Pad to same length
  const maxLen = Math.max(trebleMeasures.length, bassMeasures.length);
  while (trebleMeasures.length < maxLen) trebleMeasures.push([]);
  while (bassMeasures.length   < maxLen) bassMeasures.push([]);

  return { treble: trebleMeasures, bass: bassMeasures };
}

// Draw a single voice (treble or bass) onto a stave
function drawVoiceOnStave(ctx, stave, measureItems, clef, beatsNum, beatsDenom, staveW, keySigName = 'C') {
  const VF = Vex.Flow;
  const { vfNotes, ties, tuplets, tripletBeams, tupletNoteSet } = buildVfNotes(VF, measureItems, clef);

  try {
    const voice = new VF.Voice({ num_beats: beatsNum, beat_value: beatsDenom })
      .setMode(VF.Voice.Mode.SOFT);
    voice.addTickables(vfNotes);
    VF.Accidental.applyAccidentals([voice], keySigName);
    new VF.Formatter().joinVoices([voice]).format([voice], staveW - 12);
    voice.draw(ctx, stave);

    ties.forEach(t => { try { new VF.StaveTie(t).setContext(ctx).draw(); } catch(e){} });
    tripletBeams.forEach(b => { try { b.setContext(ctx).draw(); } catch(e){} });
    const nonTupletNotes = vfNotes.filter(n => !tupletNoteSet.has(n));
    const beams = VF.Beam.generateBeams(nonTupletNotes, {
      groups: [new VF.Fraction(beatsNum <= 3 ? 1 : 2, beatsDenom)]
    });
    beams.forEach(b => b.setContext(ctx).draw());
    tuplets.forEach(t => { try { t.setContext(ctx).draw(); } catch(e){} });
  } catch (e) {
    console.warn(`Measure render error (${clef}):`, e.message);
  }
}

// Draw grand staff (treble + bass with brace) for piano mode
function drawPianoScore(container, pianoMeasures, timeSig, keySigName = 'C', meta = {}) {
  const VF = Vex.Flow;
  const [beatsNum, beatsDenom] = timeSig;
  const { treble, bass } = pianoMeasures;
  const totalMeasures = treble.length;

  const MEASURES_PER_ROW = 4;
  const BASE_W           = 240;
  const FIRST_EXTRA      = 140; // space for brace + clef + key sig + time sig
  const STAVE_GAP        = 70;  // vertical gap between treble bottom and bass top
  const ROW_HEIGHT       = 220; // total height per grand-staff row
  const MARGIN_X         = 20;
  const MARGIN_Y         = 52;  // extra top space for header text

  const numRows  = Math.ceil(totalMeasures / MEASURES_PER_ROW);
  const svgWidth = MARGIN_X + FIRST_EXTRA + BASE_W * MEASURES_PER_ROW + MARGIN_X;
  const svgHeight = MARGIN_Y + numRows * ROW_HEIGHT + 40;

  container.innerHTML = '';
  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(svgWidth, svgHeight);
  const ctx = renderer.getContext();

  // --- Header text (instrument name + tempo) ---
  if (meta.instrumentName) {
    ctx.save();
    ctx.setFont('Georgia', 13, 'italic bold');
    ctx.setFillStyle('#333');
    ctx.fillText(meta.instrumentName, MARGIN_X, MARGIN_Y - 20);
    ctx.restore();
  }
  if (meta.bpm) {
    ctx.save();
    ctx.setFont('Arial', 11, 'bold');
    ctx.setFillStyle('#555');
    ctx.fillText('\u2669 = ' + meta.bpm, MARGIN_X + FIRST_EXTRA + 6, MARGIN_Y - 10);
    ctx.restore();
  }

  for (let row = 0; row < numRows; row++) {
    const baseY = MARGIN_Y + row * ROW_HEIGHT;

    for (let col = 0; col < MEASURES_PER_ROW; col++) {
      const mIdx = row * MEASURES_PER_ROW + col;
      if (mIdx >= totalMeasures) break;

      const staveX = col === 0 ? MARGIN_X : MARGIN_X + FIRST_EXTRA + col * BASE_W;
      const staveW = col === 0 ? BASE_W + FIRST_EXTRA : BASE_W;

      // Treble stave
      const trebleStave = new VF.Stave(staveX, baseY, staveW);
      if (col === 0) {
        if (row === 0) {
          trebleStave.addClef('treble').addKeySignature(keySigName).addTimeSignature(beatsNum + '/' + beatsDenom);
        } else {
          trebleStave.addClef('treble').addKeySignature(keySigName);
        }
      }
      trebleStave.setContext(ctx).draw();

      // Bass stave
      const bassStave = new VF.Stave(staveX, baseY + STAVE_GAP, staveW);
      if (col === 0) {
        if (row === 0) {
          bassStave.addClef('bass').addKeySignature(keySigName).addTimeSignature(beatsNum + '/' + beatsDenom);
        } else {
          bassStave.addClef('bass').addKeySignature(keySigName);
        }
      }
      bassStave.setContext(ctx).draw();

      // Brace + left connector for first measure of each row
      if (col === 0) {
        new VF.StaveConnector(trebleStave, bassStave)
          .setType(VF.StaveConnector.type.BRACE)
          .setContext(ctx).draw();
        new VF.StaveConnector(trebleStave, bassStave)
          .setType(VF.StaveConnector.type.SINGLE_LEFT)
          .setContext(ctx).draw();
      }

      // Right barline connector
      new VF.StaveConnector(trebleStave, bassStave)
        .setType(VF.StaveConnector.type.SINGLE_RIGHT)
        .setContext(ctx).draw();

      // Render notes / rests
      drawVoiceOnStave(ctx, trebleStave, treble[mIdx], 'treble', beatsNum, beatsDenom, staveW, keySigName);
      drawVoiceOnStave(ctx, bassStave,   bass[mIdx],   'bass',   beatsNum, beatsDenom, staveW, keySigName);
    }
  }
}

// ==================== Piano Mode UI ====================
document.getElementById('pianoMode').addEventListener('change', (e) => {
  const show = e.target.checked;
  document.querySelectorAll('.piano-opt').forEach(el => {
    el.style.display = show ? '' : 'none';
  });
});

// ==================== Render (unified) ====================
function renderScore() {
  if (!currentMidi) return;

  const sel = document.getElementById('trackSelect');
  const trackIdx = parseInt(sel.value);
  const track = currentMidi.tracks[trackIdx];
  if (!track || !track.notes.length) {
    setStatus('该音轨无音符数据');
    return;
  }

  const ppq     = currentMidi.header.ppq;
  const timeSig = currentMidi.header.timeSignatures[0]?.timeSignature || [4, 4];
  const isPiano = document.getElementById('pianoMode').checked;

  // Extract and display metadata
  const meta = extractScoreMeta(currentMidi, trackIdx);
  updateScoreInfoBar(meta);

  setStatus('渲染中...');
  const container = document.getElementById('scoreContainer');

  try {
    if (isPiano) {
      const splitNote     = parseInt(document.getElementById('splitSelect').value) || 60;
      const pianoMeasures = buildPianoMeasures(track, ppq, timeSig, splitNote, meta.keyFifths);
      const total = pianoMeasures.treble.length;
      if (!total) {
        container.innerHTML = '<div class="score-empty"><span>无可渲染内容</span></div>';
        setStatus('该音轨无可渲染的音符');
        return;
      }
      drawPianoScore(container, pianoMeasures, timeSig, meta.keySigName, meta);
      const trackName = track.name || track.instrument?.name || `音轨 ${trackIdx + 1}`;
      const splitNames = { 55: 'G3', 57: 'A3', 60: 'C4', 62: 'D4', 64: 'E4' };
      const splitLabel = splitNames[splitNote] || `MIDI ${splitNote}`;
      setStatus(`已渲染「${trackName}」钢琴谱：${total} 小节，分割点 ${splitLabel}（最多 48 小节）`);
    } else {
      const measures = buildMeasures(track, ppq, timeSig, meta.keyFifths);
      if (!measures.length) {
        container.innerHTML = '<div class="score-empty"><span>无可渲染内容</span></div>';
        setStatus('该音轨无可渲染的音符');
        return;
      }
      drawScore(container, measures, timeSig, meta.keySigName, meta);
      const trackName = track.name || track.instrument?.name || `音轨 ${trackIdx + 1}`;
      setStatus(`已渲染「${trackName}」：${measures.length} 小节，${track.notes.length} 个音符（最多显示 48 小节）`);
    }
  } catch (e) {
    setStatus('渲染失败：' + e.message);
    console.error(e);
  }
}
