(function (global) {
    "use strict";

    const EPS = 1e-10;

    function clampNearZero(v) {
        return Math.abs(v) < EPS ? 0 : v;
    }

    function wrapFraction(v) {
        let x = v - Math.floor(v);
        if (Math.abs(x - 1) < EPS || Math.abs(x) < EPS) {
            x = 0;
        }
        return x;
    }

    function wrapVector(v) {
        return [wrapFraction(v[0]), wrapFraction(v[1]), wrapFraction(v[2])];
    }

    function roundKey(v) {
        return clampNearZero(v).toFixed(8);
    }

    function identityMatrix3() {
        return [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1]
        ];
    }

    function cloneMatrix3(m) {
        return [
            [m[0][0], m[0][1], m[0][2]],
            [m[1][0], m[1][1], m[1][2]],
            [m[2][0], m[2][1], m[2][2]]
        ];
    }

    function matMul3(a, b) {
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

    function matVec3(m, v) {
        return [
            m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
            m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
            m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
        ];
    }

    function vecAdd(a, b) {
        return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    }

    function parseFraction(token) {
        const s = String(token).trim();
        if (!s) {
            return 0;
        }
        if (s.includes("/")) {
            const parts = s.split("/");
            if (parts.length !== 2) {
                throw new Error(`Invalid fraction: ${token}`);
            }
            const numerator = Number(parts[0]);
            const denominator = Number(parts[1]);
            if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
                throw new Error(`Invalid fraction: ${token}`);
            }
            return numerator / denominator;
        }

        const value = Number(s);
        if (!Number.isFinite(value)) {
            throw new Error(`Invalid number: ${token}`);
        }
        return value;
    }

    function parseCoordinateExpression(expr) {
        const normalized = String(expr).replace(/\s+/g, "");
        if (!normalized) {
            throw new Error("Empty coordinate expression");
        }

        const expanded = normalized
            .replace(/-/g, "+-")
            .replace(/^\+/, "");

        const terms = expanded.split("+").filter(Boolean);
        const coeff = [0, 0, 0];
        let offset = 0;

        for (const term of terms) {
            if (/[xyz]/.test(term)) {
                const m = term.match(/^([+-]?)([xyz])$/);
                if (!m) {
                    throw new Error(`Unsupported term in expression: ${term}`);
                }
                const sign = m[1] === "-" ? -1 : 1;
                const axis = m[2] === "x" ? 0 : (m[2] === "y" ? 1 : 2);
                coeff[axis] += sign;
            } else {
                offset += parseFraction(term);
            }
        }

        return { coeff, offset };
    }

    function normalizeOperation(op) {
        const R = cloneMatrix3(op.R || identityMatrix3());
        const t = wrapVector(op.t || [0, 0, 0]);
        return {
            R,
            t,
            label: op.label || ""
        };
    }

    function identityOperation() {
        return {
            R: identityMatrix3(),
            t: [0, 0, 0],
            label: "E"
        };
    }

    function operationFromXYZTriplet(triplet, label) {
        const parts = Array.isArray(triplet)
            ? triplet
            : String(triplet).split(",").map((s) => s.trim());

        if (parts.length !== 3) {
            throw new Error(`Operation must have 3 coordinates: ${triplet}`);
        }

        const parsed = parts.map(parseCoordinateExpression);
        const R = [
            [parsed[0].coeff[0], parsed[0].coeff[1], parsed[0].coeff[2]],
            [parsed[1].coeff[0], parsed[1].coeff[1], parsed[1].coeff[2]],
            [parsed[2].coeff[0], parsed[2].coeff[1], parsed[2].coeff[2]]
        ];
        const t = [parsed[0].offset, parsed[1].offset, parsed[2].offset];

        return normalizeOperation({
            R,
            t,
            label: label || (Array.isArray(triplet) ? parts.join(",") : String(triplet))
        });
    }

    function operationsFromXYZList(list) {
        return (list || []).map((item, index) => operationFromXYZTriplet(item, `op${index + 1}`));
    }

    function composeOperations(a, b, label) {
        // Composition convention: first apply b, then apply a.
        const R = matMul3(a.R, b.R);
        const t = wrapVector(vecAdd(matVec3(a.R, b.t), a.t));
        return normalizeOperation({ R, t, label: label || "" });
    }

    function applyOperation(op, point) {
        const p = [Number(point[0]) || 0, Number(point[1]) || 0, Number(point[2]) || 0];
        return wrapVector(vecAdd(matVec3(op.R, p), op.t));
    }

    function operationKey(op) {
        const flat = op.R[0].concat(op.R[1], op.R[2]).concat(op.t.map(wrapFraction));
        return flat.map(roundKey).join(",");
    }

    function pointKey(point) {
        const p = wrapVector(point);
        return p.map(roundKey).join(",");
    }

    function generateClosure(generators, options) {
        const maxOps = options && Number.isFinite(options.maxOps) ? Math.max(1, Math.round(options.maxOps)) : 512;
        const ops = [identityOperation()];
        const seen = new Set([operationKey(ops[0])]);
        const gens = (generators || []).map(normalizeOperation);
        let truncated = false;

        for (let i = 0; i < ops.length; i += 1) {
            for (const g of gens) {
                const next = composeOperations(ops[i], g);
                const key = operationKey(next);
                if (!seen.has(key)) {
                    seen.add(key);
                    ops.push(next);
                    if (ops.length >= maxOps) {
                        truncated = true;
                        return { operations: ops, truncated };
                    }
                }
            }
        }

        return { operations: ops, truncated };
    }

    function orbit(point, operations) {
        const out = [];
        const seen = new Set();
        for (const op of operations || []) {
            const p = applyOperation(op, point);
            const key = pointKey(p);
            if (!seen.has(key)) {
                seen.add(key);
                out.push(p);
            }
        }
        return out;
    }

    global.SpaceGroupCore = {
        EPS,
        wrapFraction,
        wrapVector,
        identityOperation,
        operationFromXYZTriplet,
        operationsFromXYZList,
        composeOperations,
        applyOperation,
        generateClosure,
        orbit,
        operationKey,
        pointKey
    };
})(window);
