export interface ProcessingOptions {
    threshold: number;   // 0-1: taglio dello sfondo
    gamma: number;       // 0.1-3.0: curva di risposta
    contrast: number;    // -1..1: S-curve (positive = rilievo più deciso)
    detail: number;      // 0-2: unsharp mask sulla profondità
    smoothing: number;   // 0-50: raggio sfocatura gaussiana approssimata (px)
    edgeFade: number;    // 0-1: attenuazione radiale (effetto "busto" / medaglione)
    invert: boolean;     // inverte vicino/lontano
}

export const DEFAULT_OPTIONS: ProcessingOptions = {
    threshold: 0.08,
    gamma: 1.0,
    contrast: 0.25,
    detail: 0.5,
    smoothing: 2,
    edgeFade: 0.25,
    invert: false,
};

/** Percentili robusti: evita che pochi outlier schiacci la dinamica. */
function percentiles(data: Float32Array, lo = 0.02, hi = 0.98): { min: number; max: number } {
    // Campionamento per velocità su immagini grandi
    const step = Math.max(1, Math.floor(data.length / 65536));
    const sample: number[] = [];
    for (let i = 0; i < data.length; i += step) sample.push(data[i]);
    sample.sort((a, b) => a - b);
    return {
        min: sample[Math.floor(lo * (sample.length - 1))],
        max: sample[Math.floor(hi * (sample.length - 1))],
    };
}

/** Blur box separabile; più passate = approssimazione gaussiana migliore. */
function boxBlur(src: Float32Array, w: number, h: number, radius: number, passes: number): Float32Array {
    if (radius < 1) return src.slice();
    let data = src.slice();
    const tmp = new Float32Array(data.length);

    for (let p = 0; p < passes; p++) {
        // orizzontale
        for (let y = 0; y < h; y++) {
            const row = y * w;
            let acc = 0;
            for (let x = -radius; x <= radius; x++) acc += data[row + Math.min(w - 1, Math.max(0, x))];
            const n = 2 * radius + 1;
            for (let x = 0; x < w; x++) {
                tmp[row + x] = acc / n;
                const xAdd = Math.min(w - 1, x + radius + 1);
                const xSub = Math.max(0, x - radius);
                acc += data[row + xAdd] - data[row + xSub];
            }
        }
        // verticale
        for (let x = 0; x < w; x++) {
            let acc = 0;
            for (let y = -radius; y <= radius; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
            const n = 2 * radius + 1;
            for (let y = 0; y < h; y++) {
                data[y * w + x] = acc / n;
                const yAdd = Math.min(h - 1, y + radius + 1);
                const ySub = Math.max(0, y - radius);
                acc += tmp[yAdd * w + x] - tmp[ySub * w + x];
            }
        }
    }
    return data;
}

export class PostProcessor {
    /**
     * Pipeline di post-processing completa, in dominio float 0..1.
     * Restituisce una NUOVA Float32Array; non modifica l'input.
     */
    static process(data: Float32Array, width: number, height: number, options: ProcessingOptions): Float32Array {
        const { threshold, gamma, contrast, detail, smoothing, edgeFade, invert } = options;
        const n = data.length;

        // 1. Normalizzazione robusta con percentili + inversione
        let { min, max } = percentiles(data);
        if (invert) [min, max] = [max, min];
        const range = Math.abs(max - min) || 1e-6;
        const norm = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            let v = (data[i] - min) / range;
            if (invert) v = 1 - v;
            norm[i] = v < 0 ? 0 : v > 1 ? 1 : v;
        }

        // 2. Soglia sfondo + riscala
        const t = threshold;
        for (let i = 0; i < n; i++) {
            const v = norm[i];
            norm[i] = v <= t ? 0 : (v - t) / (1 - t);
        }

        // 3. Smoothing (prima della curva: stabilizza, poi il dettaglio riaffila)
        let work = norm;
        if (smoothing > 0.5) {
            const radius = Math.max(1, Math.round(smoothing));
            work = boxBlur(norm, width, height, radius, 3);
        }

        // 4. Gamma
        if (Math.abs(gamma - 1) > 1e-3) {
            const lut = new Float32Array(1025);
            for (let i = 0; i <= 1024; i++) lut[i] = Math.pow(i / 1024, gamma);
            for (let i = 0; i < n; i++) work[i] = lut[Math.round(work[i] * 1024)];
        }

        // 5. Contrasto (S-curve smoothstep attorno a 0.5)
        if (Math.abs(contrast) > 1e-3) {
            const c = Math.max(-0.99, Math.min(0.99, contrast));
            for (let i = 0; i < n; i++) {
                const v = work[i];
                const s = v * v * (3 - 2 * v); // smoothstep
                work[i] = v + c * (s - v);
            }
        }

        // 6. Dettaglio (unsharp mask)
        if (detail > 0.01) {
            const blurred = boxBlur(work, width, height, 2, 2);
            for (let i = 0; i < n; i++) {
                const v = work[i] + detail * (work[i] - blurred[i]);
                work[i] = v < 0 ? 0 : v > 1 ? 1 : v;
            }
        }

        // 7. Fade radiale (effetto medaglione/busto)
        if (edgeFade > 0.001) {
            const cx = width / 2;
            const cy = height / 2;
            const maxDist = Math.sqrt(cx * cx + cy * cy);
            const fadeStart = 1 - edgeFade;
            for (let y = 0; y < height; y++) {
                const dy = y - cy;
                for (let x = 0; x < width; x++) {
                    const i = y * width + x;
                    if (work[i] === 0) continue;
                    const dNorm = Math.sqrt((x - cx) * (x - cx) + dy * dy) / maxDist;
                    if (dNorm > fadeStart) {
                        const f = 1 - (dNorm - fadeStart) / edgeFade;
                        const sf = f * f * (3 - 2 * f);
                        work[i] *= sf;
                    }
                }
            }
        }

        // Ricampiona i valori finali in 0..1 pulito
        for (let i = 0; i < n; i++) {
            const v = work[i];
            work[i] = v < 0 ? 0 : v > 1 ? 1 : v;
        }
        return work;
    }

    /** Converte in immagine grayscale 8-bit su canvas (per preview/anteprima). */
    static toCanvas(depthData: Float32Array, width: number, height: number, canvas: HTMLCanvasElement) {
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const imgData = ctx.createImageData(width, height);
        const px = imgData.data;
        for (let i = 0; i < depthData.length; i++) {
            const v = (depthData[i] * 255) | 0;
            px[i * 4] = v;
            px[i * 4 + 1] = v;
            px[i * 4 + 2] = v;
            px[i * 4 + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
    }
}
