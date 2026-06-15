(function initMidiPlayerCore(global) {
    'use strict';

    const GM_PROGRAM_NAMES = [
        "Acoustic Grand Piano", "Bright Acoustic Piano", "Electric Grand Piano", "Honky-tonk Piano", "Electric Piano 1", "Electric Piano 2", "Harpsichord", "Clavinet",
        "Celesta", "Glockenspiel", "Music Box", "Vibraphone", "Marimba", "Xylophone", "Tubular Bells", "Dulcimer",
        "Drawbar Organ", "Percussive Organ", "Rock Organ", "Church Organ", "Reed Organ", "Accordion", "Harmonica", "Tango Accordion",
        "Acoustic Guitar (nylon)", "Acoustic Guitar (steel)", "Electric Guitar (jazz)", "Electric Guitar (clean)", "Electric Guitar (muted)", "Overdriven Guitar", "Distortion Guitar", "Guitar Harmonics",
        "Acoustic Bass", "Electric Bass (finger)", "Electric Bass (pick)", "Fretless Bass", "Slap Bass 1", "Slap Bass 2", "Synth Bass 1", "Synth Bass 2",
        "Violin", "Viola", "Cello", "Contrabass", "Tremolo Strings", "Pizzicato Strings", "Orchestral Harp", "Timpani",
        "String Ensemble 1", "String Ensemble 2", "Synth Strings 1", "Synth Strings 2", "Choir Aahs", "Voice Oohs", "Synth Voice", "Orchestra Hit",
        "Trumpet", "Trombone", "Tuba", "Muted Trumpet", "French Horn", "Brass Section", "Synth Brass 1", "Synth Brass 2",
        "Soprano Sax", "Alto Sax", "Tenor Sax", "Baritone Sax", "Oboe", "English Horn", "Bassoon", "Clarinet",
        "Piccolo", "Flute", "Recorder", "Pan Flute", "Blown Bottle", "Shakuhachi", "Whistle", "Ocarina",
        "Lead 1 (square)", "Lead 2 (sawtooth)", "Lead 3 (calliope)", "Lead 4 (chiff)", "Lead 5 (charang)", "Lead 6 (voice)", "Lead 7 (fifths)", "Lead 8 (bass+lead)",
        "Pad 1 (new age)", "Pad 2 (warm)", "Pad 3 (polysynth)", "Pad 4 (choir)", "Pad 5 (bowed)", "Pad 6 (metallic)", "Pad 7 (halo)", "Pad 8 (sweep)",
        "FX 1 (rain)", "FX 2 (soundtrack)", "FX 3 (crystal)", "FX 4 (atmosphere)", "FX 5 (brightness)", "FX 6 (goblins)", "FX 7 (echoes)", "FX 8 (sci-fi)",
        "Sitar", "Banjo", "Shamisen", "Koto", "Kalimba", "Bag pipe", "Fiddle", "Shanai",
        "Tinkle Bell", "Agogo", "Steel Drums", "Woodblock", "Taiko Drum", "Melodic Tom", "Synth Drum", "Reverse Cymbal",
        "Guitar Fret Noise", "Breath Noise", "Seashore", "Bird Tweet", "Telephone Ring", "Helicopter", "Applause", "Gunshot"
    ];

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

    function normalizeProgramNumber(program) {
        if (typeof program !== 'number' || Number.isNaN(program)) return null;
        if (program >= 0 && program <= 127) return program;
        return program === 128 ? 127 : null;
    }

    function getTrackProgramInfo(track, midi) {
        let program = null;
        let noteChannel = null;
        let isPercussion = false;

        if (track.notes && track.notes.length > 0 && typeof track.notes[0].channel === 'number') {
            noteChannel = track.notes[0].channel;
            isPercussion = noteChannel === 9;
        }

        if (track.instrument && typeof track.instrument === 'object') {
            isPercussion = isPercussion || Boolean(track.instrument.percussion);
            program = normalizeProgramNumber(track.instrument.number);
        }

        if (program === null && typeof track.programNumber === 'number') {
            program = normalizeProgramNumber(track.programNumber);
        }
        if (program === null && typeof track.instrument === 'number') {
            program = normalizeProgramNumber(track.instrument);
        }

        if (program === null && Array.isArray(track.events)) {
            for (const event of track.events) {
                if (event.type === 'programChange' && typeof event.programNumber === 'number') {
                    program = normalizeProgramNumber(event.programNumber);
                    isPercussion = isPercussion || event.channel === 9;
                    break;
                }
            }
        }

        if (program === null && typeof noteChannel === 'number') {
            outer: for (const midiTrack of midi.tracks) {
                if (!Array.isArray(midiTrack.events)) continue;
                for (const event of midiTrack.events) {
                    if (event.type === 'programChange' && event.channel === noteChannel && typeof event.programNumber === 'number') {
                        program = normalizeProgramNumber(event.programNumber);
                        break outer;
                    }
                }
            }
        }

        return { program, isPercussion };
    }

    function getInstrumentNameFromTrack(track, midi) {
        const programInfo = getTrackProgramInfo(track, midi);

        if (programInfo.isPercussion) return 'Standard Drum Kit';
        if (track.instrument && typeof track.instrument === 'object') {
            if (typeof track.instrument.name === 'string' && track.instrument.name.trim()) {
                return track.instrument.name.trim();
            }
        }
        return programInfo.program === null ? '' : (GM_PROGRAM_NAMES[programInfo.program] || '');
    }

    function midiToNoteName(midi) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        return noteNames[midi % 12] + (Math.floor(midi / 12) - 1);
    }

    function getKeySignatureName(keyFifths) {
        const sharpKeys = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
        const flatKeys = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
        return keyFifths >= 0
            ? (sharpKeys[keyFifths] || 'C')
            : (flatKeys[Math.abs(keyFifths)] || 'C');
    }

    function extractMidiMeta(midi, fileName) {
        const tempos = midi.header.tempos || [];
        const timeSignatures = midi.header.timeSignatures || [];
        const keySignatures = midi.header.keySignatures || [];
        const firstTimeSignature = timeSignatures[0];
        let timeSignature = '4/4';

        if (firstTimeSignature) {
            if (Array.isArray(firstTimeSignature.timeSignature)) {
                timeSignature = `${firstTimeSignature.timeSignature[0]}/${firstTimeSignature.timeSignature[1]}`;
            } else if (firstTimeSignature.numerator !== undefined) {
                timeSignature = `${firstTimeSignature.numerator}/${firstTimeSignature.denominator || 4}`;
            }
        }

        return {
            fileName,
            bpm: tempos.length > 0 ? Math.round(tempos[0].bpm) : 120,
            timeSig: timeSignature,
            keySig: getKeySignatureName(keySignatures.length > 0 ? (keySignatures[0].key || 0) : 0),
            totalNotes: midi.tracks.reduce((sum, track) => sum + track.notes.length, 0)
        };
    }

    function extractNotes(midi) {
        const notes = [];
        let minMidi = 127;
        let maxMidi = 0;
        let trackIndex = 0;

        midi.tracks.forEach(track => {
            if (track.notes.length === 0) return;

            track.notes.forEach(note => {
                notes.push({
                    midi: note.midi,
                    time: note.time,
                    duration: note.duration,
                    name: note.name,
                    velocity: note.velocity || 0.8,
                    track: trackIndex
                });
                minMidi = Math.min(minMidi, note.midi);
                maxMidi = Math.max(maxMidi, note.midi);
            });
            trackIndex++;
        });

        notes.sort((a, b) => a.time - b.time);
        const lastNote = notes[notes.length - 1];

        return {
            notes,
            range: notes.length > 0
                ? { min: Math.max(0, minMidi - 1), max: Math.min(127, maxMidi + 1) }
                : { min: 48, max: 84 },
            duration: lastNote ? lastNote.time + lastNote.duration : 0
        };
    }

    function parseMidiGrid(midi) {
        const lines = [];
        const ppq = midi.header.ppq || 480;
        const tempos = midi.header.tempos && midi.header.tempos.length > 0
            ? midi.header.tempos
            : [{ ticks: 0, bpm: 120 }];
        const timeSignatures = midi.header.timeSignatures && midi.header.timeSignatures.length > 0
            ? midi.header.timeSignatures
            : [{ ticks: 0, timeSignature: [4, 4] }];

        function getSecondsFromTick(targetTick) {
            let time = 0;
            let lastTick = 0;
            let lastBpm = tempos[0].bpm;

            for (const tempo of tempos) {
                if (tempo.ticks > targetTick) break;
                time += (tempo.ticks - lastTick) * (60 / lastBpm / ppq);
                lastTick = tempo.ticks;
                lastBpm = tempo.bpm;
            }

            return time + (targetTick - lastTick) * (60 / lastBpm / ppq);
        }

        let maxTick = 0;
        midi.tracks.forEach(track => {
            track.notes.forEach(note => {
                maxTick = Math.max(maxTick, note.ticks + note.durationTicks);
            });
        });
        maxTick += ppq * 16;

        let currentTick = 0;
        let timeSignatureIndex = 0;
        let measureCount = 1;

        while (currentTick <= maxTick) {
            let currentSignature = timeSignatures[timeSignatureIndex];
            while (
                timeSignatureIndex + 1 < timeSignatures.length &&
                timeSignatures[timeSignatureIndex + 1].ticks <= currentTick
            ) {
                timeSignatureIndex++;
                currentSignature = timeSignatures[timeSignatureIndex];
            }

            let numerator = 4;
            let denominator = 4;
            if (Array.isArray(currentSignature.timeSignature)) {
                numerator = currentSignature.timeSignature[0];
                denominator = currentSignature.timeSignature[1];
            } else if (currentSignature.numerator && currentSignature.denominator) {
                numerator = currentSignature.numerator;
                denominator = currentSignature.denominator;
            }

            const ticksPerBeat = ppq * (4 / denominator);
            const ticksPerMeasure = ticksPerBeat * numerator;
            lines.push({
                time: getSecondsFromTick(currentTick),
                isMeasure: true,
                label: `Bar ${measureCount} (${numerator}/${denominator})`
            });

            for (let beat = 1; beat < numerator; beat++) {
                lines.push({
                    time: getSecondsFromTick(currentTick + beat * ticksPerBeat),
                    isMeasure: false
                });
            }

            currentTick += Math.round(ticksPerMeasure);
            measureCount++;
        }

        return lines;
    }

    function createPlaybackSource(midi, arrayBuffer) {
        const ppq = midi.header.ppq || 480;
        const tempos = (midi.header.tempos || [])
            .map(tempo => ({
                ticks: Math.max(0, tempo.ticks || 0),
                bpm: tempo.bpm > 0 ? tempo.bpm : 120
            }))
            .sort((a, b) => a.ticks - b.ticks);

        if (tempos.length === 0 || tempos[0].ticks > 0) {
            tempos.unshift({ ticks: 0, bpm: 120 });
        }

        function ticksToSeconds(targetTick) {
            const tick = Math.max(0, targetTick || 0);
            let seconds = 0;
            let previousTick = 0;
            let bpm = tempos[0].bpm;

            for (let index = 1; index < tempos.length; index++) {
                const tempo = tempos[index];
                if (tempo.ticks > tick) break;
                seconds += (tempo.ticks - previousTick) * 60 / (bpm * ppq);
                previousTick = tempo.ticks;
                bpm = tempo.bpm;
            }

            return seconds + (tick - previousTick) * 60 / (bpm * ppq);
        }

        function secondsToTicks(targetSeconds) {
            let remaining = Math.max(0, targetSeconds || 0);
            let previousTick = 0;
            let bpm = tempos[0].bpm;

            for (let index = 1; index < tempos.length; index++) {
                const tempo = tempos[index];
                const segmentSeconds =
                    (tempo.ticks - previousTick) * 60 / (bpm * ppq);
                if (remaining < segmentSeconds) {
                    return Math.round(previousTick + remaining * bpm * ppq / 60);
                }
                remaining -= segmentSeconds;
                previousTick = tempo.ticks;
                bpm = tempo.bpm;
            }

            return Math.round(previousTick + remaining * bpm * ppq / 60);
        }

        return {
            data: arrayBuffer.slice(0),
            ppq,
            trackChannels: midi.tracks
                .filter(track => track.notes.length > 0)
                .map(track => {
                    const channel = track.notes[0]?.channel;
                    return Number.isInteger(channel) ? channel : null;
                }),
            ticksToSeconds,
            secondsToTicks
        };
    }

    global.MidiPlayerCore = Object.freeze({
        GM_PROGRAM_IDS,
        GM_PROGRAM_NAMES,
        createPlaybackSource,
        extractMidiMeta,
        extractNotes,
        getInstrumentNameFromTrack,
        getKeySignatureName,
        getTrackProgramInfo,
        midiToNoteName,
        normalizeProgramNumber,
        parseMidiGrid
    });
})(window);
