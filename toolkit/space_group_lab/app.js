(function () {
    "use strict";

    const MAX_OPERATIONS = 384;
    const EPS_KEY = 1e-8;
    const VIEW_CONFIG = {
        dragSensitivity: 0.0045,
        touchSensitivity: 0.0055,
        autoSpinStep: 0.0025
    };

    const DEFAULT_VIEW = {
        yaw: 0,
        pitch: 0,
        zoom: 1
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

    const AXIS_COLORS = {
        X: "#60a5fa",
        Y: "#14b8a6",
        Z: "#818cf8"
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
        viewFront: document.getElementById("view-front"),
        viewTop: document.getElementById("view-top"),
        viewSide: document.getElementById("view-side"),
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
        yShift: document.getElementById("y-shift"),
        xOrder: document.getElementById("x-order"),
        xMode: document.getElementById("x-mode"),
        xShift: document.getElementById("x-shift"),
        dOrder: document.getElementById("d-order"),
        dMode: document.getElementById("d-mode"),
        zShift: document.getElementById("z-shift"),
        glideType: document.getElementById("glide-type"),
        glideNormal: document.getElementById("glide-normal"),
        mz: document.getElementById("m-z"),
        my: document.getElementById("m-y"),
        mx: document.getElementById("m-x"),
        inv: document.getElementById("inv"),
        showAxes: document.getElementById("show-axes"),
        showSymmetry: document.getElementById("show-symmetry"),
        showHull: document.getElementById("show-hull"),
        hullOpacity: document.getElementById("hull-opacity"),
        hullOpacityValue: document.getElementById("hull-opacity-value"),
        neighborSymOpacity: document.getElementById("neighbor-sym-opacity"),
        neighborSymOpacityValue: document.getElementById("neighbor-sym-opacity-value"),
        strictStyle: document.getElementById("strict-style"),
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
        summary: document.getElementById("summary"),
        diagGrowth: document.getElementById("diag-growth"),
        diagRotation: document.getElementById("diag-rotation"),
        diagTranslation: document.getElementById("diag-translation"),
        diagMatch: document.getElementById("diag-match")
    };

    const ctx = dom.canvas.getContext("2d");
    const symbolToolkit = window.PointGroupGraphicalSymbols || null;

    const orthoViews = [
        {
            name: "front",
            canvas: dom.viewFront,
            ctx: dom.viewFront ? dom.viewFront.getContext("2d") : null,
            hAxis: 0,
            vAxis: 2,
            depthAxis: 1,
            hLabel: "X",
            vLabel: "Z"
        },
        {
            name: "top",
            canvas: dom.viewTop,
            ctx: dom.viewTop ? dom.viewTop.getContext("2d") : null,
            hAxis: 0,
            vAxis: 1,
            depthAxis: 2,
            hLabel: "X",
            vLabel: "Y"
        },
        {
            name: "side",
            canvas: dom.viewSide,
            ctx: dom.viewSide ? dom.viewSide.getContext("2d") : null,
            hAxis: 1,
            vAxis: 2,
            depthAxis: 0,
            hLabel: "Y",
            vLabel: "Z"
        }
    ];

    const state = {
        seed: [0.2, 0.8, 0.5],
        seedFrac: [0.2, 0.8, 0.5],
        cellFrame: { family: "cubic", axis: [0, 0, 1] },
        sgOrbitFrac: [],
        sgListedCount: 0,
        generators: [],
        operations: [identityMatrix()],
        seitzOperations: [],
        points: [[0.2, 0.8, 0.5]],
        hullPoints: [[0.2, 0.8, 0.5]],
        hull: null,
        hullOpacity: 1,
        neighborSymOpacity: 0.34,
        symmetryElements: {
            axes: [],
            planes: [],
            hasInversion: false
        },
        width: 0,
        height: 0,
        view: {
            yaw: DEFAULT_VIEW.yaw,
            pitch: DEFAULT_VIEW.pitch,
            zoom: DEFAULT_VIEW.zoom
        },
        dragging: false,
        dragX: 0,
        dragY: 0,
        truncated: false,
        useSpaceGroup: true,
        sgInputInfo: [],
        crossCellHits: 0,
        pointClosureTruncated: false,
        diagnostics: {
            growth: "-",
            rotation: "-",
            translation: "-",
            match: "-"
        }
    };

    function fracToScenePoint(fracPoint) {
        return [
            fracPoint[0] - 0.5,
            fracPoint[1] - 0.5,
            fracPoint[2] - 0.5
        ];
    }

    function liftWrappedPointNearReference(pointFrac, referenceFrac) {
        let best = [pointFrac[0], pointFrac[1], pointFrac[2]];
        let bestDist2 = Infinity;
        for (let ix = -1; ix <= 1; ix += 1) {
            for (let iy = -1; iy <= 1; iy += 1) {
                for (let iz = -1; iz <= 1; iz += 1) {
                    const candidate = [
                        pointFrac[0] + ix,
                        pointFrac[1] + iy,
                        pointFrac[2] + iz
                    ];
                    const dx = candidate[0] - referenceFrac[0];
                    const dy = candidate[1] - referenceFrac[1];
                    const dz = candidate[2] - referenceFrac[2];
                    const d2 = dx * dx + dy * dy + dz * dz;
                    if (d2 < bestDist2) {
                        bestDist2 = d2;
                        best = candidate;
                    }
                }
            }
        }
        return best;
    }

    function unwrapOrbitForDisplay(orbitFrac, seedFrac) {
        if (!Array.isArray(orbitFrac) || orbitFrac.length === 0) {
            return [];
        }
        const seed = Array.isArray(seedFrac) ? seedFrac : orbitFrac[0];
        return orbitFrac.map((p) => liftWrappedPointNearReference(p, seed));
    }

    function canonicalizeOrbitFractions(orbitFrac) {
        const input = Array.isArray(orbitFrac) ? orbitFrac : [];
        const out = [];
        const seen = new Set();
        for (const p of input) {
            const wrapped = [wrap01(p[0]), wrap01(p[1]), wrap01(p[2])];
            const key = `${wrapped[0].toFixed(8)},${wrapped[1].toFixed(8)},${wrapped[2].toFixed(8)}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            out.push(wrapped);
        }
        return out;
    }

    function countCrossCellHits(seedFrac, operations) {
        const seed = Array.isArray(seedFrac) ? seedFrac : [0, 0, 0];
        let hits = 0;

        for (const op of operations || []) {
            if (!op || !op.R || !op.t) {
                continue;
            }
            const raw = [
                op.R[0][0] * seed[0] + op.R[0][1] * seed[1] + op.R[0][2] * seed[2] + op.t[0],
                op.R[1][0] * seed[0] + op.R[1][1] * seed[1] + op.R[1][2] * seed[2] + op.t[1],
                op.R[2][0] * seed[0] + op.R[2][1] * seed[1] + op.R[2][2] * seed[2] + op.t[2]
            ];

            const crosses =
                Math.floor(raw[0]) !== 0
                || Math.floor(raw[1]) !== 0
                || Math.floor(raw[2]) !== 0;
            if (crosses) {
                hits += 1;
            }
        }

        return hits;
    }

    function pointGeneratorsToSeitz(gens) {
        const unitBasis = { a: [1, 0, 0], b: [0, 1, 0], c: [0, 0, 1] };
        const basis = arguments.length > 1 && arguments[1] ? arguments[1] : unitBasis;
        const fracTransforms = createFractionalBasisTransforms(basis);
        const center = [0.5, 0.5, 0.5];
        const out = [];
        for (const g of gens || []) {
            const R = sanitizeCrystalMatrix(cartesianToFractionalMatrix(g.matrix, fracTransforms));
            const tRaw = Array.isArray(g.t) ? g.t : [0, 0, 0];

            // Conjugate around cell center c: p' = R(p-c) + c + t = Rp + (c - Rc + t)
            const Rc = [
                R[0][0] * center[0] + R[0][1] * center[1] + R[0][2] * center[2],
                R[1][0] * center[0] + R[1][1] * center[1] + R[1][2] * center[2],
                R[2][0] * center[0] + R[2][1] * center[1] + R[2][2] * center[2]
            ];
            const tCentered = [
                center[0] - Rc[0] + tRaw[0],
                center[1] - Rc[1] + tRaw[1],
                center[2] - Rc[2] + tRaw[2]
            ];

            out.push({
                R,
                t: sanitizeCrystalVector(tCentered),
                label: g.name || "point-generator"
            });
        }
        return out;
    }

    function buildComposedSeitzGenerators(core, gens, basis) {
        const listedOps = [];
        const info = [];

        const pointOps = pointGeneratorsToSeitz(gens, basis);
        if (pointOps.length > 0) {
            listedOps.push(...pointOps);
            info.push(`点群控件生成元: ${pointOps.length} 个`);
        }

        if (listedOps.length === 0) {
            info.push("无输入生成元（仅恒等操作）");
        }

        const uniqueOps = [];
        const seen = new Set();
        let duplicateCount = 0;
        for (const op of listedOps) {
            const key = core.operationKey(op);
            if (seen.has(key)) {
                duplicateCount += 1;
                continue;
            }
            seen.add(key);
            uniqueOps.push(op);
        }
        if (duplicateCount > 0) {
            info.push(`去重: ${duplicateCount} 个重复操作`);
        }

        return { listedOps: uniqueOps, info };
    }

    function generatePointClosureInCell(seedFrac, generators, core, maxPoints) {
        const limit = Number.isFinite(maxPoints) ? Math.max(1, Math.round(maxPoints)) : 4096;
        const gens = Array.isArray(generators) ? generators : [];
        const seed = core.wrapVector(Array.isArray(seedFrac) ? seedFrac : [0, 0, 0]);

        const points = [seed];
        const seen = new Set([core.pointKey(seed)]);
        let truncated = false;

        for (let i = 0; i < points.length; i += 1) {
            const base = points[i];
            for (const op of gens) {
                const next = core.applyOperation(op, base);
                const key = core.pointKey(next);
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);
                points.push(next);
                if (points.length >= limit) {
                    truncated = true;
                    return { points, truncated };
                }
            }
        }

        return { points, truncated };
    }

    function rationalDenominator(value, maxDenominator, eps) {
        const maxDen = maxDenominator || 24;
        const tolerance = typeof eps === "number" ? eps : 1e-7;
        const wrapped = ((value % 1) + 1) % 1;
        if (wrapped < tolerance || Math.abs(wrapped - 1) < tolerance) {
            return 1;
        }
        for (let d = 1; d <= maxDen; d += 1) {
            const n = Math.round(wrapped * d);
            if (Math.abs(wrapped * d - n) < tolerance) {
                return d;
            }
        }
        return null;
    }

    function nearestPrototypeByListedCount(listedCount) {
        const dataMin = window.SpaceGroupDataMin;
        if (!dataMin || !Array.isArray(dataMin.groups) || dataMin.groups.length === 0) {
            return null;
        }

        let best = dataMin.groups[0];
        let bestDelta = Math.abs((best.symmetryOperations || []).length - listedCount);
        for (let i = 1; i < dataMin.groups.length; i += 1) {
            const g = dataMin.groups[i];
            const delta = Math.abs((g.symmetryOperations || []).length - listedCount);
            if (delta < bestDelta) {
                best = g;
                bestDelta = delta;
            }
        }
        return best;
    }

    function analyzeSpaceGroupDiagnostics(listedOps, closureOps, truncated) {
        const listed = listedOps || [];
        const closure = closureOps || [];

        const listedCount = Math.max(1, listed.length);
        const growthRatio = closure.length / listedCount;
        let growth = `平稳（ratio ${growthRatio.toFixed(2)}）`;
        if (truncated) {
            growth = "警告：闭包达到上限，可能快速膨胀";
        } else if (growthRatio > 24) {
            growth = `偏快（ratio ${growthRatio.toFixed(2)}）`;
        } else if (growthRatio > 10) {
            growth = `中等（ratio ${growthRatio.toFixed(2)}）`;
        }

        const allowedOrders = new Set([1, 2, 3, 4, 6]);
        const nonCrystalOrders = [];
        let maxOrder = 1;
        for (const op of listed) {
            if (!op || !op.R) {
                continue;
            }
            const det = determinant3(op.R);
            const properPart = det < 0 ? scaleMatrix(op.R, -1) : op.R;
            const order = inferRotationOrder(properPart);
            if (Number.isFinite(order) && order > 0) {
                maxOrder = Math.max(maxOrder, order);
                if (!allowedOrders.has(order)) {
                    nonCrystalOrders.push(order);
                }
            }
        }
        const uniqBadOrders = Array.from(new Set(nonCrystalOrders)).sort((a, b) => a - b);
        const rotation = uniqBadOrders.length > 0
            ? `警告：检测到非常规阶次 ${uniqBadOrders.join(", ")}`
            : `通过（最大阶次 ${maxOrder}）`;

        let irrationalCount = 0;
        let fracCount = 0;
        let maxDen = 1;
        for (const op of listed) {
            if (!op || !Array.isArray(op.t)) {
                continue;
            }
            for (const value of op.t) {
                if (Math.abs(value) < 1e-9) {
                    continue;
                }
                fracCount += 1;
                const d = rationalDenominator(value, 24, 1e-7);
                if (!d) {
                    irrationalCount += 1;
                } else {
                    maxDen = Math.max(maxDen, d);
                }
            }
        }
        let translation = "无分数平移（点群型）";
        if (fracCount > 0 && irrationalCount === 0) {
            translation = `通过（有理平移，最大分母 ${maxDen}）`;
        } else if (fracCount > 0) {
            translation = `警告：疑似无理平移分量 ${irrationalCount} 个`;
        }

        const nearest = nearestPrototypeByListedCount(listed.length);
        let match = "无参考";
        if (nearest) {
            match = `近似匹配 ${nearest.hm} (#${nearest.number})`;
        }

        return {
            growth,
            rotation,
            translation,
            match
        };
    }

    function updateDiagnosticsPanel() {
        const d = state.diagnostics || {};
        if (dom.diagGrowth) {
            dom.diagGrowth.textContent = `增长：${d.growth || "-"}`;
        }
        if (dom.diagRotation) {
            dom.diagRotation.textContent = `旋转阶：${d.rotation || "-"}`;
        }
        if (dom.diagTranslation) {
            dom.diagTranslation.textContent = `平移有理性：${d.translation || "-"}`;
        }
        if (dom.diagMatch) {
            dom.diagMatch.textContent = `标准匹配：${d.match || "-"}`;
        }
    }

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

    function wrapAngle(v) {
        const tau = Math.PI * 2;
        let a = v % tau;
        if (a <= -Math.PI) {
            a += tau;
        }
        if (a > Math.PI) {
            a -= tau;
        }
        return a;
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

    function snapCrystalValue(v) {
        const x = Number(v);
        if (!Number.isFinite(x)) {
            return 0;
        }

        const snappedInt = Math.round(x);
        if (Math.abs(x - snappedInt) < 1e-8) {
            return snappedInt;
        }

        const candidates = [
            -2, -1.5, -1, -2 / 3, -0.5, -1 / 3,
            0,
            1 / 3, 0.5, 2 / 3, 1, 1.5, 2
        ];
        for (const c of candidates) {
            if (Math.abs(x - c) < 1e-8) {
                return c;
            }
        }

        return Math.abs(x) < 1e-12 ? 0 : x;
    }

    function sanitizeCrystalVector(v) {
        return [
            snapCrystalValue(v[0]),
            snapCrystalValue(v[1]),
            snapCrystalValue(v[2])
        ];
    }

    function sanitizeCrystalMatrix(m) {
        return [
            [snapCrystalValue(m[0][0]), snapCrystalValue(m[0][1]), snapCrystalValue(m[0][2])],
            [snapCrystalValue(m[1][0]), snapCrystalValue(m[1][1]), snapCrystalValue(m[1][2])],
            [snapCrystalValue(m[2][0]), snapCrystalValue(m[2][1]), snapCrystalValue(m[2][2])]
        ];
    }

    function createFractionalBasisTransforms(cellBasis) {
        const b = cellBasis || { a: [1, 0, 0], b: [0, 1, 0], c: [0, 0, 1] };
        const B = [
            [b.a[0], b.b[0], b.c[0]],
            [b.a[1], b.b[1], b.c[1]],
            [b.a[2], b.b[2], b.c[2]]
        ];

        const crossBC = cross(b.b, b.c);
        const crossCA = cross(b.c, b.a);
        const crossAB = cross(b.a, b.b);
        const det = dot(b.a, crossBC);

        if (Math.abs(det) < 1e-10) {
            return {
                B: identityMatrix(),
                BInv: identityMatrix()
            };
        }

        const invDet = 1 / det;
        const BInv = [
            [crossBC[0] * invDet, crossBC[1] * invDet, crossBC[2] * invDet],
            [crossCA[0] * invDet, crossCA[1] * invDet, crossCA[2] * invDet],
            [crossAB[0] * invDet, crossAB[1] * invDet, crossAB[2] * invDet]
        ];

        return { B, BInv };
    }

    function cartesianToFractionalMatrix(RCartesian, transforms) {
        const t = transforms || { B: identityMatrix(), BInv: identityMatrix() };
        return matMul(t.BInv, matMul(RCartesian, t.B));
    }

    function fractionalToCartesianMatrix(RFractional, transforms) {
        const t = transforms || { B: identityMatrix(), BInv: identityMatrix() };
        return matMul(t.B, matMul(RFractional, t.BInv));
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

    function normalizedAxisShift(order, shiftAlongAxis) {
        const raw = Number(shiftAlongAxis);
        if (!Number.isFinite(raw) || Math.abs(raw) < 1e-9) {
            return 0;
        }

        const n = Math.max(1, Math.round(Number(order) || 1));
        const nearestInt = Math.round(raw);
        const isIntegerLike = Math.abs(raw - nearestInt) < 1e-9;

        // In fractional coordinates, integer lattice translation is equivalent to identity.
        // Treat integer input m on an n-fold axis as m/n to match screw-axis intuition.
        if (isIntegerLike && Math.abs(nearestInt) >= 1 && n > 1) {
            return nearestInt / n;
        }

        return raw;
    }

    function axisOperation(axisName, order, mode, shiftAlongAxis) {
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
        const shift = normalizedAxisShift(n, shiftAlongAxis);
        const t = [0, 0, 0];
        if (Math.abs(shift) > 1e-9) {
            if (axisName === "x") {
                t[0] = shift;
            } else if (axisName === "y") {
                t[1] = shift;
            } else if (axisName === "z") {
                t[2] = shift;
            }
        }
        return {
            name: Math.abs(shift) > 1e-9
                ? `${symbol} // ${label} + t=${shift.toFixed(3)}`
                : `${symbol} // ${label}`,
            matrix: op,
            kind: "axis",
            axis,
            axisLabel: label,
            mode,
            order: n,
            t
        };
    }

    function axisIndex(name) {
        if (name === "x") {
            return 0;
        }
        if (name === "y") {
            return 1;
        }
        return 2;
    }

    function glideTranslation(type, normalAxisName) {
        const normal = normalAxisName === "x" || normalAxisName === "y" || normalAxisName === "z"
            ? normalAxisName
            : "y";
        const t = [0, 0, 0];
        const nIdx = axisIndex(normal);
        const inPlane = [0, 1, 2].filter((i) => i !== nIdx);

        const setHalf = function (idx) {
            t[idx] = 0.5;
        };
        const setQuarter = function (idx) {
            t[idx] = 0.25;
        };

        if (type === "a" || type === "b" || type === "c") {
            const want = axisIndex(type);
            if (want !== nIdx) {
                setHalf(want);
            } else {
                setHalf(inPlane[0]);
            }
            return t;
        }

        if (type === "n") {
            setHalf(inPlane[0]);
            setHalf(inPlane[1]);
            return t;
        }

        if (type === "d") {
            setQuarter(inPlane[0]);
            setQuarter(inPlane[1]);
            return t;
        }

        return null;
    }

    function glideOperation(type, normalAxisName) {
        const glideType = String(type || "none").trim();
        if (glideType === "none") {
            return null;
        }
        const normal = normalAxisName === "x" || normalAxisName === "y" || normalAxisName === "z"
            ? normalAxisName
            : "y";
        const t = glideTranslation(glideType, normal);
        if (!t) {
            return null;
        }

        return {
            name: `${glideType}-glide \u22a5${normal.toUpperCase()}`,
            kind: "glide",
            matrix: mirrorMatrix(AXIS[normal]),
            t
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
        if (g.kind === "screw") {
            return escapeHtml(g.name);
        }
        if (g.kind === "glide") {
            return escapeHtml(g.name);
        }
        if (g.kind === "inversion") {
            return `<span class="hm-overbar">1</span>`;
        }
        return escapeHtml(g.name);
    }

    function collectGenerators() {
        const gens = [];

        const axisOps = [
            ["z", dom.zOrder.value, dom.zMode.value, dom.zShift ? dom.zShift.value : 0],
            ["y", dom.yOrder.value, dom.yMode.value, dom.yShift ? dom.yShift.value : 0],
            ["x", dom.xOrder.value, dom.xMode.value, dom.xShift ? dom.xShift.value : 0],
            ["d", dom.dOrder.value, dom.dMode.value, 0]
        ];

        for (const item of axisOps) {
            const axisName = item[0];
            const axisMode = item[2];
            const shift = item[3];
            const g = axisOperation(axisName, item[1], axisMode, shift);
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

        // Advanced selectors
        if (dom.glideType && dom.glideNormal && dom.glideType.value !== "none") {
            const g = glideOperation(dom.glideType.value, dom.glideNormal.value);
            if (g) {
                gens.push(g);
            }
        }

        return gens;
    }

    function inferFrameFromGenerators(gens) {
        const input = Array.isArray(gens) ? gens : [];
        const axisRotations = input.filter((g) => g && g.kind === "axis");

        let maxOrder = 1;
        let principalAxis = [0, 0, 1];
        const order2DirKeys = new Set();

        for (const g of axisRotations) {
            const n = Math.max(2, Math.round(g.order || 2));
            if (n > maxOrder) {
                maxOrder = n;
                principalAxis = normalize(g.axis || [0, 0, 1]);
            }
            if (n === 2) {
                order2DirKeys.add(directionKey(g.axis || [0, 0, 1]));
            }
        }

        if (maxOrder >= 6) {
            return { family: "hexagonal", axis: principalAxis };
        }
        if (maxOrder === 4) {
            return { family: "tetragonal", axis: principalAxis };
        }
        if (maxOrder === 3) {
            return { family: "trigonal", axis: principalAxis };
        }
        if (maxOrder === 2) {
            return {
                family: order2DirKeys.size >= 3 ? "orthorhombic" : "monoclinic",
                axis: principalAxis
            };
        }

        return { family: "cubic", axis: [0, 0, 1] };
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

    function syncNeighborSymOpacity() {
        const value = Number(dom.neighborSymOpacity && dom.neighborSymOpacity.value) || 0;
        state.neighborSymOpacity = clamp(value / 100, 0, 1);
        if (dom.neighborSymOpacityValue) {
            dom.neighborSymOpacityValue.textContent = `${value}%`;
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
        if (dom.xShift) {
            dom.xShift.value = "0";
        }
        if (dom.yShift) {
            dom.yShift.value = "0";
        }
        if (dom.zShift) {
            dom.zShift.value = "0";
        }

        dom.mx.checked = cfg.mirror.x;
        dom.my.checked = cfg.mirror.y;
        dom.mz.checked = cfg.mirror.z;
        dom.inv.checked = cfg.inversion;
    }

    function recalculate() {
        const rawSeed = parseSeed();
        const uiGenerators = collectGenerators();
        const inputFrame = inferFrameFromGenerators(uiGenerators);
        const inputBasis = getCellBasis(inputFrame);

        const core = window.SpaceGroupCore;

        if (core) {
            const combo = buildComposedSeitzGenerators(core, uiGenerators, inputBasis);
            const listedOps = combo.listedOps;
            const closure = core.generateClosure(listedOps, { maxOps: 256 });
            const fracSeed = core.wrapVector(rawSeed);
            const pointClosure = generatePointClosureInCell(fracSeed, listedOps, core, 4096);
            const orbitFrac = pointClosure.points;
            const transforms = createFractionalBasisTransforms(inputBasis);

            state.useSpaceGroup = true;
            state.cellFrame = inputFrame;
            state.seedFrac = fracSeed;
            state.seed = fracToScenePoint(fracSeed);
            state.sgOrbitFrac = orbitFrac;
            state.sgListedCount = listedOps.length;
            state.operations = closure.operations.map((op) => fractionalToCartesianMatrix(op.R, transforms));
            state.seitzOperations = closure.operations.map((op) => ({
                R: sanitizeCrystalMatrix(op.R),
                t: sanitizeCrystalVector(op.t)
            }));
            state.truncated = closure.truncated;
            state.points = orbitFrac.map(fracToScenePoint);
            state.generators = [];
            state.sgInputInfo = combo.info;
            state.crossCellHits = countCrossCellHits(fracSeed, closure.operations);
            state.pointClosureTruncated = pointClosure.truncated;
            state.diagnostics = analyzeSpaceGroupDiagnostics(listedOps, closure.operations, closure.truncated);
        } else {
            state.useSpaceGroup = false;
            state.cellFrame = inputFrame;
            state.seed = rawSeed;
            state.seedFrac = [rawSeed[0], rawSeed[1], rawSeed[2]];
            state.sgOrbitFrac = [];
            state.sgListedCount = 0;
            state.sgInputInfo = [];
            state.crossCellHits = 0;
            state.pointClosureTruncated = false;
            state.generators = uiGenerators;

            const group = generateGroup(state.generators);
            state.operations = group.ops;
            state.seitzOperations = [];
            state.truncated = group.truncated;
            state.points = orbitFromSeed(state.seed, state.operations);
            state.diagnostics = {
                growth: "点群回退模式",
                rotation: "仅做点群矩阵闭包",
                translation: "未启用 Seitz 平移",
                match: "未匹配空间群"
            };
        }

        state.symmetryElements = buildSymmetryElements();

        if (state.useSpaceGroup) {
            const frame = state.cellFrame || selectUnitCellFrame();
            const basis = getCellBasis(frame);
            const canonicalFrac = canonicalizeOrbitFractions(state.sgOrbitFrac);
            const displayFrac = unwrapOrbitForDisplay(canonicalFrac, state.seedFrac);
            state.seed = cellFractionToScenePoint(state.seedFrac, basis);
            state.points = displayFrac.map((frac) => cellFractionToScenePoint(frac, basis));
            state.hullPoints = canonicalFrac.map((frac) => cellFractionToScenePoint(frac, basis));
        } else {
            state.hullPoints = Array.isArray(state.points) ? state.points.slice() : [];
        }

        state.hull = computeConvexHull(state.hullPoints);

        updateStats();
        render();
    }

    function updateStats() {
        dom.genCount.textContent = String(state.useSpaceGroup ? state.sgListedCount : state.generators.length);
        dom.opCount.textContent = String(state.operations.length);
        dom.ptCount.textContent = String(state.points.length);

        const warnMessages = [];
        if (state.truncated) {
            warnMessages.push(state.useSpaceGroup
                ? "空间群闭包达到上限 256，已提前截断。"
                : `操作数量达到上限 ${MAX_OPERATIONS}，已提前截断。`);
        }
        if (state.useSpaceGroup && state.pointClosureTruncated) {
            warnMessages.push("轨道点闭包达到上限 4096，已提前截断。");
        }
        if (state.useSpaceGroup && state.crossCellHits > 0) {
            warnMessages.push(`检测到 ${state.crossCellHits} 个跨胞作用，已折回主晶胞显示。`);
        }
        dom.warn.textContent = warnMessages.join(" ");

        const names = state.useSpaceGroup
            ? ["当前渲染模式：空间群（Seitz 仿射）"]
            : state.generators.map((g, idx) => `${idx + 1}. ${formatGeneratorLabelHtml(g)}`);

        if (state.useSpaceGroup && state.sgInputInfo && state.sgInputInfo.length > 0) {
            names.push(`组合来源: ${state.sgInputInfo.join(" + ")}`);
        }

        dom.summary.innerHTML = names.length > 0 ? names.join("<br>") : "仅恒等操作 E";
        updateDiagnosticsPanel();
    }

    function resetView() {
        state.view.yaw = DEFAULT_VIEW.yaw;
        state.view.pitch = DEFAULT_VIEW.pitch;
        state.view.zoom = DEFAULT_VIEW.zoom;
        render();
    }

    function randomSeed() {
        const randomValue = () => Math.random().toFixed(2);
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

    function drawOrthoPolygon(viewCtx, x, y, sides, radius, rotation) {
        if (sides < 3) {
            return;
        }
        viewCtx.beginPath();
        for (let i = 0; i < sides; i += 1) {
            const t = rotation + (2 * Math.PI * i) / sides;
            const px = x + radius * Math.cos(t);
            const py = y + radius * Math.sin(t);
            if (i === 0) {
                viewCtx.moveTo(px, py);
            } else {
                viewCtx.lineTo(px, py);
            }
        }
        viewCtx.closePath();
    }

    function buildPolygonVertices(x, y, sides, radius, rotation) {
        const vertices = [];
        for (let i = 0; i < sides; i += 1) {
            const t = rotation + (2 * Math.PI * i) / sides;
            vertices.push({ x: x + radius * Math.cos(t), y: y + radius * Math.sin(t) });
        }
        return vertices;
    }

    function pathFromVertices(viewCtx, vertices) {
        if (!vertices || vertices.length === 0) {
            return;
        }
        viewCtx.beginPath();
        viewCtx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i += 1) {
            viewCtx.lineTo(vertices[i].x, vertices[i].y);
        }
        viewCtx.closePath();
    }

    function canonical2DLineDirection(u, v) {
        const m = Math.hypot(u, v);
        if (m < 1e-7) {
            return null;
        }
        let du = u / m;
        let dv = v / m;
        if (du < -1e-10 || (Math.abs(du) <= 1e-10 && dv < 0)) {
            du = -du;
            dv = -dv;
        }
        return [du, dv];
    }

    function axisPriority(axis) {
        const order = Math.max(2, Math.round(axis.order || 2));
        // At coincident projected poles, show higher-order proper rotations first
        // so 3/4/6 symbols are not hidden by secondary 2-fold components.
        if (axis.mode === "rot") {
            return -order;
        }
        return 100 - order;
    }

    function simplifyAxesForDisplay(axes) {
        const dirMap = new Map();
        for (const axis of axes || []) {
            const dKey = directionKey(axis.dir);
            if (!dirMap.has(dKey)) {
                dirMap.set(dKey, { rot: null, screw: null, roto: null });
            }
            const bucket = dirMap.get(dKey);
            const slot = axis.mode === "roto"
                ? "roto"
                : ((axis.kind === "screw" && (axis.screwP || 0) > 0) ? "screw" : "rot");
            if (!bucket[slot] || Math.round(axis.order || 0) > Math.round(bucket[slot].order || 0)) {
                bucket[slot] = axis;
            }
        }

        const out = [];
        for (const entry of dirMap.values()) {
            if (entry.rot) {
                out.push(entry.rot);
            }
            if (entry.screw) {
                out.push(entry.screw);
            }
            if (entry.roto) {
                out.push(entry.roto);
            }
        }
        return out;
    }

    function toSubscriptDigits(value) {
        const map = {
            "0": "₀",
            "1": "₁",
            "2": "₂",
            "3": "₃",
            "4": "₄",
            "5": "₅",
            "6": "₆",
            "7": "₇",
            "8": "₈",
            "9": "₉"
        };
        return String(value).split("").map((ch) => map[ch] || ch).join("");
    }

    function axisSymbolText(element) {
        const order = Math.max(2, Math.round(element.order || 2));
        if (element.mode === "roto" && order === 2) {
            return "m";
        }
        if (element.mode !== "roto" && element.kind === "screw" && (element.screwP || 0) > 0) {
            return `${order}${toSubscriptDigits(element.screwP)}`;
        }
        return String(order);
    }

    function planeDashPattern(plane) {
        const kind = plane && plane.kind;
        const glide = plane && plane.glideType;
        if (kind !== "glide") {
            return [];
        }
        if (glide === "a" || glide === "b" || glide === "c") {
            return [8, 5];
        }
        if (glide === "n") {
            return [10, 4, 2, 4];
        }
        if (glide === "d") {
            return [10, 3, 2, 3, 2, 3];
        }
        return [4, 4];
    }

    function drawOrthoAxisBadge(viewCtx, x, y, element, strict, radius, options) {
        const opts = options || {};
        void opts;
        const r = radius || 5.8;
        const stroke = cssVar("--ortho-sym-line", "rgba(17, 24, 39, 0.9)");
        const fillSolid = cssVar("--ortho-symbol-fill", "#111827");
        const fillOpen = cssVar("--ortho-symbol-open", "#ffffff");
        const textSolid = cssVar("--ortho-symbol-text", "#f8fafc");
        const textOpen = cssVar("--ortho-symbol-open-text", "#111827");

        if (symbolToolkit && typeof symbolToolkit.drawAxisSymbol === "function" && element.kind !== "screw") {
            symbolToolkit.drawAxisSymbol(viewCtx, {
                x,
                y,
                mode: element.mode,
                order: element.order,
                radius: r,
                strict,
                rotation: -Math.PI / 2,
                palette: {
                    stroke,
                    fillSolid,
                    fillOpen,
                    textSolid,
                    textOpen
                }
            });
            return;
        }

        const order = Math.max(2, Math.round(element.order || 2));

        if (strict && element.mode === "rot" && element.kind !== "screw" && order === 2) {
            viewCtx.beginPath();
            viewCtx.ellipse(x, y, r * 0.52, r * 0.92, 0, 0, Math.PI * 2);
            viewCtx.fillStyle = fillSolid;
            viewCtx.fill();
            viewCtx.strokeStyle = stroke;
            viewCtx.lineWidth = 1.02;
            viewCtx.stroke();
            return;
        }

        if (strict && element.mode === "rot" && element.kind !== "screw" && (order === 3 || order === 4 || order === 6)) {
            drawOrthoPolygon(viewCtx, x, y, order, r * 0.9, -Math.PI / 2);
            viewCtx.fillStyle = fillSolid;
            viewCtx.fill();
            viewCtx.strokeStyle = stroke;
            viewCtx.lineWidth = 1.02;
            viewCtx.stroke();
            return;
        }

        if (strict && element.mode === "roto" && order >= 3) {
            if (order % 2 === 1) {
                viewCtx.beginPath();
                viewCtx.arc(x, y, r, 0, Math.PI * 2);
                viewCtx.fillStyle = fillSolid;
                viewCtx.fill();
                viewCtx.strokeStyle = stroke;
                viewCtx.lineWidth = 1.04;
                viewCtx.stroke();

                drawOrthoPolygon(viewCtx, x, y, order, r * 0.56, -Math.PI / 2);
                viewCtx.fillStyle = fillOpen;
                viewCtx.fill();
                viewCtx.strokeStyle = stroke;
                viewCtx.lineWidth = 0.94;
                viewCtx.stroke();
            } else {
                const vertices = buildPolygonVertices(x, y, order, r * 0.9, -Math.PI / 2);
                pathFromVertices(viewCtx, vertices);
                viewCtx.fillStyle = fillOpen;
                viewCtx.fill();
                viewCtx.strokeStyle = stroke;
                viewCtx.lineWidth = 1.05;
                viewCtx.stroke();

                viewCtx.beginPath();
                for (let i = 0; i < vertices.length; i += 2) {
                    viewCtx.moveTo(x, y);
                    viewCtx.lineTo(vertices[i].x, vertices[i].y);
                }
                viewCtx.strokeStyle = stroke;
                viewCtx.lineWidth = 0.98;
                viewCtx.stroke();
            }
            return;
        }

        const text = axisSymbolText(element);
        viewCtx.beginPath();
        viewCtx.arc(x, y, r, 0, Math.PI * 2);
        viewCtx.fillStyle = element.mode === "roto"
            ? fillOpen
            : fillSolid;
        viewCtx.fill();
        viewCtx.strokeStyle = stroke;
        viewCtx.lineWidth = 1.02;
        viewCtx.stroke();

        viewCtx.fillStyle = element.mode === "roto"
            ? textOpen
            : textSolid;
        viewCtx.font = `700 ${Math.max(8.3, r * 1.3)}px Cambria, \"Times New Roman\", serif`;
        const tm = viewCtx.measureText(text);
        viewCtx.fillText(text, x - tm.width / 2, y + r * 0.35);

        if (element.mode === "roto" && order > 2) {
            const barY = y - r * 0.7;
            viewCtx.beginPath();
            viewCtx.moveTo(x - tm.width * 0.58, barY);
            viewCtx.lineTo(x + tm.width * 0.58, barY);
            viewCtx.strokeStyle = stroke;
            viewCtx.lineWidth = 0.92;
            viewCtx.stroke();
        }
    }

    function drawGreatCircleByNormal(viewCtx, view, plane, mapToCanvas, strict) {
        const normal = plane && plane.normal ? plane.normal : plane;
        const dash = planeDashPattern(plane);
        if (symbolToolkit && typeof symbolToolkit.drawMirrorGreatCircle === "function" && dash.length === 0) {
            symbolToolkit.drawMirrorGreatCircle(viewCtx, {
                normal,
                hAxis: view.hAxis,
                vAxis: view.vAxis,
                depthAxis: view.depthAxis,
                mapToCanvas,
                strict,
                planar: true,
                palette: {
                    lineFront: cssVar("--ortho-sym-line", "rgba(17, 24, 39, 0.9)")
                }
            });
            return;
        }

        const basis = choosePlaneBasis(normal);
        const steps = 220;
        void strict;

        viewCtx.save();
        viewCtx.strokeStyle = cssVar("--ortho-sym-line", "rgba(17, 24, 39, 0.9)");
        viewCtx.lineWidth = 1.02;
        viewCtx.setLineDash(dash);
        viewCtx.beginPath();
        for (let i = 0; i <= steps; i += 1) {
            const t = (2 * Math.PI * i) / steps;
            const p = addVec(scaleVec(basis.u, Math.cos(t)), scaleVec(basis.v, Math.sin(t)));
            const cur = mapToCanvas(p[view.hAxis], p[view.vAxis]);
            if (i === 0) {
                viewCtx.moveTo(cur.x, cur.y);
            } else {
                viewCtx.lineTo(cur.x, cur.y);
            }
        }
        viewCtx.stroke();
        viewCtx.restore();
    }

    function drawAxisDiameters(viewCtx, view, elements, mapToCanvas, strict) {
        const groups = new Map();
        const displayAxes = simplifyAxesForDisplay(elements.axes);
        for (const axis of displayAxes) {
            const dir = canonical2DLineDirection(axis.dir[view.hAxis], axis.dir[view.vAxis]);
            if (!dir) {
                continue;
            }
            const key = `${roundForKey(dir[0])},${roundForKey(dir[1])}`;
            if (!groups.has(key)) {
                groups.set(key, { du: dir[0], dv: dir[1], axis });
            } else {
                const existed = groups.get(key).axis;
                if (existed.mode === axis.mode && Math.round(axis.order || 0) > Math.round(existed.order || 0)) {
                    groups.set(key, { du: dir[0], dv: dir[1], axis });
                }
            }
        }
        void strict;

        for (const group of groups.values()) {
            const a = mapToCanvas(group.du, group.dv);
            const b = mapToCanvas(-group.du, -group.dv);

            viewCtx.save();
            viewCtx.strokeStyle = cssVar("--ortho-sym-line-soft", "rgba(55, 65, 81, 0.62)");
            viewCtx.lineWidth = 0.92;
            viewCtx.setLineDash([5, 4]);
            viewCtx.beginPath();
            viewCtx.moveTo(a.x, a.y);
            viewCtx.lineTo(b.x, b.y);
            viewCtx.stroke();
            viewCtx.restore();
        }
    }

    function drawAxisPoles(viewCtx, view, elements, mapToCanvas, strict, radiusPx) {
        const poles = [];
        const displayAxes = simplifyAxesForDisplay(elements.axes);
        for (const axis of displayAxes) {
            for (const sign of [1, -1]) {
                const x = axis.dir[view.hAxis] * sign;
                const y = axis.dir[view.vAxis] * sign;
                poles.push({
                    x,
                    y,
                    element: axis,
                    key: `${Number(x).toFixed(3)},${Number(y).toFixed(3)}`
                });
            }
        }

        const grouped = new Map();
        for (const pole of poles) {
            if (!grouped.has(pole.key)) {
                grouped.set(pole.key, []);
            }
            grouped.get(pole.key).push(pole);
        }

        for (const cluster of grouped.values()) {
            const uniqueByType = new Map();
            for (const item of cluster) {
                const k = `${item.element.mode}:${item.element.order}`;
                if (!uniqueByType.has(k)) {
                    uniqueByType.set(k, item.element);
                }
            }

            const candidates = Array.from(uniqueByType.values());
            if (candidates.length === 0) {
                continue;
            }
            let preferred = candidates[0];
            for (let i = 1; i < candidates.length; i += 1) {
                if (axisPriority(candidates[i]) < axisPriority(preferred)) {
                    preferred = candidates[i];
                }
            }

            const cx = cluster.reduce((s, p) => s + p.x, 0) / cluster.length;
            const cy = cluster.reduce((s, p) => s + p.y, 0) / cluster.length;
            const p = mapToCanvas(cx, cy);
            drawOrthoAxisBadge(viewCtx, p.x, p.y, preferred, strict, radiusPx * 0.09);
        }
    }

    function drawOrthoSymmetry(view, viewCtx, mapToCanvas, origin, radiusPx) {
        if (!dom.showSymmetry || !dom.showSymmetry.checked) {
            return;
        }

        const elements = state.symmetryElements || buildSymmetryElements();
        const strict = !dom.strictStyle || dom.strictStyle.checked;
        const displayElements = {
            axes: simplifyAxesForDisplay(elements.axes),
            planes: elements.planes,
            hasInversion: elements.hasInversion
        };

        if (symbolToolkit && typeof symbolToolkit.drawPrimitiveCircle === "function") {
            symbolToolkit.drawPrimitiveCircle(viewCtx, {
                x: origin.x,
                y: origin.y,
                radius: radiusPx,
                stroke: cssVar("--ortho-sym-line", "rgba(17, 24, 39, 0.9)"),
                lineWidth: 1.1
            });
        } else {
            viewCtx.save();
            viewCtx.strokeStyle = cssVar("--ortho-sym-line", "rgba(17, 24, 39, 0.9)");
            viewCtx.lineWidth = 1.1;
            viewCtx.setLineDash([]);
            viewCtx.beginPath();
            viewCtx.arc(origin.x, origin.y, radiusPx, 0, Math.PI * 2);
            viewCtx.stroke();
            viewCtx.restore();
        }

        // 平面图中反演中心优先级最低，先画后续可被反轴/旋转轴覆盖
        if (displayElements.hasInversion) {
            viewCtx.beginPath();
            viewCtx.arc(origin.x, origin.y, radiusPx * 0.08, 0, Math.PI * 2);
            viewCtx.fillStyle = "#ffffff";
            viewCtx.fill();
            viewCtx.strokeStyle = cssVar("--sym-inv-stroke", "#1f2937");
            viewCtx.lineWidth = 1.1;
            viewCtx.stroke();

            viewCtx.beginPath();
            viewCtx.arc(origin.x, origin.y, radiusPx * 0.028, 0, Math.PI * 2);
            viewCtx.fillStyle = cssVar("--sym-inv-dot", "#1f2937");
            viewCtx.fill();
        }

        for (const plane of displayElements.planes) {
            drawGreatCircleByNormal(viewCtx, view, plane, mapToCanvas, strict);
        }

        drawAxisDiameters(viewCtx, view, displayElements, mapToCanvas, strict);
        drawAxisPoles(viewCtx, view, displayElements, mapToCanvas, strict, radiusPx);
    }

    function drawOrthoView(view) {
        if (!view || !view.canvas || !view.ctx) {
            return;
        }

        const viewCtx = view.ctx;
        const rect = view.canvas.getBoundingClientRect();
        const width = Math.max(10, Math.round(rect.width));
        const height = Math.max(10, Math.round(rect.height));

        viewCtx.clearRect(0, 0, width, height);

        const strict = !dom.strictStyle || dom.strictStyle.checked;
        viewCtx.fillStyle = cssVar("--ortho-bg", strict ? "#ffffff" : "#f7fbff");
        viewCtx.fillRect(0, 0, width, height);

        viewCtx.strokeStyle = cssVar("--ortho-border", strict ? "rgba(17, 24, 39, 0.58)" : "rgba(148, 180, 214, 0.42)");
        viewCtx.lineWidth = strict ? 1.2 : 1;
        viewCtx.strokeRect(0.5, 0.5, width - 1, height - 1);

        const cx = width * 0.5;
        const cy = height * 0.5;
        const radiusPx = Math.min(width, height) * 0.445;

        const mapToCanvas = function (u, v) {
            return {
                x: cx + u * radiusPx,
                y: cy - v * radiusPx
            };
        };

        const origin = mapToCanvas(0, 0);
        if (dom.showAxes && dom.showAxes.checked) {
            if (symbolToolkit && typeof symbolToolkit.drawGuideAxes === "function") {
                symbolToolkit.drawGuideAxes(viewCtx, {
                    x: cx,
                    y: cy,
                    radius: radiusPx,
                    stroke: cssVar("--ortho-guide", strict ? "rgba(17, 24, 39, 0.28)" : "rgba(72, 113, 176, 0.34)"),
                    lineWidth: 0.86,
                    dash: [3, 3]
                });
            } else {
                viewCtx.save();
                viewCtx.strokeStyle = cssVar("--ortho-guide", strict ? "rgba(17, 24, 39, 0.28)" : "rgba(72, 113, 176, 0.34)");
                viewCtx.lineWidth = 0.86;
                viewCtx.setLineDash([3, 3]);
                viewCtx.beginPath();
                viewCtx.moveTo(cx - radiusPx, cy);
                viewCtx.lineTo(cx + radiusPx, cy);
                viewCtx.moveTo(cx, cy - radiusPx);
                viewCtx.lineTo(cx, cy + radiusPx);
                viewCtx.stroke();
                viewCtx.restore();
            }
        }

        drawOrthoSymmetry(view, viewCtx, mapToCanvas, origin, radiusPx);

        if (!dom.showSymmetry || !dom.showSymmetry.checked) {
            viewCtx.beginPath();
            viewCtx.arc(origin.x, origin.y, 2.2, 0, Math.PI * 2);
            viewCtx.fillStyle = cssVar("--origin-dot", "#202a36");
            viewCtx.fill();
        }
    }

    function drawThreeViews() {
        for (const view of orthoViews) {
            drawOrthoView(view);
        }
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

    function addAxisElement(axisMap, dir, mode, order, extra) {
        if (!dir || order <= 1) {
            return;
        }
        const info = extra || {};
        const kind = info.kind || "rot";
        const screwP = Number.isFinite(info.screwP) ? Math.round(info.screwP) : 0;
        const key = `${mode}:${kind}:${order}:${screwP}:${directionKey(dir)}`;
        const existed = axisMap.get(key);
        if (!existed || order > existed.order) {
            axisMap.set(key, {
                dir: canonicalDirection(dir),
                order,
                mode,
                kind,
                screwP
            });
        }
    }

    function addPlaneElement(planeMap, normal, extra) {
        if (!normal) {
            return;
        }
        const n = canonicalDirection(normal);
        const key = directionKey(n);
        const info = extra || {};
        const next = {
            normal: n,
            kind: info.kind || "mirror",
            glideType: info.glideType || null
        };
        if (!planeMap.has(key)) {
            planeMap.set(key, next);
            return;
        }

        const prev = planeMap.get(key);
        if ((prev.kind || "mirror") !== "glide" && next.kind === "glide") {
            planeMap.set(key, next);
        }
    }

    function nearValue(value, target, eps) {
        return Math.abs(value - target) <= (typeof eps === "number" ? eps : 1e-6);
    }

    function principalAxisIndexFromDirection(v) {
        const d = normalize(v || [0, 0, 1]);
        const absV = [Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2])];
        let idx = 0;
        if (absV[1] > absV[idx]) {
            idx = 1;
        }
        if (absV[2] > absV[idx]) {
            idx = 2;
        }

        const others = [0, 1, 2].filter((i) => i !== idx);
        if (absV[idx] < 0.8 || absV[others[0]] > 0.25 || absV[others[1]] > 0.25) {
            return -1;
        }
        return idx;
    }

    function classifyScrewComponent(order, axisDirCart, axisDirFrac, tFrac) {
        const n = Math.max(1, Math.round(order || 1));
        const t = Array.isArray(tFrac) ? tFrac : [0, 0, 0];
        const idx = principalAxisIndexFromDirection(axisDirFrac || axisDirCart);

        let parallel = 0;
        if (idx >= 0) {
            parallel = wrap01(t[idx]);
        } else {
            const axisFracNorm = normalize(axisDirFrac || [0, 0, 1]);
            parallel = wrap01(axisFracNorm[0] * t[0] + axisFracNorm[1] * t[1] + axisFracNorm[2] * t[2]);
        }

        const step = parallel * n;
        const rounded = Math.round(step);
        if (Math.abs(step - rounded) > 1e-5) {
            return 0;
        }
        return ((rounded % n) + n) % n;
    }

    function classifyGlideTypeFromTranslation(tFrac, normalFrac) {
        const t = Array.isArray(tFrac) ? tFrac.map((v) => wrap01(v)) : [0, 0, 0];
        const normal = normalize(normalFrac || [0, 0, 1]);
        const nIdx = (() => {
            const absN = [Math.abs(normal[0]), Math.abs(normal[1]), Math.abs(normal[2])];
            let idx = 0;
            if (absN[1] > absN[idx]) {
                idx = 1;
            }
            if (absN[2] > absN[idx]) {
                idx = 2;
            }
            return idx;
        })();

        const inPlane = [0, 1, 2].filter((i) => i !== nIdx);
        const c0 = Math.min(t[inPlane[0]], 1 - t[inPlane[0]]);
        const c1 = Math.min(t[inPlane[1]], 1 - t[inPlane[1]]);

        if (nearValue(c0, 0, 1e-5) && nearValue(c1, 0, 1e-5)) {
            return null;
        }
        if (nearValue(c0, 0.5, 1e-5) && nearValue(c1, 0, 1e-5)) {
            return ["a", "b", "c"][inPlane[0]];
        }
        if (nearValue(c0, 0, 1e-5) && nearValue(c1, 0.5, 1e-5)) {
            return ["a", "b", "c"][inPlane[1]];
        }
        if (nearValue(c0, 0.5, 1e-5) && nearValue(c1, 0.5, 1e-5)) {
            return "n";
        }
        if (nearValue(c0, 0.25, 1e-5) && nearValue(c1, 0.25, 1e-5)) {
            return "d";
        }
        return "g";
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

        const frame = state.cellFrame || selectUnitCellFrame();
        const basis = getCellBasis(frame);
        const transforms = createFractionalBasisTransforms(basis);

        if (state.useSpaceGroup && Array.isArray(state.seitzOperations) && state.seitzOperations.length > 0) {
            for (const op of state.seitzOperations) {
                const RFrac = sanitizeCrystalMatrix(op.R || identityMatrix());
                const tFrac = sanitizeCrystalVector(op.t || [0, 0, 0]);
                const RCart = fractionalToCartesianMatrix(RFrac, transforms);

                if (isIdentityOp(RCart)) {
                    continue;
                }
                if (isInversionOp(RCart)) {
                    hasInversion = true;
                    continue;
                }

                const det = determinant3(RCart);
                if (det > 0) {
                    const order = inferRotationOrder(RCart);
                    const axisCart = eigenDirectionForValue(RCart, 1);
                    if (!axisCart || order <= 1) {
                        continue;
                    }

                    const axisFrac = matVec(transforms.BInv, axisCart);
                    const screwP = classifyScrewComponent(order, axisCart, axisFrac, tFrac);
                    addAxisElement(axisMap, axisCart, "rot", order, {
                        kind: screwP > 0 ? "screw" : "rot",
                        screwP
                    });
                    continue;
                }

                if (isMirrorOp(RCart)) {
                    const normalCart = eigenDirectionForValue(RCart, -1);
                    const normalFrac = matVec(transforms.BInv, normalCart || [0, 0, 1]);
                    const glideType = classifyGlideTypeFromTranslation(tFrac, normalFrac);
                    addPlaneElement(planeMap, normalCart, {
                        kind: glideType ? "glide" : "mirror",
                        glideType
                    });
                    continue;
                }

                const axis = eigenDirectionForValue(RCart, -1);
                const properPart = scaleMatrix(RCart, -1);
                const order = inferRotationOrder(properPart);

                if (order === 1) {
                    hasInversion = true;
                } else if (order === 2) {
                    const normalFrac = matVec(transforms.BInv, axis || [0, 0, 1]);
                    const glideType = classifyGlideTypeFromTranslation(tFrac, normalFrac);
                    addPlaneElement(planeMap, axis, {
                        kind: glideType ? "glide" : "mirror",
                        glideType
                    });
                } else {
                    addAxisElement(axisMap, axis, "roto", order, { kind: "roto", screwP: 0 });
                }
            }

            return {
                axes: Array.from(axisMap.values()),
                planes: Array.from(planeMap.values()),
                hasInversion
            };
        }

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
                addAxisElement(axisMap, axis, "rot", order, { kind: "rot", screwP: 0 });
                continue;
            }

            if (isMirrorOp(op)) {
                const normal = eigenDirectionForValue(op, -1);
                addPlaneElement(planeMap, normal, { kind: "mirror", glideType: null });
                continue;
            }

            const axis = eigenDirectionForValue(op, -1);
            const properPart = scaleMatrix(op, -1);
            const order = inferRotationOrder(properPart);

            if (order === 1) {
                hasInversion = true;
            } else if (order === 2) {
                addPlaneElement(planeMap, axis, { kind: "mirror", glideType: null });
            } else {
                addAxisElement(axisMap, axis, "roto", order, { kind: "roto", screwP: 0 });
            }
        }

        return {
            axes: Array.from(axisMap.values()),
            planes: Array.from(planeMap.values()),
            hasInversion
        };
    }

    function buildPlaneLayer(normal, radius, segments, offset) {
        const shift = Array.isArray(offset) ? offset : [0, 0, 0];
        const basis = choosePlaneBasis(normal);
        const polygon = [];
        let depth = 0;

        for (let i = 0; i <= segments; i += 1) {
            const t = (2 * Math.PI * i) / segments;
            const p = addVec(scaleVec(basis.u, radius * Math.cos(t)), scaleVec(basis.v, radius * Math.sin(t)));
            const pr = projectPoint(addVec(p, shift));
            polygon.push(pr);
            depth += pr.z;
        }

        return {
            polygon,
            depth: depth / polygon.length
        };
    }

    function drawPlaneLayer(layer, useHatch, alpha) {
        if (!layer || layer.polygon.length < 3) {
            return;
        }

        const layerAlpha = typeof alpha === "number" ? clamp(alpha, 0, 1) : 1;
        const planeInfo = layer.plane || { kind: "mirror", glideType: null };
        const dash = planeDashPattern(planeInfo);
        ctx.save();
        ctx.globalAlpha = layerAlpha;

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
        ctx.setLineDash(dash);
        ctx.stroke();

        const cx = layer.polygon.reduce((s, p) => s + p.x, 0) / layer.polygon.length;
        const cy = layer.polygon.reduce((s, p) => s + p.y, 0) / layer.polygon.length;
        const planeLabel = planeInfo.kind === "glide"
            ? (planeInfo.glideType || "g")
            : "m";
        ctx.setLineDash([]);
        ctx.fillStyle = cssVar("--sym-axis-line", "rgba(17, 24, 39, 0.82)");
        ctx.font = `600 ${strict ? 12 : 11}px Cambria, "Times New Roman", serif`;
        const tm = ctx.measureText(planeLabel);
        ctx.fillText(planeLabel, cx - tm.width / 2, cy + 4);

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

        ctx.restore();
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

        if (symbolToolkit && typeof symbolToolkit.drawAxisSymbol === "function" && element.kind !== "screw") {
            ctx.save();
            ctx.globalAlpha = alpha;
            symbolToolkit.drawAxisSymbol(ctx, {
                x: pr.x,
                y: pr.y,
                mode: element.mode,
                order: element.order,
                radius,
                strict,
                rotation: orient,
                palette: {
                    stroke: strokeColor,
                    fillSolid: darkFill,
                    fillOpen: lightFill,
                    textSolid: cssVar("--sym-axis-text", "#f2f7fc"),
                    textOpen: strokeColor
                }
            });
            ctx.restore();
            return;
        }

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

            if (!isRoto && element.kind !== "screw" && n === 2) {
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

            if (!isRoto && element.kind !== "screw" && (n === 3 || n === 4 || n === 6)) {
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

        const text = axisSymbolText(element);
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

    function chooseAxisBadgeProjections(element, offset) {
        const shift = Array.isArray(offset) ? offset : [0, 0, 0];
        const length = 1.22;
        const anchor = length * 1.03;
        const pPos = projectPoint(addVec(scaleVec(element.dir, anchor), shift));
        const pNeg = projectPoint(addVec(scaleVec(element.dir, -anchor), shift));
        if (pPos.z >= pNeg.z) {
            return { front: pPos, back: pNeg };
        }
        return { front: pNeg, back: pPos };
    }

    function makeAxisRenderData(element, offset) {
        const shift = Array.isArray(offset) ? offset : [0, 0, 0];
        const length = 1.22;
        const a = projectPoint(addVec(scaleVec(element.dir, -length), shift));
        const b = projectPoint(addVec(scaleVec(element.dir, length), shift));
        const badges = chooseAxisBadgeProjections(element, shift);

        return { element, a, b, badges };
    }

    function drawAxisLineFromData(data, opts) {
        const element = data.element;
        const a = data.a;
        const b = data.b;
        const options = opts || {};
        const lineAlpha = typeof options.alpha === "number" ? clamp(options.alpha, 0, 1) : 1;
        const dashOverride = Array.isArray(options.lineDash) ? options.lineDash : null;
        const isNeighbor = !!options.isNeighbor;

        ctx.save();
        ctx.globalAlpha = lineAlpha;
        ctx.strokeStyle = cssVar("--sym-axis-line", "rgba(17, 24, 39, 0.78)");
        ctx.lineWidth = axisLineWidthByOrder(element) * (isNeighbor ? 0.9 : 1);
        if (dashOverride) {
            ctx.setLineDash(dashOverride);
        } else if (element.kind === "screw") {
            ctx.setLineDash([2, 3]);
        } else if (!dom.strictStyle || dom.strictStyle.checked) {
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

    function drawAxisBackBadgeFromData(data, hasPlanes, alphaScale) {
        const factor = typeof alphaScale === "number" ? alphaScale : 1;
        drawAxisBadgeAt(data.badges.back, data.element, {
            isBack: true,
            alpha: (hasPlanes ? 0.52 : 0.68) * factor
        });
    }

    function drawAxisFrontBadgeFromData(data, alphaScale) {
        const factor = typeof alphaScale === "number" ? alphaScale : 1;
        drawAxisBadgeAt(data.badges.front, data.element, { isBack: false, alpha: factor });
    }

    function drawInversionCenter(offset, alphaScale) {
        const shift = Array.isArray(offset) ? offset : [0, 0, 0];
        const o = projectPoint(shift);
        const strict = !dom.strictStyle || dom.strictStyle.checked;
        const radius = strict ? 7 : clamp(6.2 * state.view.zoom, 5.2, 9);
        const alpha = typeof alphaScale === "number" ? clamp(alphaScale, 0, 1) : 1;

        ctx.save();
        ctx.globalAlpha = alpha;

        if (symbolToolkit && typeof symbolToolkit.drawInversionCenter === "function") {
            symbolToolkit.drawInversionCenter(ctx, {
                x: o.x,
                y: o.y,
                radius,
                fill: cssVar("--sym-inv-fill", "#ffffff"),
                stroke: cssVar("--sym-inv-stroke", "#1f2937"),
                dot: cssVar("--sym-inv-dot", "#1f2937")
            });
            ctx.restore();
            return;
        }

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
        ctx.restore();
    }

    function symmetryShiftStyle(shift) {
        const s = Array.isArray(shift) ? shift : [0, 0, 0];
        const dist = Math.abs(s[0]) + Math.abs(s[1]) + Math.abs(s[2]);
        if (dist < 1e-9) {
            return {
                isNeighbor: false,
                alpha: 1,
                lineDash: null
            };
        }

        return {
            isNeighbor: true,
            alpha: state.neighborSymOpacity,
            lineDash: [3, 5]
        };
    }

    function drawSymmetryElements() {
        if (!dom.showSymmetry || !dom.showSymmetry.checked) {
            return;
        }

        const elements = state.symmetryElements || buildSymmetryElements();
        const frame = selectUnitCellFrame();
        const basis = getCellBasis(frame);
        const shifts = displayCellShifts5();
        const planeCount = elements.planes.length;
        const axisCount = elements.axes.length;
        const strict = !dom.strictStyle || dom.strictStyle.checked;
        const interactive = state.dragging || (dom.autoSpin && dom.autoSpin.checked);
        const complexity = planeCount + axisCount * 0.4;
        const planeSegments = complexity >= 18 ? 32 : (complexity >= 10 ? 48 : 72);
        const useHatch = strict && !interactive && planeCount <= 8;

        const planeLayers = [];
        for (const shift of shifts) {
            const offset = basisOffset(shift, basis);
            const style = symmetryShiftStyle(shift);
            for (const plane of elements.planes) {
                const layer = buildPlaneLayer(plane.normal, 1.08, planeSegments, offset);
                layer.plane = plane;
                layer.style = style;
                planeLayers.push(layer);
            }
        }
        planeLayers.sort((a, b) => a.depth - b.depth);

        const sortedAxes = elements.axes.slice().sort((a, b) => {
            if (a.mode !== b.mode) {
                return a.mode === "rot" ? -1 : 1;
            }
            return b.order - a.order;
        });
        const axisRenderData = [];
        for (const shift of shifts) {
            const offset = basisOffset(shift, basis);
            const style = symmetryShiftStyle(shift);
            for (const axis of sortedAxes) {
                const data = makeAxisRenderData(axis, offset);
                data.style = style;
                axisRenderData.push(data);
            }
        }

        // 先画后端符号，再画镜面，反演中心优先级最低（先画），最后画轴线和前端符号
        const hasPlanes = planeLayers.length > 0;
        for (const data of axisRenderData) {
            const alphaScale = data.style && data.style.isNeighbor
                ? data.style.alpha * 0.72
                : 1;
            drawAxisBackBadgeFromData(data, hasPlanes, alphaScale);
        }
        for (const layer of planeLayers) {
            const style = layer.style || { isNeighbor: false, alpha: 1 };
            drawPlaneLayer(layer, useHatch && !style.isNeighbor, style.alpha);
        }
        if (elements.hasInversion) {
            for (const shift of shifts) {
                const style = symmetryShiftStyle(shift);
                const alphaScale = style.isNeighbor ? style.alpha * 0.78 : 1;
                drawInversionCenter(basisOffset(shift, basis), alphaScale);
            }
        }
        for (const data of axisRenderData) {
            const style = data.style || { isNeighbor: false, alpha: 1, lineDash: null };
            drawAxisLineFromData(data, {
                alpha: style.alpha,
                lineDash: style.lineDash,
                isNeighbor: style.isNeighbor
            });
        }
        for (const data of axisRenderData) {
            const alphaScale = data.style && data.style.isNeighbor
                ? data.style.alpha * 0.9
                : 1;
            drawAxisFrontBadgeFromData(data, alphaScale);
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
            { from: [-1.5, 0, 0], to: [1.5, 0, 0], color: AXIS_COLORS.X, label: "X" },
            { from: [0, -1.5, 0], to: [0, 1.5, 0], color: AXIS_COLORS.Y, label: "Y" },
            { from: [0, 0, -1.5], to: [0, 0, 1.5], color: AXIS_COLORS.Z, label: "Z" }
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

    function inferCrystalFamily(elements) {
        const data = elements || { axes: [] };
        const rotAxes = (data.axes || []).filter((axis) => axis && axis.mode === "rot");

        let maxOrder = 1;
        let principalAxis = [0, 0, 1];
        const order2DirKeys = new Set();

        for (const axis of rotAxes) {
            const order = Math.max(2, Math.round(axis.order || 2));
            if (order > maxOrder) {
                maxOrder = order;
                principalAxis = normalize(axis.dir || [0, 0, 1]);
            }
            if (order === 2) {
                order2DirKeys.add(directionKey(axis.dir || [1, 0, 0]));
            }
        }

        if (maxOrder >= 6) {
            return { family: "hexagonal", axis: principalAxis };
        }
        if (maxOrder === 4) {
            return { family: "tetragonal", axis: principalAxis };
        }
        if (maxOrder === 3) {
            return { family: "trigonal", axis: principalAxis };
        }
        if (maxOrder === 2) {
            return {
                family: order2DirKeys.size >= 3 ? "orthorhombic" : "monoclinic",
                axis: principalAxis
            };
        }
        return { family: "triclinic", axis: [0, 0, 1] };
    }

    function selectUnitCellFrame() {
        if (state.cellFrame) {
            return state.cellFrame;
        }

        const elements = state.symmetryElements || { axes: [], planes: [], hasInversion: false };
        const inferred = inferCrystalFamily(elements);
        const hasAnySymmetry = (elements.axes && elements.axes.length > 0)
            || (elements.planes && elements.planes.length > 0)
            || elements.hasInversion;

        if (!hasAnySymmetry) {
            return { family: "cubic", axis: [0, 0, 1] };
        }
        return inferred;
    }

    function buildParallelepipedWireframe(a, b, c) {
        const centerShift = scaleVec(addVec(addVec(a, b), c), 0.5);
        const corners = [];
        for (let ia = 0; ia <= 1; ia += 1) {
            for (let ib = 0; ib <= 1; ib += 1) {
                for (let ic = 0; ic <= 1; ic += 1) {
                    const p = addVec(addVec(scaleVec(a, ia), scaleVec(b, ib)), scaleVec(c, ic));
                    corners.push(subVec(p, centerShift));
                }
            }
        }

        return {
            corners,
            edges: [
                [0, 1], [0, 2], [0, 4],
                [1, 3], [1, 5],
                [2, 3], [2, 6],
                [3, 7],
                [4, 5], [4, 6],
                [5, 7],
                [6, 7]
            ]
        };
    }

    function buildRegularPrismWireframe(axisDir, sides, radius, halfHeight, baseRot) {
        const n = Math.max(3, Math.round(sides || 3));
        const axis = normalize(axisDir || [0, 0, 1]);
        const basis = choosePlaneBasis(axis);
        const corners = [];

        for (const zSign of [-1, 1]) {
            const center = scaleVec(axis, zSign * halfHeight);
            for (let i = 0; i < n; i += 1) {
                const t = baseRot + (2 * Math.PI * i) / n;
                const inPlane = addVec(
                    scaleVec(basis.u, radius * Math.cos(t)),
                    scaleVec(basis.v, radius * Math.sin(t))
                );
                corners.push(addVec(center, inPlane));
            }
        }

        const edges = [];
        for (let i = 0; i < n; i += 1) {
            edges.push([i, (i + 1) % n]);
            edges.push([n + i, n + ((i + 1) % n)]);
            edges.push([i, n + i]);
        }
        return { corners, edges };
    }

    function buildUnitCellWireframe(frame) {
        const info = frame || { family: "triclinic", axis: [0, 0, 1] };
        const axis = normalize(info.axis || [0, 0, 1]);
        const basis = choosePlaneBasis(axis);

        if (info.family === "cubic") {
            return buildParallelepipedWireframe(
                [1.0, 0, 0],
                [0, 1.0, 0],
                [0, 0, 1.0]
            );
        }

        if (info.family === "tetragonal") {
            return buildParallelepipedWireframe(
                scaleVec(basis.u, 0.92),
                scaleVec(basis.v, 0.92),
                scaleVec(axis, 1.18)
            );
        }

        if (info.family === "hexagonal") {
            const a = scaleVec(basis.u, 0.9);
            const b = addVec(scaleVec(basis.u, -0.45), scaleVec(basis.v, 0.9 * Math.sqrt(3) * 0.5));
            const c = scaleVec(axis, 1.16);
            return buildParallelepipedWireframe(a, b, c);
        }

        if (info.family === "trigonal") {
            const a = scaleVec(basis.u, 0.9);
            const b = addVec(scaleVec(basis.u, -0.45), scaleVec(basis.v, 0.9 * Math.sqrt(3) * 0.5));
            const c = scaleVec(axis, 1.12);
            return buildParallelepipedWireframe(a, b, c);
        }

        if (info.family === "orthorhombic") {
            return buildParallelepipedWireframe(
                [1.05, 0, 0],
                [0, 0.82, 0],
                [0, 0, 1.24]
            );
        }

        if (info.family === "monoclinic") {
            return buildParallelepipedWireframe(
                [1.0, 0, 0],
                [0, 0.9, 0],
                [0.32, 0, 1.18]
            );
        }

        return buildParallelepipedWireframe(
            [1.0, 0, 0],
            [0.34, 0.86, 0],
            [0.26, 0.2, 1.08]
        );
    }

    function getCellBasis(frame) {
        const info = frame || { family: "triclinic", axis: [0, 0, 1] };
        const axis = normalize(info.axis || [0, 0, 1]);
        const basis = choosePlaneBasis(axis);

        if (info.family === "tetragonal") {
            return {
                a: scaleVec(basis.u, 0.92),
                b: scaleVec(basis.v, 0.92),
                c: scaleVec(axis, 1.18)
            };
        }
        if (info.family === "hexagonal") {
            return {
                a: scaleVec(basis.u, 0.9),
                b: addVec(scaleVec(basis.u, -0.45), scaleVec(basis.v, 0.9 * Math.sqrt(3) * 0.5)),
                c: scaleVec(axis, 1.16)
            };
        }
        if (info.family === "trigonal") {
            return {
                a: scaleVec(basis.u, 0.9),
                b: addVec(scaleVec(basis.u, -0.45), scaleVec(basis.v, 0.9 * Math.sqrt(3) * 0.5)),
                c: scaleVec(axis, 1.12)
            };
        }
        if (info.family === "orthorhombic") {
            return { a: [1.05, 0, 0], b: [0, 0.82, 0], c: [0, 0, 1.24] };
        }
        if (info.family === "monoclinic") {
            return { a: [1.0, 0, 0], b: [0, 0.9, 0], c: [0.32, 0, 1.18] };
        }
        if (info.family === "cubic") {
            return { a: [1.0, 0, 0], b: [0, 1.0, 0], c: [0, 0, 1.0] };
        }
        return { a: [1.0, 0, 0], b: [0.34, 0.86, 0], c: [0.26, 0.2, 1.08] };
    }

    function basisOffset(shift, cellBasis) {
        const s = Array.isArray(shift) ? shift : [0, 0, 0];
        const b = cellBasis || { a: [1, 0, 0], b: [0, 1, 0], c: [0, 0, 1] };
        return addVec(
            addVec(scaleVec(b.a, s[0]), scaleVec(b.b, s[1])),
            scaleVec(b.c, s[2])
        );
    }

    function wrap01(v) {
        let x = v - Math.floor(v);
        if (Math.abs(x) < 1e-9 || Math.abs(x - 1) < 1e-9) {
            x = 0;
        }
        return x;
    }

    function scenePointToCellFraction(p, cellBasis) {
        const b = cellBasis || { a: [1, 0, 0], b: [0, 1, 0], c: [0, 0, 1] };
        const center = scaleVec(addVec(addVec(b.a, b.b), b.c), 0.5);
        const q = addVec(p, center);

        const crossBC = cross(b.b, b.c);
        const crossCA = cross(b.c, b.a);
        const crossAB = cross(b.a, b.b);
        const det = dot(b.a, crossBC);
        if (Math.abs(det) < 1e-10) {
            return null;
        }

        return [
            dot(q, crossBC) / det,
            dot(q, crossCA) / det,
            dot(q, crossAB) / det
        ];
    }

    function cellFractionToScenePoint(frac, cellBasis) {
        const b = cellBasis || { a: [1, 0, 0], b: [0, 1, 0], c: [0, 0, 1] };
        const center = scaleVec(addVec(addVec(b.a, b.b), b.c), 0.5);
        const p = addVec(
            addVec(scaleVec(b.a, frac[0]), scaleVec(b.b, frac[1])),
            scaleVec(b.c, frac[2])
        );
        return subVec(p, center);
    }

    function canonicalizePointsToReferenceCell(points, cellBasis) {
        const input = Array.isArray(points) ? points : [];
        if (input.length === 0) {
            return [];
        }

        const out = [];
        const seen = new Set();
        for (const p of input) {
            const frac = scenePointToCellFraction(p, cellBasis);
            if (!frac) {
                continue;
            }
            const wrapped = [wrap01(frac[0]), wrap01(frac[1]), wrap01(frac[2])];
            const key = `${wrapped[0].toFixed(7)},${wrapped[1].toFixed(7)},${wrapped[2].toFixed(7)}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            out.push(cellFractionToScenePoint(wrapped, cellBasis));
        }
        return out;
    }

    function displayCellShifts5() {
        return [
            [0, 0, 0],
            [1, 0, 0],
            [-1, 0, 0],
            [0, 1, 0],
            [0, -1, 0]
        ];
    }

    function isReferenceShift(shift) {
        const s = Array.isArray(shift) ? shift : [0, 0, 0];
        return Math.abs(s[0]) < 1e-9 && Math.abs(s[1]) < 1e-9 && Math.abs(s[2]) < 1e-9;
    }

    function drawUnitCell() {
        if (!state.useSpaceGroup) {
            return;
        }

        const frame = selectUnitCellFrame();
        const wire = buildUnitCellWireframe(frame);
        const basis = getCellBasis(frame);
        const shifts = displayCellShifts5();
        const lightTheme = isLightTheme();
        const lineRgb = lightTheme ? "17, 24, 39" : "214, 232, 250";
        const mainAlpha = lightTheme ? 0.72 : 0.95;
        const neighborBaseAlpha = lightTheme ? 0.35 : 0.62;

        ctx.save();
        ctx.lineWidth = lightTheme ? 1.1 : 1.35;
        ctx.setLineDash([4, 3]);

        for (const shift of shifts) {
            const offset = basisOffset(shift, basis);
            const alpha = isReferenceShift(shift)
                ? mainAlpha
                : neighborBaseAlpha * state.neighborSymOpacity;
            ctx.strokeStyle = `rgba(${lineRgb}, ${clamp(alpha, 0, 1).toFixed(3)})`;

            for (const edge of wire.edges) {
                const pa = addVec(wire.corners[edge[0]], offset);
                const pb = addVec(wire.corners[edge[1]], offset);
                const a = projectPoint(pa);
                const b = projectPoint(pb);
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    function seedRingsForDisplay() {
        if (!state.useSpaceGroup) {
            return [{ point: state.seed, isNeighbor: false }];
        }

        const frame = selectUnitCellFrame();
        const basis = getCellBasis(frame);
        const shifts = displayCellShifts5();
        const out = [];
        for (const s of shifts) {
            out.push({
                point: cellFractionToScenePoint([
                    state.seedFrac[0] + s[0],
                    state.seedFrac[1] + s[1],
                    state.seedFrac[2] + s[2]
                ], basis),
                isNeighbor: !isReferenceShift(s)
            });
        }
        return out;
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
        const frame = selectUnitCellFrame();
        const basis = getCellBasis(frame);
        const hullShifts = state.useSpaceGroup ? displayCellShifts5() : [[0, 0, 0]];
        const hullPoints = Array.isArray(state.hullPoints) ? state.hullPoints : state.points;

        const hull = state.hull;
        if (hull.kind === "coplanar") {
            for (const shift of hullShifts) {
                const offset = basisOffset(shift, basis);
                const cellOpacity = isReferenceShift(shift) ? 1 : state.neighborSymOpacity;
                const poly = hull.polygon.map((p) => projectPoint(addVec(p, offset)));
                if (poly.length < 3) {
                    continue;
                }

                ctx.beginPath();
                ctx.moveTo(poly[0].x, poly[0].y);
                for (let i = 1; i < poly.length; i += 1) {
                    ctx.lineTo(poly[i].x, poly[i].y);
                }
                ctx.closePath();
                ctx.fillStyle = rgbaWithAlpha(HULL_COLORS.coplanarFill, (lightTheme ? 0.11 : 0.14) * surfaceOpacity * cellOpacity);
                ctx.fill();
                ctx.strokeStyle = lightTheme
                    ? rgbaWithAlpha(HULL_COLORS.coplanarStroke, 0.42 * surfaceOpacity * cellOpacity)
                    : `rgba(214, 239, 255, ${edgeHighlightAlpha * surfaceOpacity * cellOpacity})`;
                ctx.lineWidth = 2.05 * edgeBoost;
                ctx.stroke();
                ctx.strokeStyle = lightTheme
                    ? rgbaWithAlpha(HULL_COLORS.coplanarStroke, 0.58 * surfaceOpacity * cellOpacity)
                    : "rgba(220, 238, 255, " + (0.82 * surfaceOpacity * cellOpacity) + ")";
                ctx.lineWidth = 1.2 * edgeBoost;
                ctx.stroke();
            }
            return;
        }

        if (hull.kind !== "poly3d") {
            return;
        }

        const faces = [];
        for (const shift of hullShifts) {
            const offset = basisOffset(shift, basis);
            const cellOpacity = isReferenceShift(shift) ? 1 : state.neighborSymOpacity;
            for (const face of hull.planes) {
                if (!face.ring || face.ring.length < 3) {
                    continue;
                }
                const projected = face.ring.map((idx) => projectPoint(addVec(hullPoints[idx], offset)));
                const depth = projected.reduce((sum, p) => sum + p.z, 0) / projected.length;
                faces.push({ projected, depth, cellOpacity });
            }
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
            const alphaScale = surfaceOpacity * (face.cellOpacity || 1);
            ctx.fillStyle = depthMix > 0.5
                ? rgbaWithAlpha(HULL_COLORS.fillDark, (lightTheme ? 0.14 : 0.18) * alphaScale)
                : rgbaWithAlpha(HULL_COLORS.fill, (lightTheme ? 0.12 : 0.16) * alphaScale);
            ctx.fill();
            ctx.strokeStyle = lightTheme
                ? rgbaWithAlpha(HULL_COLORS.strokeDark, 0.24 * alphaScale)
                : `rgba(214, 239, 255, ${edgeHighlightAlpha * alphaScale})`;
            ctx.lineWidth = 1.85 * strokeBoost;
            ctx.stroke();
            ctx.strokeStyle = depthMix > 0.5
                ? (lightTheme
                    ? rgbaWithAlpha(HULL_COLORS.strokeDark, 0.36 * alphaScale)
                    : "rgba(191, 219, 254, " + (0.9 * alphaScale) + ")")
                : (lightTheme
                    ? rgbaWithAlpha(HULL_COLORS.stroke, 0.42 * alphaScale)
                    : "rgba(125, 211, 252, " + (0.9 * alphaScale) + ")");
            ctx.lineWidth = 0.9 * strokeBoost;
            ctx.stroke();
        }
    }

    function drawPoints() {
        const pointItems = [];
        if (state.useSpaceGroup) {
            const frame = selectUnitCellFrame();
            const basis = getCellBasis(frame);
            const shifts = displayCellShifts5();
            const baseFrac = canonicalizeOrbitFractions(state.sgOrbitFrac);
            for (const frac of baseFrac) {
                for (const s of shifts) {
                    pointItems.push({
                        p: cellFractionToScenePoint([
                            frac[0] + s[0],
                            frac[1] + s[1],
                            frac[2] + s[2]
                        ], basis),
                        isNeighbor: !isReferenceShift(s)
                    });
                }
            }
        } else {
            for (const p of Array.isArray(state.points) ? state.points : []) {
                pointItems.push({ p, isNeighbor: false });
            }
        }

        const projected = pointItems.map((item) => ({ p: item.p, isNeighbor: item.isNeighbor, pr: projectPoint(item.p) }));
        projected.sort((a, b) => a.pr.z - b.pr.z);
        const hullOccluders = [];

        const o = projectPoint([0, 0, 0]);

        for (const item of projected) {
            if (pointHiddenByHull(item, hullOccluders)) {
                continue;
            }

            ctx.save();
            ctx.globalAlpha = item.isNeighbor ? state.neighborSymOpacity : 1;
            const radius = clamp(2.8 + item.pr.scale * 0.011, 2.8, 8.5);
            ctx.beginPath();
            ctx.arc(item.pr.x, item.pr.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = item.p[2] >= 0 ? "#3b82f6" : "#14b8a6";
            ctx.fill();

            ctx.strokeStyle = cssVar("--point-stroke", "rgba(20, 27, 35, 0.35)");
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.restore();
        }

        const seedProjected = seedRingsForDisplay().map((item) => ({
            pr: projectPoint(item.point),
            isNeighbor: item.isNeighbor
        }));
        for (let i = 0; i < seedProjected.length; i += 1) {
            const seedPr = seedProjected[i].pr;
            const isNeighbor = seedProjected[i].isNeighbor;
            ctx.beginPath();
            ctx.arc(seedPr.x, seedPr.y, clamp(5 + seedPr.scale * 0.009, 5, 10), 0, Math.PI * 2);
            ctx.strokeStyle = cssVar("--seed-ring", "#38bdf8");
            ctx.lineWidth = isNeighbor ? 1.25 : 2;
            ctx.globalAlpha = isNeighbor ? state.neighborSymOpacity : 1;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        ctx.beginPath();
        ctx.arc(o.x, o.y, 3.3, 0, Math.PI * 2);
        ctx.fillStyle = cssVar("--origin-dot", "#202a36");
        ctx.fill();
    }

    function render() {
        ctx.clearRect(0, 0, state.width, state.height);
        drawBackground();
        drawAxes();
        drawUnitCell();
        drawPoints();
        drawConvexHullSurface();
        drawSymmetryElements();
        drawThreeViews();
    }

    function resizeOrthoCanvases() {
        const dpr = window.devicePixelRatio || 1;
        for (const view of orthoViews) {
            if (!view.canvas || !view.ctx) {
                continue;
            }
            const rect = view.canvas.getBoundingClientRect();
            const width = Math.max(72, Math.round(rect.width));
            const height = Math.max(72, Math.round(rect.height));
            view.canvas.width = Math.round(width * dpr);
            view.canvas.height = Math.round(height * dpr);
            view.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
    }

    function resizeCanvas() {
        const rect = dom.canvas.getBoundingClientRect();
        state.width = Math.max(300, Math.round(rect.width));
        state.height = Math.max(300, Math.round(rect.height));

        const dpr = window.devicePixelRatio || 1;
        dom.canvas.width = Math.round(state.width * dpr);
        dom.canvas.height = Math.round(state.height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        resizeOrthoCanvases();
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
            dom.zShift, dom.yShift, dom.xShift,
            dom.glideType, dom.glideNormal,
            dom.mz, dom.my, dom.mx, dom.inv,
            dom.showAxes, dom.showSymmetry
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

        if (dom.neighborSymOpacity) {
            const onNeighborSymOpacityChange = function () {
                syncNeighborSymOpacity();
                render();
            };
            dom.neighborSymOpacity.addEventListener("input", onNeighborSymOpacityChange);
            dom.neighborSymOpacity.addEventListener("change", onNeighborSymOpacityChange);
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

            state.view.yaw = wrapAngle(state.view.yaw + dx * VIEW_CONFIG.dragSensitivity);
            state.view.pitch = wrapAngle(state.view.pitch + dy * VIEW_CONFIG.dragSensitivity);
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
            state.view.yaw = wrapAngle(state.view.yaw + dx * VIEW_CONFIG.touchSensitivity);
            state.view.pitch = wrapAngle(state.view.pitch + dy * VIEW_CONFIG.touchSensitivity);
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
            state.view.yaw = wrapAngle(state.view.yaw + VIEW_CONFIG.autoSpinStep);
            render();
        }
        requestAnimationFrame(animate);
    }

    function init() {
        initTheme();
        bindEvents();
        syncHullOpacity();
        syncNeighborSymOpacity();
        syncViewerFullscreenButton(false);
        resizeCanvas();
        recalculate();
        animate();
    }

    init();
})();
