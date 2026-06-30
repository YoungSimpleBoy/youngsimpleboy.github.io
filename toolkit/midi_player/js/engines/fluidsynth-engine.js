(function initFluidSynthAudioEngine(global) {
    'use strict';

    const DEFAULT_LIBRARY_BUNDLES = [
        {
            runtimeUrl: 'https://cdn.jsdelivr.net/npm/js-synthesizer@1.13.0/externals/libfluidsynth-2.4.6.js',
            wrapperUrl: 'https://cdn.jsdelivr.net/npm/js-synthesizer@1.13.0/dist/js-synthesizer.min.js',
            workletUrls: [
                'https://cdn.jsdelivr.net/npm/js-synthesizer@1.13.0/dist/js-synthesizer.worklet.min.js',
                'https://cdn.jsdelivr.net/npm/js-synthesizer@1.13.0/dist/js-synthesizer.worklet.js'
            ]
        },
        {
            runtimeUrl: 'https://unpkg.com/js-synthesizer@1.13.0/externals/libfluidsynth-2.4.6.js',
            wrapperUrl: 'https://unpkg.com/js-synthesizer@1.13.0/dist/js-synthesizer.min.js',
            workletUrls: [
                'https://unpkg.com/js-synthesizer@1.13.0/dist/js-synthesizer.worklet.min.js',
                'https://unpkg.com/js-synthesizer@1.13.0/dist/js-synthesizer.worklet.js'
            ]
        }
    ];
    const DEFAULT_SOUNDFONT_URLS = [
        'soundfonts/Arachno.sf2',
        'soundfonts/GeneralUser-GS.sf2'
    ];
    const SCHEDULE_INTERVAL_MS = 25;
    const SCHEDULE_AHEAD_SECONDS = 0.12;
    const PLAYER_MONITOR_INTERVAL_MS = 100;
    const SOUNDFONT_FETCH_TIMEOUT_MS = 90000;
    const SOUNDFONT_LOAD_TIMEOUT_MS = 15000;
    const SOUNDFONT_PROGRESS_INTERVAL_MS = 250;
    const GIT_LFS_POINTER_PREFIX = 'version https://git-lfs.github.com/spec/v1';
    const END_EPSILON_SECONDS = 0.03;
    const ENABLE_WORKLET_STORAGE_KEY = 'midiPlayerEnableFluidSynthWorklet';
    const MELODIC_CHANNELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
    const INSTRUMENT_PROGRAMS = {
        piano: 0,
        violin: 40,
        viola: 41,
        cello: 42,
        piccolo: 72,
        flute: 73,
        acoustic_guitar: 24,
        music_box: 10,
        shamisen: 106,
        voice: 53,
        fm: 4,
        am: 5,
        fat: 81,
        default: 0
    };

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[data-fluid-synth-src="${url}"]`);
            if (existing) {
                if (existing.dataset.fluidSynthLoaded === 'true') {
                    resolve();
                } else {
                    existing.addEventListener('load', resolve, { once: true });
                    existing.addEventListener('error', reject, { once: true });
                }
                return;
            }

            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.dataset.fluidSynthSrc = url;
            script.addEventListener('load', () => {
                script.dataset.fluidSynthLoaded = 'true';
                resolve();
            }, { once: true });
            script.addEventListener('error', () => {
                script.remove();
                reject(new Error(`无法加载 FluidSynth 脚本: ${url}`));
            }, { once: true });
            document.head.appendChild(script);
        });
    }

    async function ensureFluidSynthLibrary(bundles) {
        let lastError = null;
        for (const bundle of bundles) {
            try {
                await loadScript(bundle.runtimeUrl);
                if (!global.JSSynth?.Synthesizer) {
                    await loadScript(bundle.wrapperUrl);
                }
                if (!global.JSSynth?.Synthesizer) {
                    throw new Error('js-synthesizer 未导出 JSSynth');
                }

                await global.JSSynth.waitForReady();
                return bundle;
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error('FluidSynth 浏览器库加载失败');
    }

    function formatMegabytes(bytes) {
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }

    function now() {
        return global.performance?.now?.() ?? Date.now();
    }

    function withTimeout(promise, timeoutMs, message) {
        let timeout = 0;
        const timeoutPromise = new Promise((resolve, reject) => {
            timeout = global.setTimeout(() => reject(new Error(message)), timeoutMs);
        });
        return Promise.race([Promise.resolve(promise), timeoutPromise])
            .finally(() => {
                if (timeout) global.clearTimeout(timeout);
            });
    }

    function assertSoundFontPayload(buffer, url) {
        if (!buffer || buffer.byteLength === 0) {
            throw new Error(`SoundFont 文件为空: ${url}`);
        }

        if (buffer.byteLength > 1024) return;

        const text = new TextDecoder().decode(new Uint8Array(buffer));
        if (!text.startsWith(GIT_LFS_POINTER_PREFIX)) return;

        const declaredSize = text.match(/^size\s+(\d+)/m)?.[1];
        const sizeText = declaredSize ? `，原始文件约 ${formatMegabytes(Number(declaredSize))}` : '';
        throw new Error(
            `SoundFont 是 Git LFS 指针文件${sizeText}，GitHub Pages 不会发布 LFS 原始文件: ${url}`
        );
    }

    async function fetchArrayBufferWithProgress(url, onProgress) {
        const Controller = global.AbortController;
        const controller = Controller ? new Controller() : null;
        const timeout = controller
            ? global.setTimeout(() => controller.abort(), SOUNDFONT_FETCH_TIMEOUT_MS)
            : 0;

        try {
            const response = await fetch(url, controller ? { signal: controller.signal } : undefined);
            if (!response.ok) {
                throw new Error(`SoundFont 下载失败 (${response.status})`);
            }

            const total = parseInt(response.headers?.get?.('content-length') || '0', 10) || 0;
            onProgress?.({ url, loaded: 0, total, done: false });

            if (!response.body || typeof response.body.getReader !== 'function') {
                const buffer = await response.arrayBuffer();
                assertSoundFontPayload(buffer, url);
                onProgress?.({
                    url,
                    loaded: buffer.byteLength,
                    total: total || buffer.byteLength,
                    done: true
                });
                return buffer;
            }

            const reader = response.body.getReader();
            const chunks = [];
            let loaded = 0;
            let lastProgressAt = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (!value) continue;

                chunks.push(value);
                loaded += value.byteLength;

                const currentTime = now();
                if (
                    currentTime - lastProgressAt >= SOUNDFONT_PROGRESS_INTERVAL_MS ||
                    (total > 0 && loaded >= total)
                ) {
                    onProgress?.({ url, loaded, total, done: false });
                    lastProgressAt = currentTime;
                }
            }

            const result = new Uint8Array(loaded);
            let offset = 0;
            chunks.forEach(chunk => {
                result.set(chunk, offset);
                offset += chunk.byteLength;
            });
            assertSoundFontPayload(result.buffer, url);
            onProgress?.({ url, loaded, total: total || loaded, done: true });
            return result.buffer;
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw new Error(`SoundFont 读取超时（${SOUNDFONT_FETCH_TIMEOUT_MS / 1000} 秒）`);
            }
            throw error;
        } finally {
            if (timeout) global.clearTimeout(timeout);
        }
    }

    function appendLocalFileHint(message) {
        if (global.location?.protocol !== 'file:') return message;
        return `${message}。当前页面是 file:// 打开的，浏览器可能无法读取本地 sf2；请用本地 HTTP 服务打开页面。`;
    }

    function shouldEnableAudioWorklet(options) {
        if (options.preferAudioWorklet !== undefined) {
            return Boolean(options.preferAudioWorklet);
        }

        try {
            return global.localStorage?.getItem(ENABLE_WORKLET_STORAGE_KEY) === '1';
        } catch (error) {
            return false;
        }
    }

    async function fetchFirstAvailable(urls, onProgress) {
        let lastError = null;
        for (const url of urls) {
            try {
                return await fetchArrayBufferWithProgress(url, onProgress);
            } catch (error) {
                lastError = error;
            }
        }
        const message = lastError?.message || 'SoundFont 下载失败';
        throw new Error(appendLocalFileHint(message));
    }

    function clampMidi(value) {
        return Math.max(0, Math.min(127, Math.round(value)));
    }

    class FluidSynthAudioEngine {
        constructor(options = {}) {
            this.onStatus = options.onStatus || (() => {});
            this.libraryBundles = options.libraryBundles || DEFAULT_LIBRARY_BUNDLES;
            this.soundFontUrls = options.soundFontUrls ||
                (options.soundFontUrl ? [options.soundFontUrl] : DEFAULT_SOUNDFONT_URLS);
            this.notes = [];
            this.tracks = [];
            this.source = null;
            this.sourceRevision = 0;
            this.playerLoadedRevision = -1;
            this.eventGroups = [];
            this.trackChannels = [];
            this.activeNoteOwners = new Map();
            this.playbackRate = 1;
            this.loopEnabled = false;
            this.volume = -6;
            this.position = 0;
            this.duration = 0;
            this.running = false;
            this.startedAt = 0;
            this.eventCursor = 0;
            this.schedulerTimer = 0;
            this.pendingTimers = new Set();
            this.playerMonitorTimer = 0;
            this.lastPlayerTick = 0;
            this.cachedPlayerTick = 0;
            this.playerTickRequestPending = false;
            this.generation = 0;
            this.onEnded = () => {};
            this.onLoop = () => {};
            this.readyPromise = null;
            this.audioContext = null;
            this.synth = null;
            this.synthMode = 'script';
            this.preferAudioWorklet = shouldEnableAudioWorklet(options);
            this.outputNode = null;
            this.gainNode = null;
            this.soundFontId = null;
        }

        load(notes, tracks, source = null) {
            this.stop(true);
            this.notes = notes || [];
            this.tracks = tracks || [];
            this.source = source;
            this.sourceRevision++;
            this.playerLoadedRevision = -1;
            this.trackChannels = this.assignTrackChannels();
            this.eventGroups = this.buildEventGroups();
            this.duration = this.notes.reduce(
                (max, note) => Math.max(max, note.time + note.duration),
                0
            );
        }

        assignTrackChannels() {
            const sourceChannels = this.source?.trackChannels;
            if (
                Array.isArray(sourceChannels) &&
                sourceChannels.length === this.tracks.length
            ) {
                return sourceChannels.map((channel, index) => (
                    Number.isInteger(channel) && channel >= 0 && channel < 16
                        ? channel
                        : MELODIC_CHANNELS[index % MELODIC_CHANNELS.length]
                ));
            }

            const melodicTrackCount = this.tracks.filter(track => !track.isPercussion).length;
            const sharePrograms = melodicTrackCount > MELODIC_CHANNELS.length;
            const programChannels = new Map();
            let melodicIndex = 0;
            return this.tracks.map(track => {
                if (track.isPercussion) return 9;

                const programKey = this.resolveProgram(track);
                if (sharePrograms && programChannels.has(programKey)) {
                    return programChannels.get(programKey);
                }

                const channel = MELODIC_CHANNELS[melodicIndex % MELODIC_CHANNELS.length];
                melodicIndex++;
                if (sharePrograms) programChannels.set(programKey, channel);
                return channel;
            });
        }

        buildEventGroups() {
            const events = [];
            this.notes.forEach((note, noteId) => {
                events.push({ time: note.time, type: 'on', note, noteId });
                events.push({
                    time: note.time + note.duration,
                    type: 'off',
                    note,
                    noteId
                });
            });
            events.sort((a, b) => a.time - b.time || (a.type === 'off' ? -1 : 1));

            const groups = [];
            events.forEach(event => {
                const previous = groups[groups.length - 1];
                if (previous && Math.abs(previous.time - event.time) < 0.000001) {
                    previous.events.push(event);
                } else {
                    groups.push({ time: event.time, events: [event] });
                }
            });
            return groups;
        }

        async ensureReady() {
            if (this.soundFontId !== null && this.synth) return;
            if (this.readyPromise) return this.readyPromise;

            this.readyPromise = this.initialize().catch(async error => {
                await this.disposeRuntime();
                this.readyPromise = null;
                throw error;
            });
            return this.readyPromise;
        }

        async initialize() {
            this.onStatus('正在加载 FluidSynth 播放引擎...');
            const activeBundle = await ensureFluidSynthLibrary(this.libraryBundles);

            const Synthesizer = global.JSSynth.Synthesizer;

            const AudioContextClass = global.AudioContext || global.webkitAudioContext;
            if (!AudioContextClass) {
                throw new Error('当前浏览器不支持 Web Audio API');
            }

            this.audioContext = new AudioContextClass();
            const synthOutput = await this.createSynthOutput(Synthesizer, activeBundle);
            this.synth = synthOutput.synth;
            this.synthMode = synthOutput.mode;
            this.outputNode = synthOutput.outputNode;
            this.gainNode = this.audioContext.createGain();
            this.outputNode.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);
            this.setVolume(this.volume);

            this.onStatus('正在读取高质量 SoundFont...');
            const soundFontData = await fetchFirstAvailable(
                this.soundFontUrls,
                progress => this.reportSoundFontProgress(progress)
            );
            await this.loadSoundFontData(soundFontData, Synthesizer);
            this.configurePrograms();
            this.onStatus(
                this.synthMode === 'worklet'
                    ? 'FluidSynth 高质量音色已就绪（AudioWorklet）'
                    : 'FluidSynth 高质量音色已就绪（兼容模式）'
            );
        }

        async createSynthOutput(Synthesizer, activeBundle) {
            const workletOutput = await this.tryCreateWorkletSynth(activeBundle);
            if (workletOutput) return workletOutput;

            const synth = new Synthesizer();
            synth.init(this.audioContext.sampleRate);
            if (typeof synth.setPolyphony === 'function') {
                synth.setPolyphony(512);
            }
            return {
                synth,
                mode: 'script',
                outputNode: synth.createAudioNode(this.audioContext, 4096)
            };
        }

        async tryCreateWorkletSynth(activeBundle) {
            if (!this.preferAudioWorklet) return null;

            const WorkletSynth = global.JSSynth?.AudioWorkletNodeSynthesizer;
            if (!WorkletSynth || !this.audioContext?.audioWorklet) return null;

            try {
                await this.loadWorkletProcessor(WorkletSynth, activeBundle);
                const synth = new WorkletSynth();
                const outputNode = await Promise.resolve(synth.createAudioNode(this.audioContext, {
                    'synth.sample-rate': this.audioContext.sampleRate,
                    'synth.polyphony': 512
                }));
                return { synth, mode: 'worklet', outputNode };
            } catch (error) {
                console.warn('AudioWorklet FluidSynth 初始化失败，回退到兼容模式:', error);
                this.onStatus('AudioWorklet 初始化失败，已切换到兼容模式...');
                return null;
            }
        }

        async loadWorkletProcessor(WorkletSynth, activeBundle) {
            let lastError = null;
            if (typeof WorkletSynth.registerAudioWorkletProcessor === 'function') {
                try {
                    await WorkletSynth.registerAudioWorkletProcessor(this.audioContext);
                    return;
                } catch (error) {
                    lastError = error;
                }
            }

            const workletUrls = activeBundle?.workletUrls || [];
            for (const url of workletUrls) {
                try {
                    await this.audioContext.audioWorklet.addModule(url);
                    return;
                } catch (error) {
                    lastError = error;
                }
            }
            throw lastError || new Error('当前 js-synthesizer 没有可用的 AudioWorklet 处理器');
        }

        reportSoundFontProgress(progress) {
            const isRemote = /^https?:\/\//i.test(progress.url || '');
            const action = isRemote ? '下载' : '读取本地';

            if (progress.done) {
                this.onStatus(
                    isRemote
                        ? 'SoundFont 已下载，正在载入 FluidSynth...'
                        : '本地 SoundFont 已读取，正在载入 FluidSynth...'
                );
                return;
            }

            if (progress.total > 0) {
                const percent = Math.min(100, Math.round(progress.loaded / progress.total * 100));
                this.onStatus(
                    `正在${action} SoundFont：${percent}% ` +
                    `(${formatMegabytes(progress.loaded)} / ${formatMegabytes(progress.total)})`
                );
                return;
            }

            if (progress.loaded > 0) {
                this.onStatus(`正在${action} SoundFont：已读取 ${formatMegabytes(progress.loaded)}`);
                return;
            }

            this.onStatus(`正在${action} SoundFont...`);
        }

        async loadSoundFontData(soundFontData, Synthesizer) {
            try {
                const loadData =
                    this.synthMode === 'worklet' && typeof soundFontData?.slice === 'function'
                        ? soundFontData.slice(0)
                        : soundFontData;
                this.soundFontId = await withTimeout(
                    this.synth.loadSFont(loadData),
                    SOUNDFONT_LOAD_TIMEOUT_MS,
                    `FluidSynth SoundFont 载入超时（${SOUNDFONT_LOAD_TIMEOUT_MS / 1000} 秒）`
                );
                return;
            } catch (error) {
                if (this.synthMode !== 'worklet') throw error;

                console.warn('AudioWorklet SoundFont 载入失败，回退到兼容模式:', error);
                this.onStatus('AudioWorklet 载入 SoundFont 失败，正在回退兼容模式...');
                await this.switchToScriptSynth(Synthesizer);
                this.soundFontId = await withTimeout(
                    this.synth.loadSFont(soundFontData),
                    SOUNDFONT_LOAD_TIMEOUT_MS,
                    `兼容模式 SoundFont 载入超时（${SOUNDFONT_LOAD_TIMEOUT_MS / 1000} 秒）`
                );
            }
        }

        async switchToScriptSynth(Synthesizer) {
            const previousSynth = this.synth;
            const previousOutputNode = this.outputNode;

            try {
                previousSynth?.stopPlayer?.();
                await Promise.resolve(previousSynth?.close?.());
            } catch (error) {
                console.warn('AudioWorklet FluidSynth 清理失败:', error);
            }

            try {
                previousOutputNode?.disconnect();
            } catch (error) {
                console.warn('AudioWorklet 输出节点断开失败:', error);
            }

            const synth = new Synthesizer();
            synth.init(this.audioContext.sampleRate);
            if (typeof synth.setPolyphony === 'function') {
                synth.setPolyphony(512);
            }
            const outputNode = synth.createAudioNode(this.audioContext, 4096);
            outputNode.connect(this.gainNode);

            this.synth = synth;
            this.synthMode = 'script';
            this.outputNode = outputNode;
            this.soundFontId = null;
            this.playerLoadedRevision = -1;
            this.cachedPlayerTick = 0;
            this.playerTickRequestPending = false;
        }

        async dispose() {
            this.stop(false);
            await this.disposeRuntime();
            this.readyPromise = null;
        }

        async disposeRuntime() {
            this.clearPlayerMonitor();
            this.synth?.stopPlayer?.();
            try {
                await Promise.resolve(this.synth?.close?.());
                this.outputNode?.disconnect();
                this.gainNode?.disconnect();
                if (this.audioContext && this.audioContext.state !== 'closed') {
                    await this.audioContext.close();
                }
            } catch (error) {
                console.warn('FluidSynth 资源清理失败:', error);
            }

            this.audioContext = null;
            this.synth = null;
            this.synthMode = 'script';
            this.outputNode = null;
            this.gainNode = null;
            this.soundFontId = null;
            this.playerLoadedRevision = -1;
            this.cachedPlayerTick = 0;
            this.playerTickRequestPending = false;
        }

        resolveTrackInstrumentType(track) {
            if (!track) return 'default';
            if (track.instrument === 'midi_auto') {
                if (track.isPercussion) return 'gm_drum';
                if (typeof track.gmProgram === 'number') return `gm:${track.gmProgram}`;
                return 'default';
            }
            return track.instrument || 'default';
        }

        resolveProgram(track) {
            const type = this.resolveTrackInstrumentType(track);
            if (type.startsWith('gm:')) {
                const program = parseInt(type.slice(3), 10);
                return Number.isNaN(program) ? 0 : clampMidi(program);
            }
            return INSTRUMENT_PROGRAMS[type] ?? 0;
        }

        configurePrograms() {
            if (!this.synth || this.soundFontId === null) return;

            this.trackChannels = this.assignTrackChannels();
            this.tracks.forEach((track, index) => {
                const channel = this.trackChannels[index] ?? 0;
                const program = track.isPercussion ? 0 : this.resolveProgram(track);
                const bank = track.isPercussion ? 128 : 0;

                if (typeof this.synth.midiProgramSelect === 'function') {
                    this.synth.midiProgramSelect(channel, this.soundFontId, bank, program);
                } else if (typeof this.synth.midiProgramChange === 'function') {
                    this.synth.midiProgramChange(channel, program);
                }
            });
        }

        async preloadTracks() {
            await this.ensureReady();
            this.configurePrograms();
            if (this.usesMidiPlayer()) {
                await this.prepareMidiPlayer();
            }
        }

        async getInstrument() {
            await this.ensureReady();
            this.configurePrograms();
            return this.synth;
        }

        setVolume(dbValue) {
            this.volume = Number.isFinite(dbValue) ? dbValue : -6;
            if (this.gainNode) {
                this.gainNode.gain.value = Math.pow(10, this.volume / 20);
            }
        }

        setPlaybackRate(rate) {
            const position = this.getCurrentTime();
            this.playbackRate = Number.isFinite(rate) && rate > 0 ? rate : 1;

            if (this.usesMidiPlayer() && this.synth) {
                this.applyPlayerSettings();
                this.position = position;
                if (this.running && this.audioContext) {
                    this.startedAt = this.audioContext.currentTime;
                }
                return position;
            }

            if (this.running) {
                this.position = position;
                this.restartScheduler();
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
            if (this.usesMidiPlayer() && this.synth) {
                this.synth.setPlayerLoop(this.loopEnabled ? -1 : 0);
            }
        }

        async play(startTime = this.position, options = {}) {
            if (this.notes.length === 0) return;

            await this.ensureReady();
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            this.onEnded = options.onEnded || this.onEnded;
            this.onLoop = options.onLoop || this.onLoop;
            this.loopEnabled = options.loop !== undefined ? Boolean(options.loop) : this.loopEnabled;

            if (this.usesMidiPlayer()) {
                await this.playMidiPlayer(startTime);
                return;
            }

            this.position = Math.max(0, startTime || 0);
            this.running = true;
            this.configurePrograms();
            this.restartScheduler();
        }

        pause() {
            if (this.usesMidiPlayer()) {
                this.position = this.getCurrentTime();
                this.running = false;
                this.generation++;
                this.clearPlayerMonitor();
                this.synth?.stopPlayer();
                return this.position;
            }

            this.position = this.getCurrentTime();
            this.running = false;
            this.clearScheduler();
            this.allSoundsOff();
            return this.position;
        }

        stop(resetToStart = true) {
            if (this.usesMidiPlayer()) {
                if (!resetToStart) this.position = this.getCurrentTime();
                this.running = false;
                this.generation++;
                this.clearPlayerMonitor();
                this.synth?.stopPlayer();
                if (resetToStart) this.position = 0;
                if (this.synth && this.playerLoadedRevision === this.sourceRevision) {
                    const tick = this.secondsToTicks(this.position);
                    this.synth.seekPlayer(tick);
                    this.lastPlayerTick = tick;
                    this.cachedPlayerTick = tick;
                }
                return this.position;
            }

            this.running = false;
            this.clearScheduler();
            this.allSoundsOff();
            if (resetToStart) this.position = 0;
            return this.position;
        }

        seek(songTime) {
            this.position = Math.max(0, songTime || 0);
            if (this.usesMidiPlayer()) {
                if (this.synth && this.playerLoadedRevision === this.sourceRevision) {
                    this.allSoundsOff();
                    const tick = this.secondsToTicks(this.position);
                    this.synth.seekPlayer(tick);
                    this.lastPlayerTick = tick;
                    this.cachedPlayerTick = tick;
                }
                if (this.running && this.audioContext) {
                    this.startedAt = this.audioContext.currentTime;
                }
                return this.position;
            }

            if (this.running) {
                this.restartScheduler();
            }
            return this.position;
        }

        getCurrentTime() {
            if (!this.running || !this.audioContext) return this.position;
            return this.position +
                (this.audioContext.currentTime - this.startedAt) * this.playbackRate;
        }

        isPlaying() {
            return this.running;
        }

        usesMidiPlayer() {
            return Boolean(
                this.source?.data &&
                typeof this.source.ticksToSeconds === 'function' &&
                typeof this.source.secondsToTicks === 'function'
            );
        }

        ticksToSeconds(tick) {
            return this.source.ticksToSeconds(Math.max(0, tick || 0));
        }

        secondsToTicks(seconds) {
            return this.source.secondsToTicks(Math.max(0, seconds || 0));
        }

        async prepareMidiPlayer() {
            if (!this.usesMidiPlayer()) return;
            if (this.playerLoadedRevision === this.sourceRevision) return;
            if (
                typeof this.synth.resetPlayer !== 'function' ||
                typeof this.synth.addSMFDataToPlayer !== 'function'
            ) {
                throw new Error('当前 js-synthesizer 不支持内置 MIDI Player');
            }

            const revision = this.sourceRevision;
            await this.synth.resetPlayer();
            await this.synth.addSMFDataToPlayer(this.source.data);
            if (revision !== this.sourceRevision) {
                return this.prepareMidiPlayer();
            }

            this.installPlayerEventHook();
            this.playerLoadedRevision = revision;
            this.applyPlayerSettings();
            const tick = this.secondsToTicks(this.position);
            this.synth.seekPlayer(tick);
            this.lastPlayerTick = tick;
            this.cachedPlayerTick = tick;
        }

        installPlayerEventHook() {
            if (typeof this.synth.hookPlayerMIDIEvents !== 'function') return;

            this.synth.hookPlayerMIDIEvents((synth, eventType, event) => {
                const channel = event.getChannel();
                const trackIndexes = this.trackChannels
                    .map((trackChannel, index) => ({ trackChannel, index }))
                    .filter(item => item.trackChannel === channel)
                    .map(item => item.index);

                if (trackIndexes.length !== 1) return false;
                const track = this.tracks[trackIndexes[0]];
                if (!track) return false;

                const messageType = eventType & 0xF0;
                if (messageType === 0x90 && event.getVelocity() > 0) {
                    if (!track.enabled || track.volume <= 0) return true;
                    event.setVelocity(clampMidi(event.getVelocity() * track.volume));
                } else if (
                    messageType === 0xC0 &&
                    track.instrument !== 'midi_auto'
                ) {
                    event.setProgram(this.resolveProgram(track));
                }
                return false;
            }, null);
        }

        applyPlayerSettings() {
            if (!this.synth || typeof this.synth.setPlayerTempo !== 'function') return;
            const tempoType = global.JSSynth?.Constants?.PlayerSetTempoType?.Internal ?? 0;
            this.synth.setPlayerTempo(tempoType, this.playbackRate);
            this.synth.setPlayerLoop(this.loopEnabled ? -1 : 0);
        }

        async playMidiPlayer(startTime) {
            await this.prepareMidiPlayer();

            this.synth.stopPlayer();
            this.position = Math.max(0, startTime || 0);
            const startTick = this.secondsToTicks(this.position);
            this.synth.seekPlayer(startTick);
            this.lastPlayerTick = startTick;
            this.cachedPlayerTick = startTick;
            this.applyPlayerSettings();

            this.running = true;
            this.startedAt = this.audioContext.currentTime;
            this.generation++;
            const generation = this.generation;
            this.clearPlayerMonitor();
            await this.synth.playPlayer();
            this.monitorMidiPlayer(generation);
        }

        monitorMidiPlayer(generation) {
            if (!this.running || generation !== this.generation) return;

            if (this.loopEnabled) {
                const tick = this.readPlayerCurrentTick();
                if (Number.isFinite(tick) && tick < this.lastPlayerTick) {
                    this.position = 0;
                    this.startedAt = this.audioContext.currentTime;
                    this.onLoop();
                }
                if (Number.isFinite(tick)) this.lastPlayerTick = tick;
            }

            if (!this.isPlayerStillPlaying()) {
                const position = this.getCurrentTime();
                if (position < this.duration - END_EPSILON_SECONDS) {
                    this.playerMonitorTimer = global.setTimeout(
                        () => this.monitorMidiPlayer(generation),
                        PLAYER_MONITOR_INTERVAL_MS
                    );
                    return;
                }

                this.running = false;
                this.position = this.duration;
                this.clearPlayerMonitor();
                this.onEnded();
                return;
            }

            this.playerMonitorTimer = global.setTimeout(
                () => this.monitorMidiPlayer(generation),
                PLAYER_MONITOR_INTERVAL_MS
            );
        }

        readPlayerCurrentTick() {
            if (!this.synth) return NaN;

            if (typeof this.synth.getPlayerCurrentTick === 'function') {
                const tick = this.synth.getPlayerCurrentTick();
                if (Number.isFinite(tick)) this.cachedPlayerTick = tick;
                return tick;
            }

            if (
                typeof this.synth.retrievePlayerCurrentTick === 'function' &&
                !this.playerTickRequestPending
            ) {
                this.playerTickRequestPending = true;
                Promise.resolve(this.synth.retrievePlayerCurrentTick())
                    .then(tick => {
                        if (Number.isFinite(tick)) this.cachedPlayerTick = tick;
                    })
                    .catch(error => {
                        console.warn('FluidSynth 播放进度读取失败:', error);
                    })
                    .finally(() => {
                        this.playerTickRequestPending = false;
                    });
            }

            return this.cachedPlayerTick;
        }

        isPlayerStillPlaying() {
            if (typeof this.synth?.isPlayerPlaying !== 'function') return true;

            const isPlaying = this.synth.isPlayerPlaying();
            const justStarted =
                this.running &&
                this.audioContext &&
                this.audioContext.currentTime - this.startedAt < 0.25;
            return isPlaying || justStarted;
        }

        clearPlayerMonitor() {
            if (this.playerMonitorTimer) {
                global.clearTimeout(this.playerMonitorTimer);
                this.playerMonitorTimer = 0;
            }
        }

        restartScheduler() {
            this.clearScheduler();
            this.allSoundsOff();
            this.generation++;
            this.startedAt = this.audioContext.currentTime;
            this.eventCursor = this.findEventCursor(this.position);
            this.restoreSustainedNotes();
            this.pumpScheduler(this.generation);
        }

        restoreSustainedNotes() {
            if (this.position <= 0) return;

            this.notes
                .map((note, noteId) => ({ note, noteId }))
                .filter(({ note }) => (
                    note.time < this.position &&
                    note.time + note.duration > this.position
                ))
                .sort((a, b) => a.note.time - b.note.time)
                .forEach(({ note, noteId }) => {
                    this.executeEvent({
                        time: this.position,
                        type: 'on',
                        note,
                        noteId
                    });
                });
        }

        findEventCursor(songTime) {
            let low = 0;
            let high = this.eventGroups.length;
            while (low < high) {
                const middle = Math.floor((low + high) / 2);
                if (this.eventGroups[middle].time < songTime) low = middle + 1;
                else high = middle;
            }
            return low;
        }

        pumpScheduler(generation) {
            if (!this.running || generation !== this.generation) return;

            const now = this.getCurrentTime();
            const horizon = now + SCHEDULE_AHEAD_SECONDS * this.playbackRate;
            while (
                this.eventCursor < this.eventGroups.length &&
                this.eventGroups[this.eventCursor].time <= horizon
            ) {
                const group = this.eventGroups[this.eventCursor++];
                const delay = Math.max(0, (group.time - now) / this.playbackRate * 1000);
                const timer = global.setTimeout(() => {
                    this.pendingTimers.delete(timer);
                    if (this.running && generation === this.generation) {
                        this.executeEventGroup(group);
                    }
                }, delay);
                this.pendingTimers.add(timer);
            }

            if (now >= this.duration + 0.05) {
                if (this.loopEnabled) {
                    this.position = 0;
                    this.onLoop();
                    this.restartScheduler();
                } else {
                    this.position = this.duration;
                    this.stop(false);
                    this.onEnded();
                }
                return;
            }

            this.schedulerTimer = global.setTimeout(
                () => this.pumpScheduler(generation),
                SCHEDULE_INTERVAL_MS
            );
        }

        executeEventGroup(group) {
            group.events.forEach(event => this.executeEvent(event));
        }

        executeEvent(event) {
            const track = this.tracks[event.note.track];
            if (!track || !this.synth) return;

            const channel = this.trackChannels[event.note.track] ?? 0;
            const noteKey = `${channel}:${event.note.midi}`;
            if (event.type === 'off') {
                if (this.activeNoteOwners.get(noteKey) === event.noteId) {
                    this.synth.midiNoteOff(channel, event.note.midi);
                    this.activeNoteOwners.delete(noteKey);
                }
                return;
            }
            if (!track.enabled || track.volume <= 0) return;

            const velocity = clampMidi(event.note.velocity * track.volume * 127);
            if (velocity > 0) {
                if (this.activeNoteOwners.has(noteKey)) {
                    this.synth.midiNoteOff(channel, event.note.midi);
                }
                this.synth.midiNoteOn(channel, event.note.midi, velocity);
                this.activeNoteOwners.set(noteKey, event.noteId);
            }
        }

        clearScheduler() {
            this.generation++;
            if (this.schedulerTimer) {
                global.clearTimeout(this.schedulerTimer);
                this.schedulerTimer = 0;
            }
            this.pendingTimers.forEach(timer => global.clearTimeout(timer));
            this.pendingTimers.clear();
        }

        allSoundsOff() {
            this.activeNoteOwners.clear();
            if (!this.synth) return;
            for (let channel = 0; channel < 16; channel++) {
                if (typeof this.synth.midiControl === 'function') {
                    this.synth.midiControl(channel, 123, 0);
                    this.synth.midiControl(channel, 120, 0);
                }
            }
        }
    }

    if (!global.MidiPlayerAudio) {
        throw new Error('音频引擎控制器尚未加载');
    }

    global.MidiPlayerAudio.registerEngine(
        'fluidsynth',
        options => new FluidSynthAudioEngine(options)
    );
})(window);
