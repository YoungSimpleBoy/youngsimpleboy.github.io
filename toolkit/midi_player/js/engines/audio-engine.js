(function initAudioEngineController(global) {
    'use strict';

    const engineFactories = new Map();

    class AudioEngineController {
        constructor(options = {}) {
            this.engineOptions = options.engineOptions || {};
            this.engines = new Map();
            this.notes = [];
            this.tracks = [];
            this.source = null;
            this.volume = -6;
            this.playbackRate = 1;
            this.loopEnabled = false;
            this.playOptions = {};
            this.activeName = '';
            this.activeEngine = null;
            this.activate(options.initial || 'tone');
        }

        activate(name) {
            if (!engineFactories.has(name)) {
                throw new Error(`未注册的音频引擎: ${name}`);
            }

            if (!this.engines.has(name)) {
                const factory = engineFactories.get(name);
                this.engines.set(name, factory(this.engineOptions[name] || {}));
            }

            this.activeName = name;
            this.activeEngine = this.engines.get(name);
            this.activeEngine.load(this.notes, this.tracks, this.source);
            this.activeEngine.setVolume(this.volume);
            this.activeEngine.setPlaybackRate(this.playbackRate);
            this.activeEngine.setLoopEnabled(this.loopEnabled);
            return this.activeEngine;
        }

        async switchTo(name) {
            if (name === this.activeName) return;

            const position = this.getCurrentTime();
            const wasRunning = Boolean(this.activeEngine && this.activeEngine.isPlaying());
            if (this.activeEngine) this.activeEngine.stop(false);
            this.activate(name);
            this.activeEngine.seek(position);

            if (wasRunning) {
                await this.activeEngine.play(position, {
                    ...this.playOptions,
                    loop: this.loopEnabled
                });
            }
        }

        getActiveName() {
            return this.activeName;
        }

        load(notes, tracks, source = this.source) {
            this.notes = notes || [];
            this.tracks = tracks || [];
            this.source = source;
            this.activeEngine.load(this.notes, this.tracks, this.source);
        }

        resolveTrackInstrumentType(track) {
            return this.activeEngine.resolveTrackInstrumentType(track);
        }

        getInstrument(type) {
            return this.activeEngine.getInstrument(type);
        }

        preloadTracks(tracks = this.tracks) {
            return this.activeEngine.preloadTracks(tracks);
        }

        setVolume(dbValue) {
            this.volume = dbValue;
            this.activeEngine.setVolume(dbValue);
        }

        setPlaybackRate(rate) {
            this.playbackRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
            return this.activeEngine.setPlaybackRate(this.playbackRate);
        }

        getPlaybackRate() {
            return this.activeEngine.getPlaybackRate();
        }

        setLoopEnabled(enabled) {
            this.loopEnabled = Boolean(enabled);
            this.activeEngine.setLoopEnabled(this.loopEnabled);
        }

        play(startTime, options = {}) {
            this.playOptions = options;
            this.loopEnabled = options.loop !== undefined
                ? Boolean(options.loop)
                : this.loopEnabled;
            return this.activeEngine.play(startTime, {
                ...options,
                loop: this.loopEnabled
            });
        }

        pause() {
            return this.activeEngine.pause();
        }

        stop(resetToStart = true) {
            return this.activeEngine.stop(resetToStart);
        }

        seek(songTime) {
            return this.activeEngine.seek(songTime);
        }

        getCurrentTime() {
            return this.activeEngine.getCurrentTime();
        }

        isPlaying() {
            return this.activeEngine.isPlaying();
        }
    }

    global.MidiPlayerAudio = Object.freeze({
        createController(options) {
            return new AudioEngineController(options);
        },
        registerEngine(name, factory) {
            if (!name || typeof factory !== 'function') {
                throw new TypeError('音频引擎注册参数无效');
            }
            engineFactories.set(name, factory);
        }
    });
})(window);
