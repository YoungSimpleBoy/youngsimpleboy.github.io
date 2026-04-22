(function (global) {
    "use strict";

    // Public API on window.PointGroupGraphicalSymbols:
    // 1) drawAxisSymbol(ctx, { x, y, mode, order, radius, strict, rotation, palette })
    // 2) drawInversionCenter(ctx, { x, y, radius, fill, stroke, dot })
    // 3) drawMirrorGreatCircle(ctx, {
    //      normal, hAxis, vAxis, depthAxis, mapToCanvas,
    //      strict, planar, lineWidth, steps, palette
    //    })

    function normalize(v) {
        const n = Math.hypot(v[0], v[1], v[2]);
        if (n === 0) {
            return [0, 0, 1];
        }
        return [v[0] / n, v[1] / n, v[2] / n];
    }

    function cross(a, b) {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]
        ];
    }

    function choosePlaneBasis(normal) {
        const n = normalize(normal);
        const helper = Math.abs(n[2]) < 0.85 ? [0, 0, 1] : [0, 1, 0];
        let u = cross(n, helper);
        if (Math.hypot(u[0], u[1], u[2]) < 1e-8) {
            u = cross(n, [1, 0, 0]);
        }
        u = normalize(u);
        const v = normalize(cross(n, u));
        return { u, v };
    }

    function drawPolygon(ctx, x, y, sides, radius, rotation) {
        if (sides < 3) {
            return;
        }
        ctx.beginPath();
        for (let i = 0; i < sides; i += 1) {
            const t = rotation + (2 * Math.PI * i) / sides;
            const px = x + radius * Math.cos(t);
            const py = y + radius * Math.sin(t);
            if (i === 0) {
                ctx.moveTo(px, py);
            } else {
                ctx.lineTo(px, py);
            }
        }
        ctx.closePath();
    }

    function polygonVertices(x, y, sides, radius, rotation) {
        const vertices = [];
        for (let i = 0; i < sides; i += 1) {
            const t = rotation + (2 * Math.PI * i) / sides;
            vertices.push({ x: x + radius * Math.cos(t), y: y + radius * Math.sin(t) });
        }
        return vertices;
    }

    function pathVertices(ctx, vertices) {
        if (!vertices || vertices.length === 0) {
            return;
        }
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i += 1) {
            ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.closePath();
    }

    function drawAxisSymbol(ctx, options) {
        const opts = options || {};
        const mode = opts.mode || "rot";
        const order = Math.max(2, Math.round(Number(opts.order) || 2));
        const x = Number(opts.x) || 0;
        const y = Number(opts.y) || 0;
        const r = Math.max(1.2, Number(opts.radius) || 5.8);
        const strict = opts.strict !== false;
        const rotation = typeof opts.rotation === "number" ? opts.rotation : -Math.PI / 2;
        const palette = opts.palette || {};

        const stroke = palette.stroke || "rgba(17, 24, 39, 0.9)";
        const fillSolid = palette.fillSolid || "#111111";
        const fillOpen = palette.fillOpen || "#ffffff";
        const textSolid = palette.textSolid || "#f8f8f8";
        const textOpen = palette.textOpen || "#111827";
        const fontFamily = opts.fontFamily || "Cambria, \"Times New Roman\", serif";

        if (strict && mode === "rot" && order === 2) {
            ctx.beginPath();
            ctx.ellipse(x, y, r * 0.52, r * 0.92, 0, 0, Math.PI * 2);
            ctx.fillStyle = fillSolid;
            ctx.fill();
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1.02;
            ctx.stroke();
            return;
        }

        if (strict && mode === "rot" && (order === 3 || order === 4 || order === 6)) {
            drawPolygon(ctx, x, y, order, r * 0.9, rotation);
            ctx.fillStyle = fillSolid;
            ctx.fill();
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1.02;
            ctx.stroke();
            return;
        }

        if (strict && mode === "roto" && order >= 3) {
            if (order % 2 === 1) {
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fillStyle = fillSolid;
                ctx.fill();
                ctx.strokeStyle = stroke;
                ctx.lineWidth = 1.04;
                ctx.stroke();

                drawPolygon(ctx, x, y, order, r * 0.56, rotation);
                ctx.fillStyle = fillOpen;
                ctx.fill();
                ctx.strokeStyle = stroke;
                ctx.lineWidth = 0.94;
                ctx.stroke();
            } else {
                const vertices = polygonVertices(x, y, order, r * 0.9, rotation);
                pathVertices(ctx, vertices);
                ctx.fillStyle = fillOpen;
                ctx.fill();
                ctx.strokeStyle = stroke;
                ctx.lineWidth = 1.05;
                ctx.stroke();

                ctx.beginPath();
                for (let i = 0; i < vertices.length; i += 2) {
                    ctx.moveTo(x, y);
                    ctx.lineTo(vertices[i].x, vertices[i].y);
                }
                ctx.strokeStyle = stroke;
                ctx.lineWidth = 0.98;
                ctx.stroke();
            }
            return;
        }

        const text = mode === "roto" && order === 2 ? "m" : String(order);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = mode === "roto" ? fillOpen : fillSolid;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.02;
        ctx.stroke();

        ctx.fillStyle = mode === "roto" ? textOpen : textSolid;
        ctx.font = `700 ${Math.max(8.3, r * 1.3)}px ${fontFamily}`;
        const tm = ctx.measureText(text);
        ctx.fillText(text, x - tm.width / 2, y + r * 0.35);

        if (mode === "roto" && order > 2) {
            const barY = y - r * 0.7;
            ctx.beginPath();
            ctx.moveTo(x - tm.width * 0.58, barY);
            ctx.lineTo(x + tm.width * 0.58, barY);
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 0.92;
            ctx.stroke();
        }
    }

    function drawInversionCenter(ctx, options) {
        const opts = options || {};
        const x = Number(opts.x) || 0;
        const y = Number(opts.y) || 0;
        const radius = Math.max(1.2, Number(opts.radius) || 6);
        const fill = opts.fill || "#ffffff";
        const stroke = opts.stroke || "#1f2937";
        const dot = opts.dot || stroke;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, radius * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = dot;
        ctx.fill();
    }

    function drawMirrorGreatCircle(ctx, options) {
        const opts = options || {};
        if (!opts.normal || typeof opts.mapToCanvas !== "function") {
            return;
        }

        const hAxis = Number.isInteger(opts.hAxis) ? opts.hAxis : 0;
        const vAxis = Number.isInteger(opts.vAxis) ? opts.vAxis : 1;
        const depthAxis = Number.isInteger(opts.depthAxis) ? opts.depthAxis : 2;
        const strict = opts.strict !== false;
        const steps = Math.max(24, Number(opts.steps) || 220);
        const palette = opts.palette || {};
        const lineFront = palette.lineFront || "rgba(17, 24, 39, 0.9)";
        const lineBack = palette.lineBack || lineFront;
        const lineWidth = Number(opts.lineWidth) || 1.02;
        const planar = opts.planar !== false;

        const basis = choosePlaneBasis(opts.normal);
        if (planar) {
            ctx.save();
            ctx.strokeStyle = lineFront;
            ctx.lineWidth = lineWidth;
            ctx.setLineDash([]);
            ctx.beginPath();
            for (let i = 0; i <= steps; i += 1) {
                const t = (2 * Math.PI * i) / steps;
                const p = [
                    basis.u[0] * Math.cos(t) + basis.v[0] * Math.sin(t),
                    basis.u[1] * Math.cos(t) + basis.v[1] * Math.sin(t),
                    basis.u[2] * Math.cos(t) + basis.v[2] * Math.sin(t)
                ];
                const pr = opts.mapToCanvas(p[hAxis], p[vAxis]);
                if (i === 0) {
                    ctx.moveTo(pr.x, pr.y);
                } else {
                    ctx.lineTo(pr.x, pr.y);
                }
            }
            ctx.stroke();
            ctx.restore();
            return;
        }

        let prev = null;
        for (let i = 0; i <= steps; i += 1) {
            const t = (2 * Math.PI * i) / steps;
            const p = [
                basis.u[0] * Math.cos(t) + basis.v[0] * Math.sin(t),
                basis.u[1] * Math.cos(t) + basis.v[1] * Math.sin(t),
                basis.u[2] * Math.cos(t) + basis.v[2] * Math.sin(t)
            ];
            const cur = {
                x: p[hAxis],
                y: p[vAxis],
                w: p[depthAxis]
            };

            if (prev) {
                const pa = opts.mapToCanvas(prev.x, prev.y);
                const pb = opts.mapToCanvas(cur.x, cur.y);
                const front = prev.w >= 0 && cur.w >= 0;
                const back = prev.w < 0 && cur.w < 0;
                if (front || back) {
                    ctx.save();
                    ctx.strokeStyle = front ? lineFront : lineBack;
                    ctx.lineWidth = lineWidth;
                    if (strict && back) {
                        ctx.setLineDash([4, 4]);
                    } else {
                        ctx.setLineDash([]);
                    }
                    ctx.beginPath();
                    ctx.moveTo(pa.x, pa.y);
                    ctx.lineTo(pb.x, pb.y);
                    ctx.stroke();
                    ctx.restore();
                }
            }
            prev = cur;
        }
    }

    global.PointGroupGraphicalSymbols = {
        drawAxisSymbol,
        drawInversionCenter,
        drawMirrorGreatCircle
    };
})(window);
