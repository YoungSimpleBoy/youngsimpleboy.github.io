const state = {
    selectedFile: null,
    currentJobId: null,
    pollTimer: null,
    health: null,
};

const DEFAULT_API_ORIGIN = "http://127.0.0.1:8765";
const OFFLINE_MESSAGE = "本地服务未启动或已退出，请先运行 start_marker_pdf.bat，然后刷新页面。";

function normalizeOrigin(origin) {
    if (!origin) {
        return "";
    }
    return origin.replace(/\/$/, "");
}

function resolveApiBase() {
    const params = new URLSearchParams(window.location.search);
    const queryApi = normalizeOrigin(params.get("api"));
    if (queryApi) {
        localStorage.setItem("marker-pdf-api-base", queryApi);
        return queryApi;
    }

    const savedApi = normalizeOrigin(localStorage.getItem("marker-pdf-api-base"));
    const sameOriginHosts = new Set(["127.0.0.1:8765", "localhost:8765"]);
    if (window.location.protocol.startsWith("http") && sameOriginHosts.has(window.location.host)) {
        return "";
    }
    if (savedApi) {
        return savedApi;
    }
    return DEFAULT_API_ORIGIN;
}

const API_BASE = resolveApiBase();

function apiUrl(path) {
    return `${API_BASE}${path}`;
}

function isNetworkError(error) {
    const message = error && typeof error.message === "string" ? error.message : String(error || "");
    return error instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(message);
}

function handleOfflineState(action) {
    state.health = null;
    setServiceState(false, "服务未连接");
    serviceMeta.textContent = OFFLINE_MESSAGE;
    recentJobs.innerHTML = '<p class="muted">服务离线，无法读取任务列表。</p>';
    renderLogs([`[error] ${action}失败。${OFFLINE_MESSAGE}`]);
}

const fileInput = document.getElementById("fileInput");
const pickFileBtn = document.getElementById("pickFileBtn");
const clearFileBtn = document.getElementById("clearFileBtn");
const convertBtn = document.getElementById("convertBtn");
const refreshJobsBtn = document.getElementById("refreshJobsBtn");
const clearCurrentBtn = document.getElementById("clearCurrentBtn");
const copyLogsBtn = document.getElementById("copyLogsBtn");
const openOutputBtn = document.getElementById("openOutputBtn");
const dropZone = document.getElementById("dropZone");

const serviceStatus = document.getElementById("serviceStatus");
const serviceMeta = document.getElementById("serviceMeta");
const selectedFileName = document.getElementById("selectedFileName");
const selectedFileInfo = document.getElementById("selectedFileInfo");
const outputDirInput = document.getElementById("outputDirInput");
const outputFormatSelect = document.getElementById("outputFormatSelect");
const processingModeSelect = document.getElementById("processingModeSelect");
const processingModeHint = document.getElementById("processingModeHint");
const pageRangeInput = document.getElementById("pageRangeInput");
const forceOcrInput = document.getElementById("forceOcrInput");
const paginateOutputInput = document.getElementById("paginateOutputInput");
const disableImageExtractionInput = document.getElementById("disableImageExtractionInput");
const disableMultiprocessingInput = document.getElementById("disableMultiprocessingInput");
const debugInput = document.getElementById("debugInput");

const jobHeadline = document.getElementById("jobHeadline");
const jobSummary = document.getElementById("jobSummary");
const jobStatusText = document.getElementById("jobStatusText");
const jobIdText = document.getElementById("jobIdText");
const jobFormatText = document.getElementById("jobFormatText");
const logPanel = document.getElementById("logPanel");
const resultList = document.getElementById("resultList");
const downloadLink = document.getElementById("downloadLink");
const commandPreview = document.getElementById("commandPreview");
const recentJobs = document.getElementById("recentJobs");
const themeToggle = document.getElementById("themeToggle");

