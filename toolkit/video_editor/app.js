(function () {
    const { FFmpeg } = FFmpegWASM;
    const { fetchFile, toBlobURL } = FFmpegUtil;

    const state = {
        ffmpeg: null,
        ready: false,
        inputFile: null,
        inputName: "",
        duration: 0,
        start: 0,
        end: 0,
        sourceUrl: "",
        outputUrl: ""
    };

    const el = {
        themeToggle: document.getElementById("themeToggle"),
        videoFile: document.getElementById("videoFile"),
        fileMeta: document.getElementById("fileMeta"),
        startInput: document.getElementById("startInput"),
        endInput: document.getElementById("endInput"),
        startRange: document.getElementById("startRange"),
        endRange: document.getElementById("endRange"),
        setStartFromCurrent: document.getElementById("setStartFromCurrent"),
        setEndFromCurrent: document.getElementById("setEndFromCurrent"),
        clipSummary: document.getElementById("clipSummary"),
        formatSelect: document.getElementById("formatSelect"),
        widthSelect: document.getElementById("widthSelect"),
        qualitySelect: document.getElementById("qualitySelect"),
        keepAudio: document.getElementById("keepAudio"),
        gifFps: document.getElementById("gifFps"),
        videoQualityRow: document.getElementById("videoQualityRow"),
        gifFpsRow: document.getElementById("gifFpsRow"),
        loadEngineBtn: document.getElementById("loadEngineBtn"),
        exportBtn: document.getElementById("exportBtn"),
        clearResultBtn: document.getElementById("clearResultBtn"),
        statusText: document.getElementById("statusText"),
        logPanel: document.getElementById("logPanel"),
        videoPreview: document.getElementById("videoPreview"),
        viewerMeta: document.getElementById("viewerMeta"),
        resultEmpty: document.getElementById("resultEmpty"),
        resultBox: document.getElementById("resultBox"),
        resultName: document.getElementById("resultName"),
        downloadLink: document.getElementById("downloadLink"),
        resultPreviewWrap: document.getElementById("resultPreviewWrap")
    };

    function formatSeconds(seconds) {
        if (!Number.isFinite(seconds)) {
            return "0.00";
        }
        return seconds.toFixed(2);
    }

    function toNumber(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function log(message) {
        const now = new Date();
        const stamp = [
            String(now.getHours()).padStart(2, "0"),
            String(now.getMinutes()).padStart(2, "0"),
            String(now.getSeconds()).padStart(2, "0")
        ].join(":");
        el.logPanel.textContent += `\n[${stamp}] ${message}`;
        el.logPanel.scrollTop = el.logPanel.scrollHeight;
    }

    function setStatus(text, isError) {
        el.statusText.textContent = `状态：${text}`;
        el.statusText.classList.toggle("error", Boolean(isError));
    }

    function getClipDuration() {
        return Math.max(0, state.end - state.start);
    }

    function syncClipUI() {
        if (state.duration <= 0) {
            state.start = 0;
            state.end = 0;
        } else {
            const max = state.duration;
            state.start = Math.min(Math.max(0, state.start), max);
            state.end = Math.min(Math.max(state.start + 0.05, state.end), max);
            if (state.end - state.start < 0.05) {
                state.end = Math.min(max, state.start + 0.05);
            }
        }

        el.startRange.max = String(state.duration);
        el.endRange.max = String(state.duration);
        el.startRange.value = String(state.start);
        el.endRange.value = String(state.end);
        el.startInput.value = formatSeconds(state.start);
        el.endInput.value = formatSeconds(state.end);

        el.clipSummary.textContent = `片段：${formatSeconds(state.start)}s ~ ${formatSeconds(state.end)}s（时长 ${formatSeconds(getClipDuration())}s）`;
    }

    function updateViewerMeta() {
        const current = toNumber(el.videoPreview.currentTime, 0);
        el.viewerMeta.textContent = `时长：${formatSeconds(state.duration)}s，当前播放点：${formatSeconds(current)}s`;
    }

    function clearOutput() {
        if (state.outputUrl) {
            URL.revokeObjectURL(state.outputUrl);
            state.outputUrl = "";
        }
        el.resultPreviewWrap.innerHTML = "";
        el.resultBox.classList.add("hidden");
        el.resultEmpty.classList.remove("hidden");
        el.resultName.textContent = "";
        el.downloadLink.removeAttribute("href");
    }

    function updateFormatUI() {
        const format = el.formatSelect.value;
        const isGif = format === "gif";
        el.gifFpsRow.classList.toggle("hidden", !isGif);
        el.videoQualityRow.classList.toggle("hidden", isGif);
    }

    function toggleTheme() {
        document.documentElement.classList.toggle("light");
        const lightEnabled = document.documentElement.classList.contains("light");
        localStorage.setItem("clipforge-theme", lightEnabled ? "light" : "dark");
    }

    async function ensureFFmpeg() {
        if (state.ready) {
            return;
        }

        setStatus("正在加载引擎（首次会较慢）...");
        el.loadEngineBtn.disabled = true;
        log("开始加载 ffmpeg.wasm 核心...");

        const ffmpeg = new FFmpeg();
        ffmpeg.on("log", ({ message }) => {
            if (message) {
                log(message);
            }
        });

        const coreBaseURLs = [
            "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd",
            "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd"
        ];

        let loaded = false;
        let lastError = null;

        for (const baseURL of coreBaseURLs) {
            try {
                log(`尝试核心源：${baseURL}`);
                await ffmpeg.load({
                    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
                    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm")
                });
                log(`核心源加载成功：${baseURL}`);
                loaded = true;
                break;
            } catch (error) {
                lastError = error;
                log(`核心源加载失败：${baseURL}`);
            }
        }

        if (!loaded) {
            throw lastError || new Error("ffmpeg core 加载失败");
        }

        state.ffmpeg = ffmpeg;
        state.ready = true;
        setStatus("引擎已就绪");
        log("ffmpeg.wasm 已就绪。");
        el.loadEngineBtn.textContent = "引擎已加载";
    }

    function getInputExt(fileName) {
        const idx = fileName.lastIndexOf(".");
        if (idx === -1) {
            return "mp4";
        }
        const ext = fileName.slice(idx + 1).toLowerCase();
        return ext || "mp4";
    }

    function qualityToCrf(quality) {
        if (quality === "high") {
            return "20";
        }
        if (quality === "small") {
            return "30";
        }
        return "24";
    }

    function buildScaleFilter(widthValue, forGif) {
        if (widthValue === "keep") {
            return forGif ? "scale=iw:-1:flags=lanczos" : "";
        }
        const width = Number(widthValue);
        if (!Number.isFinite(width) || width <= 0) {
            return "";
        }
        return forGif ? `scale=${width}:-1:flags=lanczos` : `scale=${width}:-2`;
    }

    async function safeDeleteFile(ffmpeg, fileName) {
        try {
            await ffmpeg.deleteFile(fileName);
        } catch (_) {
            // Ignore missing temp files to avoid masking successful exports.
        }
    }

    async function exportClip() {
        if (!state.inputFile) {
            setStatus("请先选择视频文件", true);
            return;
        }

        if (getClipDuration() < 0.05) {
            setStatus("切片时长过短，请至少保留 0.05 秒", true);
            return;
        }

        try {
            el.exportBtn.disabled = true;
            await ensureFFmpeg();

            setStatus("正在处理，请稍候...");
            clearOutput();

            const ffmpeg = state.ffmpeg;
            const inputName = `input.${getInputExt(state.inputFile.name)}`;
            state.inputName = inputName;

            await ffmpeg.writeFile(inputName, await fetchFile(state.inputFile));
            log(`已写入输入文件：${inputName}`);

            const start = formatSeconds(state.start);
            const end = formatSeconds(state.end);
            const format = el.formatSelect.value;
            const widthValue = el.widthSelect.value;
            const outputName = `clip_${Date.now()}.${format}`;
            const scaleFilter = buildScaleFilter(widthValue, format === "gif");

            if (format === "gif") {
                const fps = Math.max(5, Math.min(30, toNumber(el.gifFps.value, 12)));
                const palette = "palette.png";
                const paletteFilter = `fps=${fps},${scaleFilter},palettegen`;
                const usePaletteFilter = `fps=${fps},${scaleFilter}[x];[x][1:v]paletteuse`;

                await ffmpeg.exec([
                    "-ss", start,
                    "-to", end,
                    "-i", inputName,
                    "-vf", paletteFilter,
                    palette
                ]);

                await ffmpeg.exec([
                    "-ss", start,
                    "-to", end,
                    "-i", inputName,
                    "-i", palette,
                    "-lavfi", usePaletteFilter,
                    outputName
                ]);
            } else {
                const args = [
                    "-ss", start,
                    "-to", end,
                    "-i", inputName
                ];

                if (scaleFilter) {
                    args.push("-vf", scaleFilter);
                }

                if (format === "mp4") {
                    args.push(
                        "-c:v", "libx264",
                        "-preset", "veryfast",
                        "-crf", qualityToCrf(el.qualitySelect.value),
                        "-pix_fmt", "yuv420p"
                    );
                    if (el.keepAudio.checked) {
                        args.push("-c:a", "aac", "-b:a", "128k");
                    } else {
                        args.push("-an");
                    }
                }

                if (format === "webm") {
                    args.push(
                        "-c:v", "libvpx-vp9",
                        "-crf", qualityToCrf(el.qualitySelect.value),
                        "-b:v", "0"
                    );
                    if (el.keepAudio.checked) {
                        args.push("-c:a", "libopus", "-b:a", "96k");
                    } else {
                        args.push("-an");
                    }
                }

                args.push(outputName);
                await ffmpeg.exec(args);
            }

            const outputData = await ffmpeg.readFile(outputName);
            const mimeMap = {
                mp4: "video/mp4",
                webm: "video/webm",
                gif: "image/gif"
            };
            const blob = new Blob([outputData.buffer], {
                type: mimeMap[format] || "application/octet-stream"
            });

            if (state.outputUrl) {
                URL.revokeObjectURL(state.outputUrl);
            }
            state.outputUrl = URL.createObjectURL(blob);

            el.downloadLink.href = state.outputUrl;
            el.downloadLink.download = outputName;
            el.resultName.textContent = `${outputName}（${(blob.size / 1024 / 1024).toFixed(2)} MB）`;

            el.resultPreviewWrap.innerHTML = "";
            if (format === "gif") {
                const img = document.createElement("img");
                img.src = state.outputUrl;
                img.alt = "GIF 导出预览";
                el.resultPreviewWrap.appendChild(img);
            } else {
                const outVideo = document.createElement("video");
                outVideo.controls = true;
                outVideo.src = state.outputUrl;
                outVideo.preload = "metadata";
                el.resultPreviewWrap.appendChild(outVideo);
            }

            el.resultEmpty.classList.add("hidden");
            el.resultBox.classList.remove("hidden");

            setStatus("导出完成");
            log(`导出完成：${outputName}`);

            await safeDeleteFile(ffmpeg, inputName);
            if (format === "gif") {
                await safeDeleteFile(ffmpeg, "palette.png");
            }
            await safeDeleteFile(ffmpeg, outputName);
        } catch (error) {
            console.error(error);
            log(`错误：${error.message || String(error)}`);
            setStatus("导出失败，请查看日志", true);
        } finally {
            el.exportBtn.disabled = false;
            if (!state.ready) {
                el.loadEngineBtn.disabled = false;
            }
        }
    }

    function handleFileChange() {
        const file = el.videoFile.files && el.videoFile.files[0];
        if (!file) {
            return;
        }

        state.inputFile = file;

        if (state.sourceUrl) {
            URL.revokeObjectURL(state.sourceUrl);
        }
        state.sourceUrl = URL.createObjectURL(file);

        el.videoPreview.src = state.sourceUrl;
        el.fileMeta.textContent = `${file.name} | ${(file.size / 1024 / 1024).toFixed(2)} MB`;
        setStatus("视频已加载，可设置切片区间");
        log(`已选择文件：${file.name}`);
    }

    function setStart(value) {
        state.start = Math.max(0, Math.min(value, Math.max(0, state.end - 0.05)));
        syncClipUI();
    }

    function setEnd(value) {
        const max = state.duration;
        state.end = Math.min(max, Math.max(value, state.start + 0.05));
        syncClipUI();
    }

    function registerEvents() {
        el.themeToggle.addEventListener("click", toggleTheme);
        el.videoFile.addEventListener("change", handleFileChange);

        el.videoPreview.addEventListener("loadedmetadata", () => {
            state.duration = toNumber(el.videoPreview.duration, 0);
            state.start = 0;
            state.end = state.duration;
            syncClipUI();
            updateViewerMeta();
        });

        el.videoPreview.addEventListener("timeupdate", updateViewerMeta);
        el.videoPreview.addEventListener("seeked", updateViewerMeta);

        el.startRange.addEventListener("input", () => {
            setStart(toNumber(el.startRange.value, state.start));
        });

        el.endRange.addEventListener("input", () => {
            setEnd(toNumber(el.endRange.value, state.end));
        });

        el.startInput.addEventListener("change", () => {
            setStart(toNumber(el.startInput.value, state.start));
        });

        el.endInput.addEventListener("change", () => {
            setEnd(toNumber(el.endInput.value, state.end));
        });

        el.setStartFromCurrent.addEventListener("click", () => {
            setStart(toNumber(el.videoPreview.currentTime, 0));
        });

        el.setEndFromCurrent.addEventListener("click", () => {
            setEnd(toNumber(el.videoPreview.currentTime, state.end));
        });

        el.formatSelect.addEventListener("change", updateFormatUI);
        el.loadEngineBtn.addEventListener("click", async () => {
            try {
                await ensureFFmpeg();
            } catch (error) {
                console.error(error);
                log(`引擎加载失败：${error.message || String(error)}`);
                setStatus("引擎加载失败", true);
                el.loadEngineBtn.disabled = false;
            }
        });
        el.exportBtn.addEventListener("click", exportClip);
        el.clearResultBtn.addEventListener("click", clearOutput);
    }

    function init() {
        registerEvents();
        updateFormatUI();
        syncClipUI();
        updateViewerMeta();
        log("ClipForge 已初始化。请选择视频文件后开始切片。");
    }

    init();
})();
