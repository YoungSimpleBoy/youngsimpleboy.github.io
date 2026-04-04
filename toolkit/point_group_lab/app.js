(function () {
    "use strict";

    const MAX_OPERATIONS = 384;
    const EPS_KEY = 1e-8;
    const VIEW_CONFIG = {
        pitchMin: -0.95,
        pitchMax: 0.95,
        dragSensitivity: 0.0045,
        touchSensitivity: 0.0055,
        autoSpinStep: 0.0025
    };

    const HULL_COLORS = {
        fill: "rgba(59, 130, 246, 0.12)",
        stroke: "rgba(29, 78, 216, 0.42)",
        fillDark: "rgba(37, 99, 235, 0.14)",
        strokeDark: "rgba(30, 64, 175, 0.36)",
        coplanarFill: "rgba(14, 165, 233, 0.11)",
        coplanarStroke: "rgba(8, 145, 178, 0.58)"
    };

    const AXIS = {
        x: [1, 0, 0],
        y: [0, 1, 0],
        z: [0, 0, 1],
        d: [1, 1, 1]
    };

    const PRESETS = {
        C1: {
            seed: [0.2, 0.8, 0.5],
            rot: { z: [0, "rot"], y: [0, "rot"], x: [0, "rot"], d: [0, "rot"] },
            mirror: { x: false, y: false, z: false },
            inversion: false
        },
        Ci: {
            seed: [0.2, 0.8, 0.5],
            rot: { z: [0, "rot"], y: [0, "rot"], x: [0, "rot"], d: [0, "rot"] },
            mirror: { x: false, y: false, z: false },
            inversion: true
        },
        Cs: {
            seed: [0.2, 0.8, 0.5],
            rot: { z: [0, "rot"], y: [0, "rot"], x: [0, "rot"], d: [0, "rot"] },
            mirror: { x: false, y: false, z: true },
            inversion: false
        },
        C2: {
            seed: [0.2, 0.8, 0.5],
            rot: { z: [2, "rot"], y: [0, "rot"], x: [0, "rot"], d: [0, "rot"] },
            mirror: { x: false, y: false, z: false },
            inversion: false
        },
        C3: {
            seed: [0.2, 0.8, 0.5],
            rot: { z: [3, "rot"], y: [0, "rot"], x: [0, "rot"], d: [0, "rot"] },
            mirror: { x: false, y: false, z: false },
            inversion: false
        },
        C4: {
            seed: [0.2, 0.8, 0.5],
            rot: { z: [4, "rot"], y: [0, "rot"], x: [0, "rot"], d: [0, "rot"] },
            mirror: { x: false, y: false, z: false },
            inversion: false
        },
        C6: {
            seed: [0.2, 0.8, 0.5],
            rot: { z: [6, "rot"], y: [0, "rot"], x: [0, "rot"], d: [0, "rot"] },
            mirror: { x: false, y: false, z: false },
            inversion: false
        },
        C2v: {
            seed: [0.2, 0.8, 0.5],
            rot: { z: [2, "rot"], y: [0, "rot"], x: [0, "rot"], d: [0, "rot"] },
            mirror: { x: true, y: true, z: false },
            inversion: false
        },
        D2h: {
            seed: [0.2, 0.8, 0.5],
            rot: { z: [2, "rot"], y: [2, "rot"], x: [2, "rot"], d: [0, "rot"] },
            mirror: { x: false, y: false, z: false },
            inversion: true
        },
        Th_like: {
            seed: [0.2, 0.8, 0.5],
            rot: { z: [4, "rot"], y: [0, "rot"], x: [0, "rot"], d: [3, "roto"] },
            mirror: { x: false, y: false, z: false },
            inversion: false
        }
    };

    const dom = {
        canvas: document.getElementById("scene"),
        viewerCard: document.getElementById("viewerCard"),
        viewerFsBtn: document.getElementById("viewerFsBtn"),
        themeToggle: document.getElementById("themeToggle"),
        seedX: document.getElementById("seed-x"),
        seedY: document.getElementById("seed-y"),
        seedZ: document.getElementById("seed-z"),
        zOrder: document.getElementById("z-order"),
        zMode: document.getElementById("z-mode"),
        yOrder: document.getElementById("y-order"),
        yMode: document.getElementById("y-mode"),
        xOrder: document.getElementById("x-order"),
        xMode: document.getElementById("x-mode"),
        dOrder: document.getElementById("d-order"),
        dMode: document.getElementById("d-mode"),
        mz: document.getElementById("m-z"),
        my: document.getElementById("m-y"),
        mx: document.getElementById("m-x"),
        inv: document.getElementById("inv"),
        showAxes: document.getElementById("show-axes"),
        showSymmetry: document.getElementById("show-symmetry"),
        showHull: document.getElementById("show-hull"),
        hullOpacity: document.getElementById("hull-opacity"),
        hullOpacityValue: document.getElementById("hull-opacity-value"),
        strictStyle: document.getElementById("strict-style"),
        showVectors: document.getElementById("show-vectors"),
        autoSpin: document.getElementById("auto-spin"),
        preset: document.getElementById("preset"),
        applyPreset: document.getElementById("apply-preset"),
        randomSeed: document.getElementById("random-seed"),
        resetView: document.getElementById("reset-view"),
        recompute: document.getElementById("recompute"),
        genCount: document.getElementById("gen-count"),
        opCount: document.getElementById("op-count"),
        ptCount: document.getElementById("pt-count"),
        warn: document.getElementById("warn"),
        summary: document.getElementById("summary")
    };

    const ctx = dom.canvas.getContext("2d");

    const state = {
        seed: [0.2, 0.8, 0.5],
        generators: [],
        operations: [identityMatrix()],
        points: [[0.2, 0.8, 0.5]],
        hull: null,
        hullOpacity: 1,
        symmetryElements: {
            axes: [],
            planes: [],
            hasInversion: false
        },
        width: 0,
        height: 0,
        view: {
            yaw: -0.8,
            pitch: 0.48,
            zoom: 1
        },
        dragging: false,
        dragX: 0,
        dragY: 0,
        truncated: false
    };

    function syncViewerFullscreenButton(isFullscreen) {
        if (!dom.viewerFsBtn) {
            return;
        }
        dom.viewerFsBtn.textContent = isFullscreen ? "✕" : "⛶";
        dom.viewerFsBtn.title = isFullscreen ? "退出全屏" : "全屏显示可视化";
        dom.viewerFsBtn.setAttribute("aria-label", isFullscreen ? "退出全屏" : "全屏显示可视化");
    }

    function resizeCanvasSoon() {
        window.requestAnimationFrame(function () {
            resizeCanvas();
        });
    }

    function toggleViewerFullscreen() {
        if (!dom.viewerCard) {
            return;
        }
        const isFullscreen = !dom.viewerCard.classList.contains("fullscreen");
        dom.viewerCard.classList.toggle("fullscreen", isFullscreen);
        document.body.classList.toggle("viewer-fullscreen", isFullscreen);
        document.body.style.overflow = isFullscreen ? "hidden" : "";
        state.dragging = false;
        syncViewerFullscreenButton(isFullscreen);
        resizeCanvasSoon();
    }

    function clamp(v, lo, hi) {
        return Math.min(Math.max(v, lo), hi);
    }

    function roundForKey(v) {
        const s = Math.abs(v) < EPS_KEY ? 0 : v;
        return s.toFixed(8);
    }

    function cssVar(name, fallback) {
        const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return value || fallback;
    }

    function isLightTheme() {
        return document.documentElement.classList.contains("light");
    }

    function rgbaWithAlpha(color, alpha) {
        const match = String(color).match(/^rgba?\(([^)]+)\)$/i);
        if (!match) {
            return color;
        }
        const parts = match[1].split(",").map((part) => part.trim());
        if (parts.length < 3) {
            return color;
        }
        return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${clamp(alpha, 0, 1)})`;
    }

    function toggleTheme() {
        const isLight = document.documentElement.classList.toggle("light");
        localStorage.setItem("theme", isLight ? "light" : "dark");
        render();
    }

    function initTheme() {
        const savedTheme = localStorage.getItem("theme");
        if (savedTheme) {
            document.documentElement.classList.toggle("light", savedTheme === "light");
        } else {
            const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
            document.documentElement.classList.toggle("light", !mediaQuery.matches);
        }

        const media = window.matchMedia("(prefers-color-scheme: dark)");
        media.addEventListener("change", function (e) {
            if (!localStorage.getItem("theme")) {
                document.documentElement.classList.toggle("light", !e.matches);
                render();
            }
        });
    }

    function identityMatrix() {
        return [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1]
        ];
    }

    function normalize(v) {
        const n = Math.hypot(v[0], v[1], v[2]);
        if (n === 0) {
            return [0, 0, 1];
        }
        return [v[0] / n, v[1] / n, v[2] / n];
    }

    function matMul(a, b) {
        const out = [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0]
        ];
        for (let r = 0; r < 3; r += 1) {
            for (let c = 0; c < 3; c += 1) {
                out[r][c] = a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c];
            }
        }
        return out;
    }

    function matVec(m, v) {
        return [
            m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
            m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
            m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
        ];
    }

    function scaleMatrix(m, s) {
        return [
            [m[0][0] * s, m[0][1] * s, m[0][2] * s],
            [m[1][0] * s, m[1][1] * s, m[1][2] * s],
            [m[2][0] * s, m[2][1] * s, m[2][2] * s]
        ];
    }

    function rotationMatrix(axis, theta) {
        const [x, y, z] = normalize(axis);
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        const t = 1 - c;
        return [
            [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
            [t * y * x + s * z, t * y * y + c, t * y * z - s * x],
            [t * z * x - s * y, t * z * y + s * x, t * z * z + c]
        ];
    }

    function mirrorMatrix(normal) {
        const [x, y, z] = normalize(normal);
        return [
            [1 - 2 * x * x, -2 * x * y, -2 * x * z],
            [-2 * y * x, 1 - 2 * y * y, -2 * y * z],
            [-2 * z * x, -2 * z * y, 1 - 2 * z * z]
        ];
    }

    function matrixKey(m) {
        return m[0].concat(m[1], m[2]).map(roundForKey).join(",");
    }

    function pointKey(p) {
        return p.map(roundForKey).join(",");
    }

    function axisOperation(axisName, order, mode) {
        const n = Math.max(0, Math.round(Number(order) || 0));
        if (n <= 0) {
            return null;
        }
        const axis = normalize(AXIS[axisName]);
        const r = rotationMatrix(axis, (2 * Math.PI) / n);
        const op = mode === "roto" ? scaleMatrix(r, -1) : r;
        const label = axisName === "d" ? "[111]" : axisName.toUpperCase();
        const symbol = mode === "roto"
            ? (n === 2 ? "m" : `${n}-bar`)
            : String(n);
        return {
            name: `${symbol} // ${label}`,
            matrix: op,
            kind: "axis",
            axis,
            axisLabel: label,
            mode,
            order: n
        };
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatGeneratorLabelHtml(g) {
        if (g.kind === "axis") {
            const symbol = g.mode === "roto"
                ? (g.order === 2 ? "m" : `<span class="hm-overbar">${g.order}</span>`)
                : String(g.order);
            return `${symbol} // ${escapeHtml(g.axisLabel)}`;
        }
        if (g.kind === "inversion") {
            return `<span class="hm-overbar">1</span>`;
        }
        return escapeHtml(g.name);
    }

    function collectGenerators() {
        const gens = [];

        const axisOps = [
            ["z", dom.zOrder.value, dom.zMode.value],
            ["y", dom.yOrder.value, dom.yMode.value],
            ["x", dom.xOrder.value, dom.xMode.value],
            ["d", dom.dOrder.value, dom.dMode.value]
        ];

        for (const item of axisOps) {
            const g = axisOperation(item[0], item[1], item[2]);
            if (g) {
                if (g.mode === "rot" && g.order === 1) {
                    continue;
                }
                gens.push(g);
            }
        }

        if (dom.mz.checked) {
            gens.push({
                name: "m(001)",
                kind: "mirror",
                normal: normalize(AXIS.z),
                matrix: mirrorMatrix(AXIS.z)
            });
        }
        if (dom.my.checked) {
            gens.push({
                name: "m(010)",
                kind: "mirror",
                normal: normalize(AXIS.y),
                matrix: mirrorMatrix(AXIS.y)
            });
        }
        if (dom.mx.checked) {
            gens.push({
                name: "m(100)",
                kind: "mirror",
                normal: normalize(AXIS.x),
                matrix: mirrorMatrix(AXIS.x)
            });
        }
        if (dom.inv.checked) {
            gens.push({
                name: "1-bar",
                kind: "inversion",
                matrix: scaleMatrix(identityMatrix(), -1)
            });
        }

        return gens;
    }

    function generateGroup(generators) {
        const ops = [identityMatrix()];
        const seen = new Set([matrixKey(ops[0])]);
        let truncated = false;

        for (let i = 0; i < ops.length; i += 1) {
            for (const gen of generators) {
                const next = matMul(ops[i], gen.matrix);
                const key = matrixKey(next);
                if (!seen.has(key)) {
                    seen.add(key);
                    ops.push(next);
                    if (ops.length >= MAX_OPERATIONS) {
                        truncated = true;
                        return { ops, truncated };
                    }
                }
            }
        }

        return { ops, truncated };
    }

    function orbitFromSeed(seed, operations) {
        const points = [];
        const seen = new Set();
        for (const op of operations) {
            const p = matVec(op, seed);
            const key = pointKey(p);
            if (!seen.has(key)) {
                seen.add(key);
                points.push(p);
            }
        }
        return points;
    }

    function parseSeed() {
        return [
            Number(dom.seedX.value) || 0,
            Number(dom.seedY.value) || 0,
            Number(dom.seedZ.value) || 0
        ];
    }

    function syncHullOpacity() {
        const value = Number(dom.hullOpacity && dom.hullOpacity.value) || 0;
        state.hullOpacity = clamp(value / 100, 0, 1);
        if (dom.hullOpacityValue) {
            dom.hullOpacityValue.textContent = `${value}%`;
        }
    }

    function applyPreset(name) {
        const cfg = PRESETS[name];
        if (!cfg) {
            return;
        }
        dom.seedX.value = cfg.seed[0];
        dom.seedY.value = cfg.seed[1];
        dom.seedZ.value = cfg.seed[2];

        dom.zOrder.value = cfg.rot.z[0];
        dom.zMode.value = cfg.rot.z[1];
        dom.yOrder.value = cfg.rot.y[0];
        dom.yMode.value = cfg.rot.y[1];
        dom.xOrder.value = cfg.rot.x[0];
        dom.xMode.value = cfg.rot.x[1];
        dom.dOrder.value = cfg.rot.d[0];
        dom.dMode.value = cfg.rot.d[1];

        dom.mx.checked = cfg.mirror.x;
        dom.my.checked = cfg.mirror.y;
        dom.mz.checked = cfg.mirror.z;
        dom.inv.checked = cfg.inversion;
    }

    function recalculate() {
        state.seed = parseSeed();
        state.generators = collectGenerators();

        const group = generateGroup(state.generators);
        state.operations = group.ops;
        state.truncated = group.truncated;
        state.points = orbitFromSeed(state.seed, state.operations);
        state.hull = computeConvexHull(state.points);
        state.symmetryElements = buildSymmetryElements();

        updateStats();
        render();
    }

    function updateStats() {
        dom.genCount.textContent = String(state.generators.length);
        dom.opCount.textContent = String(state.operations.length);
        dom.ptCount.textContent = String(state.points.length);

        dom.warn.textContent = state.truncated
            ? `操作数量达到上限 ${MAX_OPERATIONS}，已提前截断。`
            : "";

        const names = state.generators.map((g, idx) => `${idx + 1}. ${formatGeneratorLabelHtml(g)}`);
        dom.summary.innerHTML = names.length > 0 ? names.join("<br>") : "仅恒等操作 E";
    }

    function resetView() {
        state.view.yaw = -0.8;
        state.view.pitch = 0.48;
        state.view.zoom = 1;
        render();
    }

    function randomSeed() {
        const randomValue = () => (Math.random() * 2 - 1).toFixed(2);
        dom.seedX.value = randomValue();
        dom.seedY.value = randomValue();
        dom.seedZ.value = randomValue();
        dom.preset.value = "custom";
        recalculate();
    }

    function toViewSpace(p) {
        const cy = Math.cos(state.view.yaw);
        const sy = Math.sin(state.view.yaw);

        const x1 = cy * p[0] - sy * p[1];
        const y1 = sy * p[0] + cy * p[1];
        const z1 = p[2];

        const cp = Math.cos(state.view.pitch);
        const sp = Math.sin(state.view.pitch);

        const y2 = cp * y1 - sp * z1;
        const z2 = sp * y1 + cp * z1;

        return [x1, y2, z2];
    }

    function projectPoint(p) {
        const v = toViewSpace(p);
        const base = Math.min(state.width, state.height) * 0.31;
        const scale = base * state.view.zoom;
        return {
            x: state.width * 0.5 + v[0] * scale,
            y: state.height * 0.5 - v[1] * scale,
            z: v[2],
            scale
        };
    }

    function cross(a, b) {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]
        ];
    }

    function scaleVec(v, s) {
        return [v[0] * s, v[1] * s, v[2] * s];
    }

    function addVec(a, b) {
        return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    }

    function subVec(a, b) {
        return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    }

    function dot(a, b) {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }

    function canonicalDirection(v) {
        const n = normalize(v);
        if (Math.abs(n[0]) > EPS_KEY) {
            return n[0] < 0 ? scaleVec(n, -1) : n;
        }
        if (Math.abs(n[1]) > EPS_KEY) {
            return n[1] < 0 ? scaleVec(n, -1) : n;
        }
        if (Math.abs(n[2]) > EPS_KEY) {
            return n[2] < 0 ? scaleVec(n, -1) : n;
        }
        return [0, 0, 1];
    }

    function directionKey(v) {
        const c = canonicalDirection(v);
        return `${roundForKey(c[0])},${roundForKey(c[1])},${roundForKey(c[2])}`;
    }

    function matrixTrace(m) {
        return m[0][0] + m[1][1] + m[2][2];
    }

    function determinant3(m) {
        return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
            - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
            + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    }

    function matrixNear(a, b, eps) {
        for (let r = 0; r < 3; r += 1) {
            for (let c = 0; c < 3; c += 1) {
                if (Math.abs(a[r][c] - b[r][c]) > eps) {
                    return false;
                }
            }
        }
        return true;
    }

    function isIdentityOp(m) {
        return matrixNear(m, identityMatrix(), 1e-6);
    }

    function isInversionOp(m) {
        return matrixNear(m, scaleMatrix(identityMatrix(), -1), 1e-6);
    }

    function eigenDirectionForValue(m, lambda) {
        const r0 = [m[0][0] - lambda, m[0][1], m[0][2]];
        const r1 = [m[1][0], m[1][1] - lambda, m[1][2]];
        const r2 = [m[2][0], m[2][1], m[2][2] - lambda];
        const candidates = [cross(r0, r1), cross(r0, r2), cross(r1, r2)];

        let best = null;
        let bestNorm = 0;
        for (const v of candidates) {
            const n = Math.hypot(v[0], v[1], v[2]);
            if (n > bestNorm) {
                bestNorm = n;
                best = v;
            }
        }
        if (!best || bestNorm < 1e-9) {
            return null;
        }
        return canonicalDirection(best);
    }

    function inferRotationOrder(rot) {
        const cosTheta = clamp((matrixTrace(rot) - 1) * 0.5, -1, 1);
        const theta = Math.acos(cosTheta);
        if (theta < 1e-6) {
            return 1;
        }
        const n = Math.max(1, Math.round((2 * Math.PI) / theta));
        return n;
    }

    function addAxisElement(axisMap, dir, mode, order) {
        if (!dir || order <= 1) {
            return;
        }
        const key = `${mode}:${directionKey(dir)}`;
        const existed = axisMap.get(key);
        if (!existed || order > existed.order) {
            axisMap.set(key, {
                dir: canonicalDirection(dir),
                order,
                mode
            });
        }
    }

    function addPlaneElement(planeMap, normal) {
        if (!normal) {
            return;
        }
        const n = canonicalDirection(normal);
        const key = directionKey(n);
        if (!planeMap.has(key)) {
            planeMap.set(key, { normal: n });
        }
    }

    function isMirrorOp(m) {
        if (determinant3(m) >= 0) {
            return false;
        }
        if (!matrixNear(matMul(m, m), identityMatrix(), 1e-6)) {
            return false;
        }
        return Math.abs(matrixTrace(m) - 1) < 1e-5;
    }

    function choosePlaneBasis(normal) {
        const n = normalize(normal);
        const helper = Math.abs(n[2]) < 0.85 ? [0, 0, 1] : [0, 1, 0];
        let u = cross(n, helper);
        if (Math.hypot(u[0], u[1], u[2]) < EPS_KEY) {
            u = cross(n, [1, 0, 0]);
        }
        u = normalize(u);
        const v = normalize(cross(n, u));
        return { u, v };
    }

    function convexHull2D(points2D) {
        if (points2D.length <= 1) {
            return points2D.map((p) => p.i);
        }

        const sorted = points2D.slice().sort((a, b) => {
            if (Math.abs(a.x - b.x) > 1e-9) {
                return a.x - b.x;
            }
            return a.y - b.y;
        });

        const cross2 = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

        const lower = [];
        for (const p of sorted) {
            while (lower.length >= 2 && cross2(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-9) {
                lower.pop();
            }
            lower.push(p);
        }

        const upper = [];
        for (let i = sorted.length - 1; i >= 0; i -= 1) {
            const p = sorted[i];
            while (upper.length >= 2 && cross2(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-9) {
                upper.pop();
            }
            upper.push(p);
        }

        lower.pop();
        upper.pop();
        return lower.concat(upper).map((p) => p.i);
    }

    function pointInPolygon2D(point, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
            const xi = polygon[i].x;
            const yi = polygon[i].y;
            const xj = polygon[j].x;
            const yj = polygon[j].y;
            const intersect = ((yi > point.y) !== (yj > point.y))
                && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-12) + xi);
            if (intersect) {
                inside = !inside;
            }
        }
        return inside;
    }

    function distancePointToSegment2D(point, a, b) {
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const wx = point.x - a.x;
        const wy = point.y - a.y;
        const len2 = vx * vx + vy * vy;
        if (len2 < 1e-12) {
            return Math.hypot(point.x - a.x, point.y - a.y);
        }
        const t = clamp((wx * vx + wy * vy) / len2, 0, 1);
        const px = a.x + t * vx;
        const py = a.y + t * vy;
        return Math.hypot(point.x - px, point.y - py);
    }

    function distancePointToPolygon2D(point, polygon) {
        if (!polygon || polygon.length === 0) {
            return Infinity;
        }
        let best = Infinity;
        for (let i = 0; i < polygon.length; i += 1) {
            const a = polygon[i];
            const b = polygon[(i + 1) % polygon.length];
            best = Math.min(best, distancePointToSegment2D(point, a, b));
        }
        return best;
    }

    function buildHullOccluders() {
        if (!dom.showHull || !dom.showHull.checked || !state.hull || state.hull.kind !== "poly3d") {
            return [];
        }

        const occluders = [];
        for (const face of state.hull.planes) {
            if (!face.ring || face.ring.length < 3) {
                continue;
            }

            const viewVerts = face.ring.map((idx) => {
                const v = toViewSpace(state.points[idx]);
                return { x: v[0], y: v[1], z: v[2] };
            });
            const normal = cross(
                subVec([viewVerts[1].x, viewVerts[1].y, viewVerts[1].z], [viewVerts[0].x, viewVerts[0].y, viewVerts[0].z]),
                subVec([viewVerts[2].x, viewVerts[2].y, viewVerts[2].z], [viewVerts[0].x, viewVerts[0].y, viewVerts[0].z])
            );

            if (normal[2] <= 1e-8) {
                continue;
            }

            const polygon = viewVerts.map((v) => ({ x: v.x, y: v.y }));
            const planePoint = viewVerts[0];
            const planeD = normal[0] * planePoint.x + normal[1] * planePoint.y + normal[2] * planePoint.z;

            occluders.push({ polygon, normal, planeD });
        }

        return occluders;
    }

    function pointHiddenByHull(item, occluders) {
        if (!occluders || occluders.length === 0) {
            return false;
        }

        const pointView = toViewSpace(item.p);
        const point2D = { x: pointView[0], y: pointView[1] };
        for (const face of occluders) {
            if (!pointInPolygon2D(point2D, face.polygon)) {
                continue;
            }
            const faceZ = (face.planeD - face.normal[0] * pointView[0] - face.normal[1] * pointView[1]) / face.normal[2];
            if (pointView[2] < faceZ - 1e-4) {
                return true;
            }
        }

        return false;
    }

    function computeConvexHull(points) {
        if (!points || points.length < 3) {
            return { kind: "degenerate" };
        }

        const n = points.length;
        const p0 = points[0];
        let i1 = -1;
        for (let i = 1; i < n; i += 1) {
            if (Math.hypot(points[i][0] - p0[0], points[i][1] - p0[1], points[i][2] - p0[2]) > 1e-8) {
                i1 = i;
                break;
            }
        }
        if (i1 < 0) {
            return { kind: "degenerate" };
        }

        let i2 = -1;
        const v01 = subVec(points[i1], p0);
        for (let i = 1; i < n; i += 1) {
            if (i === i1) {
                continue;
            }
            const c = cross(v01, subVec(points[i], p0));
            if (Math.hypot(c[0], c[1], c[2]) > 1e-8) {
                i2 = i;
                break;
            }
        }
        if (i2 < 0) {
            return { kind: "line" };
        }

        let i3 = -1;
        const baseN = cross(subVec(points[i1], p0), subVec(points[i2], p0));
        for (let i = 1; i < n; i += 1) {
            if (i === i1 || i === i2) {
                continue;
            }
            const d = dot(baseN, subVec(points[i], p0));
            if (Math.abs(d) > 1e-7) {
                i3 = i;
                break;
            }
        }

        const centroid = [0, 0, 0];
        for (const p of points) {
            centroid[0] += p[0];
            centroid[1] += p[1];
            centroid[2] += p[2];
        }
        centroid[0] /= n;
        centroid[1] /= n;
        centroid[2] /= n;

        if (i3 < 0) {
            const normal = normalize(baseN);
            const basis = choosePlaneBasis(normal);
            const proj = points.map((p, idx) => ({
                i: idx,
                x: dot(p, basis.u),
                y: dot(p, basis.v)
            }));
            const hullIdx = convexHull2D(proj);
            if (hullIdx.length < 3) {
                return { kind: "line" };
            }
            const polygon = hullIdx.map((idx) => points[idx]);
            return {
                kind: "coplanar",
                normal,
                polygon
            };
        }

        const planeMap = new Map();
        const epsSide = 1e-7;

        for (let i = 0; i < n - 2; i += 1) {
            for (let j = i + 1; j < n - 1; j += 1) {
                for (let k = j + 1; k < n; k += 1) {
                    let normal = cross(subVec(points[j], points[i]), subVec(points[k], points[i]));
                    const nn = Math.hypot(normal[0], normal[1], normal[2]);
                    if (nn < 1e-9) {
                        continue;
                    }
                    normal = [normal[0] / nn, normal[1] / nn, normal[2] / nn];
                    let d = dot(normal, points[i]);

                    let pos = false;
                    let neg = false;
                    for (let t = 0; t < n; t += 1) {
                        const s = dot(normal, points[t]) - d;
                        if (s > epsSide) {
                            pos = true;
                        } else if (s < -epsSide) {
                            neg = true;
                        }
                        if (pos && neg) {
                            break;
                        }
                    }
                    if (pos && neg) {
                        continue;
                    }

                    if (dot(normal, subVec(centroid, points[i])) > 0) {
                        normal = scaleVec(normal, -1);
                        d = -d;
                    }

                    const key = `${roundForKey(normal[0])},${roundForKey(normal[1])},${roundForKey(normal[2])},${roundForKey(d)}`;
                    if (!planeMap.has(key)) {
                        planeMap.set(key, { normal, d });
                    }
                }
            }
        }

        const planes = [];
        for (const plane of planeMap.values()) {
            const idx = [];
            for (let i = 0; i < n; i += 1) {
                if (Math.abs(dot(plane.normal, points[i]) - plane.d) < 2e-6) {
                    idx.push(i);
                }
            }
            if (idx.length < 3) {
                continue;
            }

            const basis = choosePlaneBasis(plane.normal);
            const proj = idx.map((pi) => ({
                i: pi,
                x: dot(points[pi], basis.u),
                y: dot(points[pi], basis.v)
            }));
            const ring = convexHull2D(proj);
            if (ring.length < 3) {
                continue;
            }
            planes.push({
                normal: plane.normal,
                ring
            });
        }

        return {
            kind: "poly3d",
            planes
        };
    }

    function buildSymmetryElements() {
        const axisMap = new Map();
        const planeMap = new Map();
        let hasInversion = false;

        for (const op of state.operations) {
            if (isIdentityOp(op)) {
                continue;
            }
            if (isInversionOp(op)) {
                hasInversion = true;
                continue;
            }

            const det = determinant3(op);
            if (det > 0) {
                const order = inferRotationOrder(op);
                const axis = eigenDirectionForValue(op, 1);
                addAxisElement(axisMap, axis, "rot", order);
                continue;
            }

            if (isMirrorOp(op)) {
                const normal = eigenDirectionForValue(op, -1);
                addPlaneElement(planeMap, normal);
                continue;
            }

            const axis = eigenDirectionForValue(op, -1);
            const properPart = scaleMatrix(op, -1);
            const order = inferRotationOrder(properPart);

            if (order === 1) {
                hasInversion = true;
            } else if (order === 2) {
                addPlaneElement(planeMap, axis);
            } else {
                addAxisElement(axisMap, axis, "roto", order);
            }
        }

        return {
            axes: Array.from(axisMap.values()),
            planes: Array.from(planeMap.values()),
            hasInversion
        };
    }

    function buildPlaneLayer(normal, radius, segments) {
        const basis = choosePlaneBasis(normal);
        const polygon = [];
        let depth = 0;

        for (let i = 0; i <= segments; i += 1) {
            const t = (2 * Math.PI * i) / segments;
            const p = addVec(scaleVec(basis.u, radius * Math.cos(t)), scaleVec(basis.v, radius * Math.sin(t)));
            const pr = projectPoint(p);
            polygon.push(pr);
            depth += pr.z;
        }

        return {
            polygon,
            depth: depth / polygon.length
        };
    }

    function drawPlaneLayer(layer, useHatch) {
        if (!layer || layer.polygon.length < 3) {
            return;
        }

        ctx.beginPath();
        ctx.moveTo(layer.polygon[0].x, layer.polygon[0].y);
        for (let i = 1; i < layer.polygon.length; i += 1) {
            ctx.lineTo(layer.polygon[i].x, layer.polygon[i].y);
        }
        ctx.closePath();

        const strict = !dom.strictStyle || dom.strictStyle.checked;
        ctx.fillStyle = strict
            ? "rgba(255, 255, 255, 0.10)"
            : cssVar("--sym-plane-fill", "rgba(85, 124, 186, 0.12)");
        ctx.fill();
        ctx.strokeStyle = strict
            ? cssVar("--sym-axis-line", "rgba(17, 24, 39, 0.72)")
            : cssVar("--sym-plane-stroke", "rgba(72, 113, 176, 0.4)");
        ctx.lineWidth = 1;
        ctx.stroke();

        if (strict && useHatch) {
            let minX = layer.polygon[0].x;
            let maxX = layer.polygon[0].x;
            let minY = layer.polygon[0].y;
            let maxY = layer.polygon[0].y;
            for (const p of layer.polygon) {
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y);
                maxY = Math.max(maxY, p.y);
            }

            const spacing = 8;
            const width = Math.max(1, maxX - minX);
            const height = Math.max(1, maxY - minY);
            const diagonal = width + height;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(layer.polygon[0].x, layer.polygon[0].y);
            for (let i = 1; i < layer.polygon.length; i += 1) {
                ctx.lineTo(layer.polygon[i].x, layer.polygon[i].y);
            }
            ctx.closePath();
            ctx.clip();

            ctx.strokeStyle = "rgba(20, 28, 40, 0.28)";
            ctx.lineWidth = 0.85;
            for (let t = -diagonal; t <= diagonal; t += spacing) {
                ctx.beginPath();
                ctx.moveTo(minX + t, maxY + 1);
                ctx.lineTo(minX + t + diagonal, minY - 1);
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    function drawAxisBadgeAt(pr, element, opts) {
        const options = opts || {};
        const isBack = !!options.isBack;
        const alpha = typeof options.alpha === "number" ? options.alpha : 1;
        const radiusBase = clamp(8.1 * state.view.zoom, 6.4, 12.5);
        const radius = radiusBase * (isBack ? 0.92 : 1);
        const axisStroke = cssVar("--sym-axis-line", "rgba(17, 24, 39, 0.85)");
        let textColor = axisStroke;
        const strict = !dom.strictStyle || dom.strictStyle.checked;
        const centerPr = projectPoint([0, 0, 0]);
        const orient = Math.atan2(pr.y - centerPr.y, pr.x - centerPr.x) - Math.PI / 2;
        const darkFill = isBack ? "rgba(16, 16, 16, 0.52)" : "#101010";
        const lightFill = isBack ? "rgba(255, 255, 255, 0.85)" : "#ffffff";
        const strokeColor = isBack ? "rgba(17, 24, 39, 0.68)" : axisStroke;

        function regularPolygonVertices(sides, r, rot0) {
            const pts = [];
            for (let i = 0; i < sides; i += 1) {
                const t = rot0 + (2 * Math.PI * i) / sides;
                pts.push({ x: pr.x + r * Math.cos(t), y: pr.y + r * Math.sin(t) });
            }
            return pts;
        }

        function pathFromVertices(pts) {
            if (!pts || pts.length === 0) {
                return;
            }
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i += 1) {
                ctx.lineTo(pts[i].x, pts[i].y);
            }
            ctx.closePath();
        }

        ctx.save();
        ctx.globalAlpha = alpha;

        if (strict) {
            const n = element.order;
            const isRoto = element.mode === "roto";

            if (!isRoto && n === 2) {
                // MATLAB 风格二重轴：细长实心符号（近似椭圆）
                ctx.beginPath();
                ctx.ellipse(pr.x, pr.y, radius * 0.52, radius * 0.95, 0, 0, Math.PI * 2);
                ctx.fillStyle = darkFill;
                ctx.fill();
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = 1.1;
                ctx.stroke();
                ctx.restore();
                return;
            }

            if (!isRoto && (n === 3 || n === 4 || n === 6)) {
                // MATLAB 风格多重旋转轴：实心正多边形
                const poly = regularPolygonVertices(n, radius * 0.95, orient);
                pathFromVertices(poly);
                ctx.fillStyle = darkFill;
                ctx.fill();
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = 1.15;
                ctx.stroke();
                ctx.restore();
                return;
            }

            if (isRoto && n >= 3) {
                if (n % 2 === 1) {
                    // MATLAB 奇数重反轴：圆环 + 白色多边形镂空
                    ctx.beginPath();
                    ctx.arc(pr.x, pr.y, radius, 0, Math.PI * 2);
                    ctx.fillStyle = darkFill;
                    ctx.fill();
                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = 1.15;
                    ctx.stroke();

                    const hole = regularPolygonVertices(n, radius * 0.58, orient);
                    pathFromVertices(hole);
                    ctx.fillStyle = lightFill;
                    ctx.fill();
                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = 1.05;
                    ctx.stroke();
                } else {
                    // MATLAB 偶数重反轴：空心多边形 + 交替径向线
                    const poly = regularPolygonVertices(n, radius * 0.95, orient);
                    pathFromVertices(poly);
                    ctx.fillStyle = lightFill;
                    ctx.fill();
                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = 1.2;
                    ctx.stroke();

                    ctx.beginPath();
                    for (let i = 0; i < poly.length; i += 2) {
                        ctx.moveTo(pr.x, pr.y);
                        ctx.lineTo(poly[i].x, poly[i].y);
                    }
                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = 1.15;
                    ctx.stroke();
                }
                ctx.restore();
                return;
            }
        }

        ctx.beginPath();
        ctx.arc(pr.x, pr.y, radius, 0, Math.PI * 2);
        const nonStrictFill = cssVar("--sym-axis-fill", "#1e293b");
        const nonStrictText = cssVar("--sym-axis-text", "#f8fafc");
        ctx.fillStyle = isBack ? "rgba(30, 41, 59, 0.82)" : nonStrictFill;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.4;
        ctx.stroke();

        const text = element.mode === "roto" && element.order === 2
            ? "m"
            : String(element.order);
        textColor = nonStrictText;
        ctx.fillStyle = textColor;
        ctx.font = `700 ${Math.round(radius * 1.12)}px "Cambria", "Times New Roman", serif`;
        const tm = ctx.measureText(text);
        const tx = pr.x - tm.width / 2;
        const ty = pr.y + radius * 0.34;
        ctx.strokeStyle = isBack ? "rgba(8, 12, 20, 0.35)" : "rgba(8, 12, 20, 0.65)";
        ctx.lineWidth = 1.8;
        ctx.strokeText(text, tx, ty);
        ctx.fillText(text, tx, ty);

        if (element.mode === "roto" && element.order !== 2) {
            const barY = pr.y - radius * 0.54;
            ctx.beginPath();
            ctx.moveTo(pr.x - tm.width * 0.58, barY);
            ctx.lineTo(pr.x + tm.width * 0.58, barY);
            ctx.lineWidth = 1.15;
            ctx.strokeStyle = textColor;
            ctx.stroke();
        }

        ctx.restore();
    }

    function axisLineWidthByOrder(element) {
        if (element.mode === "roto") {
            if (element.order >= 6) {
                return 1.45;
            }
            if (element.order >= 4) {
                return 1.4;
            }
            return 1.35;
        }
        if (element.order >= 6) {
            return 1.65;
        }
        if (element.order >= 4) {
            return 1.58;
        }
        if (element.order >= 3) {
            return 1.52;
        }
        return 1.46;
    }

    function chooseAxisBadgeProjections(element) {
        const length = 1.22;
        const anchor = length * 1.03;
        const pPos = projectPoint(scaleVec(element.dir, anchor));
        const pNeg = projectPoint(scaleVec(element.dir, -anchor));
        if (pPos.z >= pNeg.z) {
            return { front: pPos, back: pNeg };
        }
        return { front: pNeg, back: pPos };
    }

    function makeAxisRenderData(element) {
        const length = 1.22;
        const a = projectPoint(scaleVec(element.dir, -length));
        const b = projectPoint(scaleVec(element.dir, length));
        const badges = chooseAxisBadgeProjections(element);

        return { element, a, b, badges };
    }

    function drawAxisLineFromData(data) {
        const element = data.element;
        const a = data.a;
        const b = data.b;

        ctx.save();
        ctx.strokeStyle = cssVar("--sym-axis-line", "rgba(17, 24, 39, 0.78)");
        ctx.lineWidth = axisLineWidthByOrder(element);
        if (!dom.strictStyle || dom.strictStyle.checked) {
            ctx.setLineDash([5, 4]);
        } else {
            ctx.setLineDash(element.mode === "roto" ? [4, 4] : []);
        }
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
    }

    function drawAxisBackBadgeFromData(data, hasPlanes) {
        drawAxisBadgeAt(data.badges.back, data.element, {
            isBack: true,
            alpha: hasPlanes ? 0.52 : 0.68
        });
    }

    function drawAxisFrontBadgeFromData(data) {
        drawAxisBadgeAt(data.badges.front, data.element, { isBack: false, alpha: 1 });
    }

    function drawInversionCenter() {
        const o = projectPoint([0, 0, 0]);
        const strict = !dom.strictStyle || dom.strictStyle.checked;
        const radius = strict ? 7 : clamp(6.2 * state.view.zoom, 5.2, 9);

        ctx.beginPath();
        ctx.arc(o.x, o.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = cssVar("--sym-inv-fill", "#ffffff");
        ctx.fill();
        ctx.strokeStyle = cssVar("--sym-inv-stroke", "#1f2937");
        ctx.lineWidth = 1.4;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(o.x, o.y, radius * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = cssVar("--sym-inv-dot", "#1f2937");
        ctx.fill();
    }

    function drawSymmetryElements() {
        if (!dom.showSymmetry || !dom.showSymmetry.checked) {
            return;
        }

        const elements = state.symmetryElements || buildSymmetryElements();
        const planeCount = elements.planes.length;
        const axisCount = elements.axes.length;
        const strict = !dom.strictStyle || dom.strictStyle.checked;
        const interactive = state.dragging || (dom.autoSpin && dom.autoSpin.checked);
        const complexity = planeCount + axisCount * 0.4;
        const planeSegments = complexity >= 18 ? 32 : (complexity >= 10 ? 48 : 72);
        const useHatch = strict && !interactive && planeCount <= 8;

        const planeLayers = [];
        for (const plane of elements.planes) {
            planeLayers.push(buildPlaneLayer(plane.normal, 1.08, planeSegments));
        }
        planeLayers.sort((a, b) => a.depth - b.depth);

        const sortedAxes = elements.axes.slice().sort((a, b) => {
            if (a.mode !== b.mode) {
                return a.mode === "rot" ? -1 : 1;
            }
            return b.order - a.order;
        });
        const axisRenderData = sortedAxes.map(makeAxisRenderData);

        // 先画后端符号，再画镜面，最后画轴线和前端符号，形成遮挡层次
        const hasPlanes = planeLayers.length > 0;
        for (const data of axisRenderData) {
            drawAxisBackBadgeFromData(data, hasPlanes);
        }
        for (const layer of planeLayers) {
            drawPlaneLayer(layer, useHatch);
        }
        for (const data of axisRenderData) {
            drawAxisLineFromData(data);
        }
        for (const data of axisRenderData) {
            drawAxisFrontBadgeFromData(data);
        }
        if (elements.hasInversion) {
            drawInversionCenter();
        }
    }

    function drawBackground() {
        const g = ctx.createLinearGradient(0, 0, state.width, state.height);
        g.addColorStop(0, cssVar("--canvas-grad-a", "#fff7e5"));
        g.addColorStop(1, cssVar("--canvas-grad-b", "#e9f7ef"));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, state.width, state.height);
    }

    function drawAxes() {
        if (!dom.showAxes.checked) {
            return;
        }

        const axes = [
            { from: [-1.5, 0, 0], to: [1.5, 0, 0], color: "#60a5fa", label: "X" },
            { from: [0, -1.5, 0], to: [0, 1.5, 0], color: "#14b8a6", label: "Y" },
            { from: [0, 0, -1.5], to: [0, 0, 1.5], color: "#818cf8", label: "Z" }
        ];

        for (const axis of axes) {
            const a = projectPoint(axis.from);
            const b = projectPoint(axis.to);

            ctx.strokeStyle = axis.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();

            ctx.fillStyle = axis.color;
            ctx.font = "600 13px Segoe UI";
            ctx.fillText(axis.label, b.x + 6, b.y - 6);
        }
    }

    function drawConvexHullSurface() {
        if (!dom.showHull || !dom.showHull.checked || !state.hull) {
            return;
        }

        const surfaceOpacity = clamp(state.hullOpacity, 0, 1);
        if (surfaceOpacity <= 0) {
            return;
        }

        const lightTheme = isLightTheme();
        const edgeBoost = lightTheme ? 1 : 1.35;
        const strokeBoost = lightTheme ? 1 : 1.55;
        const edgeHighlightAlpha = lightTheme ? 0.18 : 0.38;

        const hull = state.hull;
        if (hull.kind === "coplanar") {
            const poly = hull.polygon.map((p) => projectPoint(p));
            if (poly.length < 3) {
                return;
            }

            ctx.beginPath();
            ctx.moveTo(poly[0].x, poly[0].y);
            for (let i = 1; i < poly.length; i += 1) {
                ctx.lineTo(poly[i].x, poly[i].y);
            }
            ctx.closePath();
            ctx.fillStyle = rgbaWithAlpha(HULL_COLORS.coplanarFill, (lightTheme ? 0.11 : 0.14) * surfaceOpacity);
            ctx.fill();
            ctx.strokeStyle = lightTheme
                ? rgbaWithAlpha(HULL_COLORS.coplanarStroke, 0.42 * surfaceOpacity)
                : `rgba(214, 239, 255, ${edgeHighlightAlpha * surfaceOpacity})`;
            ctx.lineWidth = 2.05 * edgeBoost;
            ctx.stroke();
            ctx.strokeStyle = lightTheme
                ? rgbaWithAlpha(HULL_COLORS.coplanarStroke, 0.58 * surfaceOpacity)
                : "rgba(220, 238, 255, " + (0.82 * surfaceOpacity) + ")";
            ctx.lineWidth = 1.2 * edgeBoost;
            ctx.stroke();
            return;
        }

        if (hull.kind !== "poly3d") {
            return;
        }

        const faces = [];
        for (const face of hull.planes) {
            if (!face.ring || face.ring.length < 3) {
                continue;
            }
            const projected = face.ring.map((idx) => projectPoint(state.points[idx]));
            const depth = projected.reduce((sum, p) => sum + p.z, 0) / projected.length;
            faces.push({ projected, depth });
        }

        faces.sort((a, b) => a.depth - b.depth);

        for (const face of faces) {
            ctx.beginPath();
            ctx.moveTo(face.projected[0].x, face.projected[0].y);
            for (let i = 1; i < face.projected.length; i += 1) {
                ctx.lineTo(face.projected[i].x, face.projected[i].y);
            }
            ctx.closePath();
            const depthMix = clamp((face.depth + 0.6) / 1.2, 0, 1);
            ctx.fillStyle = depthMix > 0.5
                ? rgbaWithAlpha(HULL_COLORS.fillDark, (lightTheme ? 0.14 : 0.18) * surfaceOpacity)
                : rgbaWithAlpha(HULL_COLORS.fill, (lightTheme ? 0.12 : 0.16) * surfaceOpacity);
            ctx.fill();
            ctx.strokeStyle = lightTheme
                ? rgbaWithAlpha(HULL_COLORS.strokeDark, 0.24 * surfaceOpacity)
                : `rgba(214, 239, 255, ${edgeHighlightAlpha * surfaceOpacity})`;
            ctx.lineWidth = 1.85 * strokeBoost;
            ctx.stroke();
            ctx.strokeStyle = depthMix > 0.5
                ? (lightTheme
                    ? rgbaWithAlpha(HULL_COLORS.strokeDark, 0.36 * surfaceOpacity)
                    : "rgba(191, 219, 254, " + (0.9 * surfaceOpacity) + ")")
                : (lightTheme
                    ? rgbaWithAlpha(HULL_COLORS.stroke, 0.42 * surfaceOpacity)
                    : "rgba(125, 211, 252, " + (0.9 * surfaceOpacity) + ")");
            ctx.lineWidth = 0.9 * strokeBoost;
            ctx.stroke();
        }
    }

    function drawPoints() {
        const projected = state.points.map((p) => ({ p, pr: projectPoint(p) }));
        projected.sort((a, b) => a.pr.z - b.pr.z);
        const hullOccluders = buildHullOccluders();

        const o = projectPoint([0, 0, 0]);

        if (dom.showVectors.checked) {
            ctx.strokeStyle = cssVar("--vector-line", "rgba(52, 73, 94, 0.35)");
            ctx.lineWidth = 1;
            for (const item of projected) {
                ctx.beginPath();
                ctx.moveTo(o.x, o.y);
                ctx.lineTo(item.pr.x, item.pr.y);
                ctx.stroke();
            }
        }

        for (const item of projected) {
            if (pointHiddenByHull(item, hullOccluders)) {
                continue;
            }

            const radius = clamp(2.8 + item.pr.scale * 0.011, 2.8, 8.5);
            ctx.beginPath();
            ctx.arc(item.pr.x, item.pr.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = item.p[2] >= 0 ? "#3b82f6" : "#14b8a6";
            ctx.fill();

            ctx.strokeStyle = cssVar("--point-stroke", "rgba(20, 27, 35, 0.35)");
            ctx.lineWidth = 0.8;
            ctx.stroke();
        }

        const seedPr = projectPoint(state.seed);
        ctx.beginPath();
        ctx.arc(seedPr.x, seedPr.y, clamp(5 + seedPr.scale * 0.009, 5, 10), 0, Math.PI * 2);
        ctx.strokeStyle = cssVar("--seed-ring", "#38bdf8");
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(o.x, o.y, 3.3, 0, Math.PI * 2);
        ctx.fillStyle = cssVar("--origin-dot", "#202a36");
        ctx.fill();
    }

    function render() {
        ctx.clearRect(0, 0, state.width, state.height);
        drawBackground();
        drawAxes();
        drawPoints();
        drawConvexHullSurface();
        drawSymmetryElements();
    }

    function resizeCanvas() {
        const rect = dom.canvas.getBoundingClientRect();
        state.width = Math.max(300, Math.round(rect.width));
        state.height = Math.max(300, Math.round(rect.height));

        const dpr = window.devicePixelRatio || 1;
        dom.canvas.width = Math.round(state.width * dpr);
        dom.canvas.height = Math.round(state.height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        render();
    }

    function markCustomAndRecompute() {
        dom.preset.value = "custom";
        recalculate();
    }

    function bindEvents() {
        const watched = [
            dom.seedX, dom.seedY, dom.seedZ,
            dom.zOrder, dom.zMode, dom.yOrder, dom.yMode,
            dom.xOrder, dom.xMode, dom.dOrder, dom.dMode,
            dom.mz, dom.my, dom.mx, dom.inv,
            dom.showAxes, dom.showSymmetry, dom.showVectors
        ];

        for (const el of watched) {
            if (!el) {
                continue;
            }
            el.addEventListener("input", markCustomAndRecompute);
            el.addEventListener("change", markCustomAndRecompute);
        }

        if (dom.hullOpacity) {
            const onOpacityChange = function () {
                syncHullOpacity();
                render();
            };
            dom.hullOpacity.addEventListener("input", onOpacityChange);
            dom.hullOpacity.addEventListener("change", onOpacityChange);
        }

        if (dom.strictStyle) {
            dom.strictStyle.addEventListener("input", render);
            dom.strictStyle.addEventListener("change", render);
        }
        if (dom.showHull) {
            dom.showHull.addEventListener("input", render);
            dom.showHull.addEventListener("change", render);
        }

        dom.recompute.addEventListener("click", recalculate);
        dom.resetView.addEventListener("click", resetView);
        dom.randomSeed.addEventListener("click", randomSeed);

        if (dom.themeToggle) {
            dom.themeToggle.addEventListener("click", toggleTheme);
        }

        if (dom.viewerFsBtn) {
            dom.viewerFsBtn.addEventListener("click", toggleViewerFullscreen);
        }

        window.addEventListener("keydown", function (e) {
            if (e.key !== "Escape") {
                return;
            }
            if (!dom.viewerCard || !dom.viewerCard.classList.contains("fullscreen")) {
                return;
            }
            toggleViewerFullscreen();
        });

        dom.applyPreset.addEventListener("click", function () {
            if (dom.preset.value !== "custom") {
                applyPreset(dom.preset.value);
            }
            recalculate();
        });

        dom.preset.addEventListener("change", function () {
            if (dom.preset.value !== "custom") {
                applyPreset(dom.preset.value);
                recalculate();
            }
        });

        dom.canvas.addEventListener("mousedown", function (e) {
            state.dragging = true;
            state.dragX = e.clientX;
            state.dragY = e.clientY;
        });

        window.addEventListener("mouseup", function () {
            state.dragging = false;
        });

        window.addEventListener("mousemove", function (e) {
            if (!state.dragging) {
                return;
            }
            const dx = e.clientX - state.dragX;
            const dy = e.clientY - state.dragY;
            state.dragX = e.clientX;
            state.dragY = e.clientY;

            state.view.yaw += dx * VIEW_CONFIG.dragSensitivity;
            state.view.pitch = clamp(
                state.view.pitch + dy * VIEW_CONFIG.dragSensitivity,
                VIEW_CONFIG.pitchMin,
                VIEW_CONFIG.pitchMax
            );
            render();
        });

        dom.canvas.addEventListener("wheel", function (e) {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.08 : 0.92;
            state.view.zoom = clamp(state.view.zoom * factor, 0.35, 3.2);
            render();
        }, { passive: false });

        dom.canvas.addEventListener("dblclick", resetView);

        dom.canvas.addEventListener("touchstart", function (e) {
            if (e.touches.length !== 1) {
                return;
            }
            const t = e.touches[0];
            state.dragging = true;
            state.dragX = t.clientX;
            state.dragY = t.clientY;
        }, { passive: true });

        dom.canvas.addEventListener("touchmove", function (e) {
            if (!state.dragging || e.touches.length !== 1) {
                return;
            }
            const t = e.touches[0];
            const dx = t.clientX - state.dragX;
            const dy = t.clientY - state.dragY;
            state.dragX = t.clientX;
            state.dragY = t.clientY;
            state.view.yaw += dx * VIEW_CONFIG.touchSensitivity;
            state.view.pitch = clamp(
                state.view.pitch + dy * VIEW_CONFIG.touchSensitivity,
                VIEW_CONFIG.pitchMin,
                VIEW_CONFIG.pitchMax
            );
            render();
            e.preventDefault();
        }, { passive: false });

        dom.canvas.addEventListener("touchend", function () {
            state.dragging = false;
        });

        window.addEventListener("resize", resizeCanvas);
    }

    function animate() {
        if (dom.autoSpin.checked && !state.dragging) {
            state.view.yaw += VIEW_CONFIG.autoSpinStep;
            render();
        }
        requestAnimationFrame(animate);
    }

    function init() {
        initTheme();
        bindEvents();
        syncHullOpacity();
        syncViewerFullscreenButton(false);
        resizeCanvas();
        recalculate();
        animate();
    }

    init();
})();