function setTheme() {
    themeToggle.addEventListener("click", () => {
        const nextLight = document.documentElement.classList.toggle("light");
        localStorage.setItem("marker-pdf-theme", nextLight ? "light" : "dark");
    });
}

function setServiceState(ok, message) {
    serviceStatus.textContent = message;
    serviceStatus.classList.toggle("ready", ok);
    serviceStatus.classList.toggle("offline", !ok);
}

function setSelectedFile(file) {
    state.selectedFile = file;
    if (!file) {
        selectedFileName.textContent = "尚未选择 PDF";
        selectedFileInfo.textContent = "支持单文件转换，结果会生成到输出目录下的同名文件夹。";
        return;
    }

    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    selectedFileName.textContent = file.name;
    selectedFileInfo.textContent = `大小 ${sizeMb} MB`;
}

function formatStatus(status) {
    switch (status) {
        case "queued":
            return "QUEUED";
        case "running":
            return "RUNNING";
        case "completed":
            return "DONE";
        case "failed":
            return "FAILED";
        default:
            return "IDLE";
    }
}

function formatTimestamp(value) {
    if (!value) {
        return "-";
    }
    return new Date(value * 1000).toLocaleString("zh-CN");
}

function getProcessingModeMeta(mode) {
    switch (mode) {
        case "text":
            return {
                label: "文本优先",
                hint: "文本优先适合本身就带可复制文字的 PDF，会跳过 OCR 和图片提取，负载最低。",
            };
        case "quality":
            return {
                label: "高质量",
                hint: "高质量模式尽量保留 marker 的默认推理质量，但耗时更长、对硬件更重。",
            };
        case "balanced":
        default:
            return {
                label: "平衡模式",
                hint: "平衡模式会降低页面渲染 DPI 并使用更轻的 OCR，通常能明显减轻硬件负担。",
            };
    }
}

function syncProcessingModeHint() {
    processingModeHint.textContent = getProcessingModeMeta(processingModeSelect.value).hint;
}

function quoteArg(value) {
    if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
        return value;
    }
    return `"${value.replaceAll("\"", "\\\"")}"`;
}

function renderCommand(command) {
    if (!command || !command.length) {
        commandPreview.textContent = "命令预览会显示在这里。";
        return;
    }
    commandPreview.textContent = command.map(quoteArg).join(" ");
}

function renderResults(job) {
    if (!job || !job.resultFiles || !job.resultFiles.length) {
        resultList.innerHTML = '<p class="muted">尚无转换结果。</p>';
        return;
    }

    const blocks = [];
    if (job.outputFolder) {
        blocks.push(`
            <div class="result-item">
                <strong>输出目录</strong>
                <small>${job.outputFolder}</small>
            </div>
        `);
    }
    job.resultFiles.forEach((item) => {
        blocks.push(`
            <div class="result-item">
                <strong>${item}</strong>
                <small>生成时间：${formatTimestamp(job.updatedAt)}</small>
            </div>
        `);
    });
    resultList.innerHTML = blocks.join("");
}

function renderLogs(logs) {
    if (!logs || !logs.length) {
        logPanel.textContent = "日志会显示在这里。";
        return;
    }
    logPanel.textContent = logs.join("\n");
    logPanel.scrollTop = logPanel.scrollHeight;
}

