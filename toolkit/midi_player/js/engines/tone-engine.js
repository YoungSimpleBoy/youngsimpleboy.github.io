(function initToneAudioEngine(global) {
    'use strict';

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
    const PIANO_SAMPLE_URLS = {
        'A0': 'A0.mp3', 'C1': 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
        'A1': 'A1.mp3', 'C2': 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
        'A2': 'A2.mp3', 'C3': 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
        'A3': 'A3.mp3', 'C4': 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
        'A4': 'A4.mp3', 'C5': 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
        'A5': 'A5.mp3', 'C6': 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
        'A6': 'A6.mp3', 'C7': 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3',
        'A7': 'A7.mp3', 'C8': 'C8.mp3'
    };
    const SAMPLER_CONFIGS = {
        violin: {
            name: '小提琴',
            baseUrl: 'https://gleitz.github.io/midi-js-soundfonts/FatBoy/violin-mp3/',
            enhance: 18
        },
        viola: {
            name: '中提琴',
            baseUrl: 'https://gleitz.github.io/midi-js-soundfonts/FatBoy/viola-mp3/',
            enhance: 12
        },
        cello: {
            name: '大提琴',
            baseUrl: 'https://gleitz.github.io/midi-js-soundfonts/FatBoy/cello-mp3/',
            enhance: 18
        },
        piccolo: {
            name: '短笛',
            baseUrl: 'https://gleitz.github.io/midi-js-soundfonts/FatBoy/piccolo-mp3/',
            enhance: 15
        },
        flute: {
            name: '长笛',
            baseUrl: 'https://gleitz.github.io/midi-js-soundfonts/FatBoy/flute-mp3/',
            enhance: 15
        },
        acoustic_guitar: {
            name: '吉他',
            baseUrl: 'https://gleitz.github.io/midi-js-soundfonts/FatBoy/acoustic_guitar_nylon-mp3/',
            enhance: 24
        },
        music_box: {
            name: '八音盒',
            baseUrl: 'https://gleitz.github.io/midi-js-soundfonts/FatBoy/music_box-mp3/',
            enhance: 21
        },
        shamisen: {
            name: '三味线',
            baseUrl: 'https://gleitz.github.io/midi-js-soundfonts/FatBoy/shamisen-mp3/',
            enhance: 9
        },
        voice: {
            name: '人声',
            baseUrl: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/voice_oohs-mp3/',
            enhance: 0
        }
    };

    function buildChromaticSampleUrls() {
        const sharpNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const fileNames = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
        const urls = {};

        for (let midi = 21; midi <= 108; midi++) {
            const pitchClass = midi % 12;
            const octave = Math.floor(midi / 12) - 1;
            urls[`${sharpNames[pitchClass]}${octave}`] = `${fileNames[pitchClass]}${octave}.mp3`;
        }
        return urls;
    }

    const CHROMATIC_SAMPLE_URLS = buildChromaticSampleUrls();

    class ToneAudioEngine {
        constructor(options = {}) {
            if (!global.Tone) {
                throw new Error('Tone.js 尚未加载');
            }
            if (!global.MidiPlayerCore) {
                throw new Error('MIDI 核心工具尚未加载');
            }

            this.onStatus = options.onStatus || (() => {});
            this.onEnded = () => {};
            this.onLoop = () => {};
            this.notes = [];
            this.tracks = [];
            this.playbackRate = 1;
            this.loopEnabled = false;
            this.running = false;
            this.position = 0;
            this.duration = 0;

            this.masterVolume = new Tone.Volume(-6).toDestination();
            this.reverb = new Tone.Reverb({ decay: 2, wet: 0.2 }).connect(this.masterVolume);
            const defaultInstrument = new Tone.PolySynth(Tone.Synth).connect(this.reverb);
            this.instrumentPool = { default: defaultInstrument };
        }

        load(notes, tracks) {
            this.notes = notes || [];
            this.tracks = tracks || [];
            this.position = 0;
            this.duration = this.notes.reduce(
                (max, note) => Math.max(max, note.time + note.duration),
                0
            );
        }

        resolveTrackInstrumentType(track) {
            if (!track) return 'default';
            if (track.instrument !== 'midi_auto') return track.instrument || 'default';
            if (track.isPercussion) return 'gm_drum';
            if (
                typeof track.gmProgram === 'number' &&
                track.gmProgram >= 0 &&
                track.gmProgram < MidiPlayerCore.GM_PROGRAM_IDS.length
            ) {
                return `gm:${track.gmProgram}`;
            }
            return 'default';
        }

        async preloadTracks(tracks = this.tracks) {
            const types = new Set();
            tracks.forEach(track => {
                if (track.instrument !== 'midi_auto') return;
                const type = this.resolveTrackInstrumentType(track);
                if (type !== 'default') types.add(type);
            });

            const loadList = Array.from(types);
            for (let index = 0; index < loadList.length; index++) {
                this.onStatus(`正在加载 MIDI 音库 ${index + 1}/${loadList.length}...`);
                await this.getInstrument(loadList[index]);
            }
        }

        async getInstrument(type) {
            if (this.instrumentPool[type]) return this.instrumentPool[type];

            let instrument;
            if (type === 'gm_drum') {
                instrument = new Tone.PolySynth(Tone.MembraneSynth, {
                    envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.15 }
                });
            } else if (type.startsWith('gm:')) {
                instrument = this.createGmInstrument(type);
            } else if (type === 'fm') {
                instrument = new Tone.PolySynth(Tone.FMSynth);
            } else if (type === 'am') {
                instrument = new Tone.PolySynth(Tone.AMSynth);
            } else if (type === 'fat') {
                instrument = new Tone.PolySynth(Tone.Synth, {
                    oscillator: { type: 'fatsawtooth' }
                });
            } else if (type === 'piano') {
                instrument = this.createPianoInstrument();
            } else if (type in SAMPLER_CONFIGS) {
                instrument = this.createConfiguredSampler(type);
            } else {
                instrument = new Tone.PolySynth(Tone.Synth);
            }

            instrument.connect(this.reverb);
            this.instrumentPool[type] = instrument;

            if (instrument.loaded === false) {
                try {
                    await Tone.loaded();
                } catch (error) {
                    console.warn('音色采样加载失败，回退默认合成器:', type, error);
                    if (type.startsWith('gm:')) {
                        this.instrumentPool[type] = this.instrumentPool.default;
                    }
                }
            }

            return this.instrumentPool[type];
        }

        createGmInstrument(type) {
            const program = parseInt(type.slice(3), 10);
            const gmId = MidiPlayerCore.GM_PROGRAM_IDS[program];
            if (!gmId) return new Tone.PolySynth(Tone.Synth);

            const gmName = MidiPlayerCore.GM_PROGRAM_NAMES[program] || gmId;
            this.onStatus(`正在加载 GM 音色: ${gmName}...`);
            const instrument = new Tone.Sampler({
                urls: GM_SPARSE_SAMPLE_URLS,
                release: 1.1,
                baseUrl: `${GM_SOUNDFONT_BASE_URL}${gmId}-mp3/`,
                onload: () => {
                    this.onStatus(`GM 音色已就绪: ${gmName}`);
                    instrument.volume.value = 6;
                }
            });
            return instrument;
        }

        createPianoInstrument() {
            this.onStatus('正在加载 钢琴 采样...');
            const instrument = new Tone.Sampler({
                urls: PIANO_SAMPLE_URLS,
                release: 1.2,
                baseUrl: 'https://tonejs.github.io/audio/salamander/',
                onload: () => {
                    this.onStatus('钢琴音色就绪 (Salamander 三角钢琴，雅马哈 C5)。Ref: tonejs.github.io');
                    instrument.volume.value = 3;
                }
            });
            return instrument;
        }

        createConfiguredSampler(type) {
            const config = SAMPLER_CONFIGS[type];
            this.onStatus(`正在加载 ${config.name} 采样...`);
            const instrument = new Tone.Sampler({
                urls: CHROMATIC_SAMPLE_URLS,
                release: 1.2,
                baseUrl: config.baseUrl,
                onload: () => {
                    this.onStatus(`${config.name} 音色就绪。Ref: gleitz.github.io`);
                    instrument.volume.value = config.enhance;
                }
            });
            return instrument;
        }

        setVolume(dbValue) {
            if (!this.masterVolume.disposed) {
                this.masterVolume.volume.value = dbValue;
            }
        }

        setPlaybackRate(rate) {
            const nextRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
            const position = this.getCurrentTime();
            this.playbackRate = nextRate;

            if (this.running && this.notes.length > 0) {
                this.scheduleFrom(position);
            } else {
                this.position = position;
            }
            return position;
        }

        getPlaybackRate() {
            return this.playbackRate;
        }

        setLoopEnabled(enabled) {
            this.loopEnabled = Boolean(enabled);
            if (this.running && this.notes.length > 0) {
                this.scheduleFrom(this.getCurrentTime());
            }
        }

        async play(startTime = this.position, options = {}) {
            if (this.notes.length === 0) return;

            await Tone.start();
            this.onEnded = options.onEnded || this.onEnded;
            this.onLoop = options.onLoop || this.onLoop;
            this.loopEnabled = options.loop !== undefined ? Boolean(options.loop) : this.loopEnabled;
            this.running = true;
            this.scheduleFrom(startTime);
        }

        pause() {
            this.position = this.getCurrentTime();
            this.running = false;
            Tone.Transport.pause();
            return this.position;
        }

        stop(resetToStart = true) {
            this.running = false;
            Tone.Transport.loop = false;
            Tone.Transport.stop();
            Tone.Transport.cancel();
            if (resetToStart) this.position = 0;
            return this.position;
        }

        seek(songTime) {
            this.position = Math.max(0, songTime || 0);
            if (this.running && this.notes.length > 0) {
                this.scheduleFrom(this.position);
            }
            return this.position;
        }

        getCurrentTime() {
            return this.running
                ? Tone.Transport.seconds * this.playbackRate
                : this.position;
        }

        isPlaying() {
            return this.running;
        }

        scheduleFrom(songStartTime) {
            Tone.Transport.stop();
            Tone.Transport.cancel();
            this.position = Math.max(0, songStartTime || 0);

            this.notes.forEach(note => {
                if (note.time >= this.position) {
                    this.scheduleNote(note);
                }
            });

            const endTime = this.toTransportTime(this.duration);
            Tone.Transport.loop = false;
            Tone.Transport.schedule(() => {
                if (!this.running) return;

                if (this.loopEnabled) {
                    this.position = 0;
                    this.onLoop();
                    this.scheduleFrom(0);
                } else {
                    this.position = this.duration;
                    this.stop(false);
                    this.onEnded();
                }
            }, endTime);

            Tone.Transport.start(undefined, this.toTransportTime(this.position));
        }

        scheduleNote(note) {
            const noteStart = this.toTransportTime(note.time);
            const noteDuration = Math.max(0.01, note.duration / this.playbackRate);

            Tone.Transport.schedule(time => {
                const track = this.tracks[note.track];
                if (!track || !track.enabled || track.volume === 0) return;

                const type = this.resolveTrackInstrumentType(track);
                const instrument = this.instrumentPool[type] || this.instrumentPool.default;
                const velocity = Math.max(0, Math.min(1, note.velocity * track.volume));
                if (instrument && velocity > 0.01) {
                    instrument.triggerAttackRelease(note.name, noteDuration, time, velocity);
                }
            }, noteStart);
        }

        toTransportTime(songTime) {
            return songTime / this.playbackRate;
        }
    }

    if (!global.MidiPlayerAudio) {
        throw new Error('音频引擎控制器尚未加载');
    }

    global.MidiPlayerAudio.registerEngine('tone', options => new ToneAudioEngine(options));
})(window);
