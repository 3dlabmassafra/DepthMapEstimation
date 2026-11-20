import { useState } from 'react';
import { ImageUploader } from './components/ImageUploader';
import { Preview3D } from './components/Preview3D';
import { depthEngine } from './services/depthEngine';
import { Loader2, Settings2 } from 'lucide-react';

function App() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [depthMap, setDepthMap] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [intensity, setIntensity] = useState(2.0);

  const handleImageSelected = async (file: File) => {
    // Create object URL for preview
    const url = URL.createObjectURL(file);
    setOriginalImage(url);
    setDepthMap(null); // Reset depth map
    setIsProcessing(true);

    try {
      // 1. Process with Depth Anything
      // We pass the object URL directly
      const result = await depthEngine.generateDepthMap(url);

      // 2. Convert Float32Array to Grayscale Canvas/Image for preview/export
      // We need to normalize the float data to 0-255 image
      const canvas = document.createElement('canvas');
      canvas.width = result.width;
      canvas.height = result.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      const imageData = ctx.createImageData(result.width, result.height);
      const data = imageData.data;

      const { min, max, depthData } = result;
      const range = max - min;

      // Simple normalization for now. 
      // We can implement the "Emergence Ramp" and other curve logic here later
      for (let i = 0; i < depthData.length; i++) {
        const val = depthData[i];
        const normalized = ((val - min) / range) * 255;

        data[i * 4 + 0] = normalized; // R
        data[i * 4 + 1] = normalized; // G
        data[i * 4 + 2] = normalized; // B
        data[i * 4 + 3] = 255;        // A
      }

      ctx.putImageData(imageData, 0, 0);

      const depthDataUrl = canvas.toDataURL('image/png');
      setDepthMap(depthDataUrl);

    } catch (err) {
      console.error(err);
      alert("Error generating depth map. Check console.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-nano-black selection:bg-nano-gold selection:text-black font-sans pb-20">
      <header className="py-8 text-center border-b border-nano-gold/10 bg-nano-black/50 backdrop-blur-sm sticky top-0 z-50">
        <h1 className="text-4xl md:text-5xl font-display font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-b from-nano-gold to-nano-gold-dim drop-shadow-sm mb-2">
          NANOBANANA
        </h1>
        <p className="text-nano-gray tracking-[0.2em] text-xs md:text-sm uppercase flex items-center justify-center gap-2">
          <span className="w-2 h-2 bg-nano-gold rounded-full inline-block animate-pulse"></span>
          High-Relief Depth Engine
        </p>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Left Panel: Controls & Input */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-nano-panel border border-nano-dark rounded-2xl p-6 shadow-xl">
            <h2 className="text-gold-gradient font-bold text-lg mb-4 flex items-center gap-2">
              <Settings2 size={20} /> Input & Controls
            </h2>

            <ImageUploader onImageSelected={handleImageSelected} className="mb-6" />

            {/* Controls (Placeholder for now) */}
            <div className="space-y-4 opacity-50 pointer-events-none grayscale">
              <div className="space-y-2">
                <label className="text-xs text-nano-gray uppercase">Relief Depth (Z-Exaggeration)</label>
                <input type="range" className="w-full accent-nano-gold" min="1" max="5" step="0.1"
                  value={intensity} onChange={(e) => setIntensity(parseFloat(e.target.value))} />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-nano-gray uppercase">Smoothing</label>
                <input type="range" className="w-full accent-nano-gold" />
              </div>
            </div>
            <p className="text-xs text-nano-gray/50 italic mt-2 text-center">Controls will be enabled in next step.</p>
          </div>

          {/* Instructions */}
          <div className="bg-nano-dark/30 border border-nano-dark rounded-xl p-6 text-sm text-nano-gray space-y-2">
            <p><strong className="text-white">Tip:</strong> Use a high-contrast portrait with a clean background.</p>
            <p>The engine will attempt to extract the subject geometry.</p>
          </div>
        </div>

        {/* Right Panel: Visualization */}
        <div className="lg:col-span-8 h-[500px] lg:h-auto min-h-[500px] bg-nano-panel rounded-2xl border border-nano-dark overflow-hidden relative shadow-2xl">
          {!originalImage ? (
            <div className="absolute inset-0 flex items-center justify-center text-nano-gray/30 flex-col gap-4">
              <div className="w-24 h-24 border-4 border-nano-dark rounded-full flex items-center justify-center">
                <span className="text-4xl font-display">NB</span>
              </div>
              <p>Waiting for Input...</p>
            </div>
          ) : (
            <>
              {isProcessing && (
                <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                  <Loader2 className="w-12 h-12 text-nano-gold animate-spin mb-4" />
                  <p className="text-lg font-medium">Processing Neural Depth...</p>
                  <p className="text-sm text-nano-gray">This happens locally on your GPU</p>
                </div>
              )}
              <Preview3D originalImage={originalImage} depthMap={depthMap} intensity={intensity} />
            </>
          )}
        </div>

      </main>
    </div>
  );
}

export default App;