function renderJob(job) {
    if (!job) {
        jobHeadline.textContent = "尚未开始转换";
        jobSummary.textContent = "选中 PDF 后点击开始转换，右侧会持续刷新日志。";
        jobStatusText.textContent = "IDLE";
        jobIdText.textContent = "-";
        jobFormatText.textContent = "-";
        downloadLink.href = "#";
        downloadLink.classList.add("disabled-link");
        openOutputBtn.disabled = true;
        renderLogs([]);
        renderResults(null);
        renderCommand(null);
        return;
    }

    jobHeadline.textContent = `${job.filename} · ${formatStatus(job.status)}`;
    jobSummary.textContent = job.error || `创建时间 ${formatTimestamp(job.createdAt)}，最近更新时间 ${formatTimestamp(job.updatedAt)}`;
    jobStatusText.textContent = formatStatus(job.status);
    jobIdText.textContent = job.jobId;
    jobFormatText.textContent = `${(job.outputFormat || "-").toUpperCase()} · ${getProcessingModeMeta(job.processingMode).label}`;

    renderLogs(job.logs || []);
    renderResults(job);
    renderCommand(job.command || []);

    if (job.archiveReady) {
        downloadLink.href = apiUrl(`/api/jobs/${job.jobId}/download`);
        downloadLink.classList.remove("disabled-link");
        downloadLink.setAttribute("aria-disabled", "false");
    } else {
        downloadLink.href = "#";
        downloadLink.classList.add("disabled-link");
        downloadLink.setAttribute("aria-disabled", "true");
    }

    openOutputBtn.disabled = !(job.outputFolder && (job.status === "completed"));
}

function renderRecentJobs(items) {
    if (!items || !items.length) {
        recentJobs.innerHTML = '<p class="muted">还没有任务记录。</p>';
        return;
    }

    recentJobs.innerHTML = items.map((job) => `
        <button class="job-item" type="button" data-job-id="${job.jobId}">
            <strong>${job.filename}</strong>
            <small>${formatStatus(job.status)} · ${formatTimestamp(job.createdAt)}</small>
            <small>${getProcessingModeMeta(job.processingMode).label} · ${job.outputFolder || job.outputRoot || "等待输出路径"}</small>
        </button>
    `).join("");
}

function stopPolling() {
    if (state.pollTimer) {
        window.clearTimeout(state.pollTimer);
        state.pollTimer = null;
    }
}

async function pollJob(jobId) {
    stopPolling();

    try {
        const response = await fetch(apiUrl(`/api/jobs/${jobId}`));
        if (!response.ok) {
            throw new Error("读取任务状态失败");
        }
        const job = await response.json();
        state.currentJobId = job.jobId;
        renderJob(job);

        if (job.status === "queued" || job.status === "running") {
            state.pollTimer = window.setTimeout(() => pollJob(jobId), 1400);
        } else {
            await loadRecentJobs();
        }
    } catch (error) {
        if (isNetworkError(error)) {
            handleOfflineState("读取任务状态");
            return;
        }
        renderLogs([`[error] ${error.message}`]);
    }
}

async function loadHealth() {
    try {
        const response = await fetch(apiUrl("/api/health"));
        if (!response.ok) {
            throw new Error("服务不可用");
        }
        const health = await response.json();
        state.health = health;
        setServiceState(true, "服务已就绪");
        serviceMeta.textContent = `marker: ${health.markerExecutable || "未找到"} · API: ${API_BASE || window.location.origin}`;
        if (!outputDirInput.value) {
            outputDirInput.value = health.defaultOutputRoot || "";
        }
        return true;
    } catch (error) {
        state.health = null;
        setServiceState(false, "服务未连接");
        serviceMeta.textContent = OFFLINE_MESSAGE;
        return false;
    }
}

async function loadRecentJobs() {
    try {
        const response = await fetch(apiUrl("/api/recent-jobs"));
        if (!response.ok) {
            throw new Error("读取任务列表失败");
        }
        const items = await response.json();
        renderRecentJobs(items);
        return items;
    } catch (error) {
        if (isNetworkError(error)) {
            handleOfflineState("读取任务列表");
            return [];
        }
        throw error;
    }
}

