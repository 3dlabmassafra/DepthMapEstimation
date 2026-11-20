import { env, AutoModelForDepthEstimation, AutoProcessor, RawImage } from '@xenova/transformers';

// Il modello ONNX viene scaricato una volta da Hugging Face e poi cached nel browser.
// Nessuna API key, nessun token: tutto gira localmente su WebGPU/WASM.
env.allowLocalModels = false;
env.useBrowserCache = true;

export type ModelSize = 'small' | 'base';

export interface DepthResult {
    depthData: Float32Array;
    width: number;
    height: number;
    min: number;
    max: number;
}

export const MODELS: Record<ModelSize, { id: string; label: string; desc: string }> = {
    small: {
        id: 'Xenova/depth-anything-small-hf',
        label: 'Small — veloce',
        desc: '~100 MB · buono per preview rapide',
    },
    base: {
        id: 'Xenova/depth-anything-base-hf',
        label: 'Base — qualità',
        desc: '~300 MB · consigliato per il risultato finale',
    },
};

/** Ridimensionamento bilineare di una mappa di profondità [H x W] float32. */
function bilinearResize(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Float32Array {
    const dst = new Float32Array(dw * dh);
    const xRatio = sw / dw;
    const yRatio = sh / dh;
    for (let y = 0; y < dh; y++) {
        const fy = (y + 0.5) * yRatio - 0.5;
        const y0 = Math.max(0, Math.floor(fy));
        const y1 = Math.min(sh - 1, y0 + 1);
        const wy = fy - y0;
        const row0 = y0 * sw;
        const row1 = y1 * sw;
        for (let x = 0; x < dw; x++) {
            const fx = (x + 0.5) * xRatio - 0.5;
            const x0 = Math.max(0, Math.floor(fx));
            const x1 = Math.min(sw - 1, x0 + 1);
            const wx = fx - x0;
            const a = src[row0 + x0];
            const b = src[row0 + x1];
            const c = src[row1 + x0];
            const d = src[row1 + x1];
            dst[y * dw + x] =
                a * (1 - wx) * (1 - wy) + b * wx * (1 - wy) +
                c * (1 - wx) * wy + d * wx * wy;
        }
    }
    return dst;
}

class DepthEngine {
    private static instance: DepthEngine;
    private model: any = null;
    private processor: any = null;
    private currentModelId: string | null = null;
    private loadingPromise: Promise<void> | null = null;

    private constructor() { }

    public static getInstance(): DepthEngine {
        if (!DepthEngine.instance) DepthEngine.instance = new DepthEngine();
        return DepthEngine.instance;
    }

    public async loadModel(size: ModelSize, onProgress?: (progress: number) => void): Promise<void> {
        const modelId = MODELS[size].id;
        if (this.model && this.currentModelId === modelId) return;
        // Se sta caricando lo stesso modello, riusa la promise
        if (this.loadingPromise && this.currentModelId === modelId) return this.loadingPromise;

        this.loadingPromise = (async () => {
            try {
                console.log(`Loading depth model: ${modelId}`);
                this.currentModelId = modelId;
                this.model = await AutoModelForDepthEstimation.from_pretrained(modelId, {
                    progress_callback: (data: any) => {
                        if (data.status === 'progress' && onProgress) onProgress(data.progress);
                    },
                });
                this.processor = await AutoProcessor.from_pretrained(modelId);
                console.log('Depth model loaded.');
            } catch (err) {
                this.currentModelId = null;
                this.model = null;
                this.processor = null;
                console.error('Failed to load depth model', err);
                throw err;
            } finally {
                this.loadingPromise = null;
            }
        })();

        return this.loadingPromise;
    }

    /**
     * Esegue l'inferenza e restituisce la depth map grezza in float32
     * alla risoluzione dell'immagine di input (lato lungo max ~1024 px).
     */
    public async generateDepthMap(imageUrl: string, size: ModelSize = 'small'): Promise<DepthResult> {
        if (!this.model || this.currentModelId !== MODELS[size].id) {
            await this.loadModel(size);
        }

        const image = await RawImage.fromURL(imageUrl);

        // Limita il lato lungo per velocizzare l'inferenza mantenendo dettaglio sufficiente
        const MAX_SIDE = 1024;
        let { width, height } = image;
        if (Math.max(width, height) > MAX_SIDE) {
            const s = MAX_SIDE / Math.max(width, height);
            width = Math.round(width * s);
            height = Math.round(height * s);
        }

        const inputs = await this.processor(image);
        const { predicted_depth } = await this.model(inputs);

        // predicted_depth: tensor [1, h, w] float32 (disparità: alto = vicino)
        const [h, w] = predicted_depth.dims.slice(-2);
        const raw = new Float32Array(predicted_depth.data); // copia
        const resized = bilinearResize(raw, w, h, width, height);

        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < resized.length; i++) {
            const v = resized[i];
            if (v < min) min = v;
            if (v > max) max = v;
        }

        return { depthData: resized, width, height, min, max };
    }
}

export const depthEngine = DepthEngine.getInstance();
