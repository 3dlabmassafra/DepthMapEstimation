/** Esportazioni: PNG 8-bit, PNG 16-bit grayscale, STL binario. */

function resampleBilinear(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Float32Array {
    const dst = new Float32Array(dw * dh);
    const xR = sw / dw, yR = sh / dh;
    for (let y = 0; y < dh; y++) {
        const fy = (y + 0.5) * yR - 0.5;
        const y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(sh - 1, y0 + 1);
        const wy = fy - y0;
        for (let x = 0; x < dw; x++) {
            const fx = (x + 0.5) * xR - 0.5;
            const x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(sw - 1, x0 + 1);
            const wx = fx - x0;
            dst[y * dw + x] =
                src[y0 * sw + x0] * (1 - wx) * (1 - wy) + src[y0 * sw + x1] * wx * (1 - wy) +
                src[y1 * sw + x0] * (1 - wx) * wy + src[y1 * sw + x1] * wx * wy;
        }
    }
    return dst;
}

/** Adatta la depth map (0..1) alla risoluzione di export richiesta. */
export function prepareForExport(
    data: Float32Array, w: number, h: number, maxSide: number
): { data: Float32Array; width: number; height: number } {
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const nw = Math.max(2, Math.round(w * scale));
    const nh = Math.max(2, Math.round(h * scale));
    if (nw === w && nh === h) return { data, width: w, height: h };
    return { data: resampleBilinear(data, w, h, nw, nh), width: nw, height: nh };
}

export function depthToCanvas(data: Float32Array, w: number, h: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    const px = img.data;
    for (let i = 0; i < data.length; i++) {
        const v = Math.round(data[i] * 255);
        px[i * 4] = v; px[i * 4 + 1] = v; px[i * 4 + 2] = v; px[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

/* ---------------- PNG 16-bit ---------------- */

function crc32(buf: Uint8Array): number {
    let table = (crc32 as any).table;
    if (!table) {
        table = new Int32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            table[i] = c;
        }
        (crc32 as any).table = table;
    }
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, data.length);
    const typeBytes = new TextEncoder().encode(type);
    const crcBuf = new Uint8Array(typeBytes.length + data.length);
    crcBuf.set(typeBytes, 0); crcBuf.set(data, typeBytes.length);
    const crc = new Uint8Array(4);
    new DataView(crc.buffer).setUint32(0, crc32(crcBuf));
    const out = new Uint8Array(12 + data.length);
    out.set(len, 0); out.set(typeBytes, 4); out.set(data, 8); out.set(crc, 8 + data.length);
    return out;
}

/** PNG grayscale 16-bit. Compressione zlib via CompressionStream (deflate = wrapper zlib). */
export async function toPNG16(data: Float32Array, w: number, h: number): Promise<Blob> {
    const raw = new Uint8Array(h * (1 + w * 2));
    for (let y = 0; y < h; y++) {
        raw[y * (1 + w * 2)] = 0; // filter: none
        for (let x = 0; x < w; x++) {
            let v = Math.round(data[y * w + x] * 65535);
            if (v < 0) v = 0; if (v > 65535) v = 65535;
            const o = y * (1 + w * 2) + 1 + x * 2;
            raw[o] = v >> 8;       // big-endian
            raw[o + 1] = v & 0xff;
        }
    }
    const cs = new CompressionStream('deflate');
    const stream = new Blob([raw]).stream().pipeThrough(cs);
    const idat = new Uint8Array(await new Response(stream).arrayBuffer());

    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, w); dv.setUint32(4, h);
    dv.setUint8(8, 16);  // bit depth
    dv.setUint8(9, 0);   // color type: grayscale
    dv.setUint8(10, 0);  // compression
    dv.setUint8(11, 0);  // filter
    dv.setUint8(12, 0);  // interlace

    const parts = [sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', new Uint8Array(0))];
    return new Blob(parts as any, { type: 'image/png' });
}

/* ---------------- STL binario ---------------- */

/**
 * Genera un solido STL binario: superficie di rilievo + pareti laterali + fondo.
 * dimensionMm: larghezza fisica del pezzo; depthMm: altezza max del rilievo.
 */
export function toSTL(
    data: Float32Array, w: number, h: number,
    dimensionMm = 100, depthMm = 10
): Blob {
    const sx = dimensionMm / (w - 1);
    const sy = dimensionMm * (h - 1) / (w - 1) / (h - 1) * (h - 1) / (h - 1); // placeholder, ricalcolato sotto
    void sy;
    const stepY = dimensionMm * (h - 1) / (w - 1) / (h - 1); // non usato
    void stepY;
    const dy = (dimensionMm * (h / w)) / (h - 1);
    void dy;
    // passo in mm per pixel su entrambi gli assi (pixel quadrati)
    const pxX = dimensionMm / (w - 1);
    const pxY = (dimensionMm * (h / w)) / (h - 1);

    const nv = w * h;
    const nTop = (w - 1) * (h - 1) * 2;
    const nWalls = (w - 1) * 2 + (h - 1) * 2;
    const nBottom = 2;
    const triCount = nTop + nWalls * 2 + nBottom * 2;

    const buf = new ArrayBuffer(84 + triCount * 50);
    const view = new DataView(buf);
    const header = new Uint8Array(buf, 0, 80);
    header.set(new TextEncoder().encode('SculptLocal depth relief - binary STL'.padEnd(80, ' ')));
    view.setUint32(80, triCount, true);

    let off = 84;
    const v0 = new Float32Array(3), v1 = new Float32Array(3), v2 = new Float32Array(3);
    const e1 = new Float32Array(3), e2 = new Float32Array(3), nrm = new Float32Array(3);

    function vertexX(x: number) { return x * pxX - dimensionMm / 2; }
    function vertexY(y: number) { return dimensionMm * (h / w) / 2 - y * pxY; }
    function vertexZ(i: number) { return data[i] * depthMm; }

    function writeTri(a: number[], b: number[], c: number[]) {
        // normale
        for (let k = 0; k < 3; k++) {
            e1[k] = b[k] - a[k];
            e2[k] = c[k] - a[k];
        }
        nrm[0] = e1[1] * e2[2] - e1[2] * e2[1];
        nrm[1] = e1[2] * e2[0] - e1[0] * e2[2];
        nrm[2] = e1[0] * e2[1] - e1[1] * e2[0];
        const len = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
        view.setFloat32(off, nrm[0] / len, true);
        view.setFloat32(off + 4, nrm[1] / len, true);
        view.setFloat32(off + 8, nrm[2] / len, true);
        for (const v of [a, b, c]) {
            view.setFloat32(off + 12, v[0], true);
            view.setFloat32(off + 16, v[1], true);
            view.setFloat32(off + 20, v[2], true);
            off += 12;
        }
        off += 6; // attribute byte count
        void v0; void v1; void v2;
    }

    const P = (x: number, y: number): number[] => [vertexX(x), vertexY(y), vertexZ(y * w + x)];

    // Superficie superiore (orientata verso +Z)
    for (let y = 0; y < h - 1; y++) {
        for (let x = 0; x < w - 1; x++) {
            writeTri(P(x, y), P(x, y + 1), P(x + 1, y + 1));
            writeTri(P(x, y), P(x + 1, y + 1), P(x + 1, y));
        }
    }

    // Pareti laterali fino a z=0
    const B = (x: number, y: number): number[] => [vertexX(x), vertexY(y), 0];
    for (let x = 0; x < w - 1; x++) {
        writeTri(P(x, 0), B(x, 0), B(x + 1, 0));         // bordo alto (y=0)
        writeTri(P(x, 0), B(x + 1, 0), P(x + 1, 0));
        writeTri(P(x, h - 1), B(x + 1, h - 1), B(x, h - 1)); // bordo basso
        writeTri(P(x, h - 1), P(x + 1, h - 1), B(x + 1, h - 1));
    }
    for (let y = 0; y < h - 1; y++) {
        writeTri(P(0, y), B(0, y + 1), B(0, y));         // lato sinistro
        writeTri(P(0, y), P(0, y + 1), B(0, y + 1));
        writeTri(P(w - 1, y), B(w - 1, y), B(w - 1, y + 1)); // lato destro
        writeTri(P(w - 1, y), B(w - 1, y + 1), P(w - 1, y + 1));
    }

    // Fondo (due triangoli grandi, orientati verso -Z)
    writeTri(B(0, 0), B(w - 1, 0), B(w - 1, h - 1));
    writeTri(B(0, 0), B(w - 1, h - 1), B(0, h - 1));

    void nv;
    return new Blob([buf], { type: 'model/stl' });
}

export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}