async function createJob() {
    if (!state.selectedFile) {
        window.alert("请先选择一个 PDF 文件。");
        return;
    }

    const serviceReady = await loadHealth();
    if (!serviceReady) {
        window.alert(OFFLINE_MESSAGE);
        return;
    }

    const formData = new FormData();
    formData.append("file", state.selectedFile);
    formData.append("output_dir", outputDirInput.value.trim());
    formData.append("output_format", outputFormatSelect.value);
    formData.append("processing_mode", processingModeSelect.value);
    formData.append("page_range", pageRangeInput.value.trim());
    formData.append("force_ocr", String(forceOcrInput.checked));
    formData.append("paginate_output", String(paginateOutputInput.checked));
    formData.append("disable_image_extraction", String(disableImageExtractionInput.checked));
    formData.append("disable_multiprocessing", String(disableMultiprocessingInput.checked));
    formData.append("debug", String(debugInput.checked));

    convertBtn.disabled = true;
    convertBtn.textContent = "提交中...";

    try {
        const response = await fetch(apiUrl("/api/jobs"), {
            method: "POST",
            body: formData,
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.detail || "创建任务失败");
        }
        const job = await response.json();
        state.currentJobId = job.jobId;
        renderJob(job);
        await loadRecentJobs();
        await pollJob(job.jobId);
    } catch (error) {
        if (isNetworkError(error)) {
            handleOfflineState("创建任务");
        } else {
            renderLogs([`[error] ${error.message}`]);
        }
    } finally {
        convertBtn.disabled = false;
        convertBtn.textContent = "开始转换";
    }
}

async function openOutputFolder() {
    if (!state.currentJobId) {
        return;
    }
    try {
        const response = await fetch(apiUrl(`/api/jobs/${state.currentJobId}/open-output`), {
            method: "POST",
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            window.alert(payload.detail || "无法打开输出目录");
        }
    } catch (error) {
        if (isNetworkError(error)) {
            handleOfflineState("打开输出目录");
            window.alert(OFFLINE_MESSAGE);
            return;
        }
        window.alert("无法打开输出目录");
    }
}

function bindFileSelection() {
    pickFileBtn.addEventListener("click", () => fileInput.click());
    clearFileBtn.addEventListener("click", () => {
        fileInput.value = "";
        setSelectedFile(null);
    });
    fileInput.addEventListener("change", () => {
        const file = fileInput.files && fileInput.files[0];
        setSelectedFile(file || null);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
        dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropZone.classList.add("dragover");
        });
    });

    ["dragleave", "drop"].forEach((eventName) => {
        dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropZone.classList.remove("dragover");
        });
    });

    dropZone.addEventListener("drop", (event) => {
        const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        setSelectedFile(file || null);
        if (file) {
            const transfer = new DataTransfer();
            transfer.items.add(file);
            fileInput.files = transfer.files;
        }
    });
}

function bindActions() {
    convertBtn.addEventListener("click", createJob);
    processingModeSelect.addEventListener("change", syncProcessingModeHint);
    refreshJobsBtn.addEventListener("click", async () => {
        const serviceReady = await loadHealth();
        if (!serviceReady) {
            return;
        }
        await loadRecentJobs();
        if (state.currentJobId) {
            await pollJob(state.currentJobId);
        }
    });
    clearCurrentBtn.addEventListener("click", () => {
        stopPolling();
        state.currentJobId = null;
        renderJob(null);
    });
    copyLogsBtn.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(logPanel.textContent || "");
            copyLogsBtn.textContent = "已复制";
            window.setTimeout(() => {
                copyLogsBtn.textContent = "复制日志";
            }, 1200);
        } catch {
            window.alert("复制失败，请手动复制日志。");
        }
    });
    openOutputBtn.addEventListener("click", openOutputFolder);
    recentJobs.addEventListener("click", (event) => {
        const button = event.target.closest("[data-job-id]");
        if (!button) {
            return;
        }
        const { jobId } = button.dataset;
        if (jobId) {
            pollJob(jobId);
        }
    });
}

async function init() {
    setTheme();
    bindFileSelection();
    bindActions();
    syncProcessingModeHint();
    renderJob(null);
    const serviceReady = await loadHealth();
    if (serviceReady) {
        await loadRecentJobs();
    }
}

void init();