import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { cn } from '../utils/cn';

interface ViewerProps {
    originalImage: string;
    depthMap: string | null; // Data URL or object URL
    intensity?: number;
}

function ReliefPlane({ originalImage, depthMap, intensity = 2.0 }: ViewerProps) {
    const meshRef = useRef<THREE.Mesh>(null);

    // Load textures
    const [colorMap, displacementMap] = useLoader(THREE.TextureLoader, [
        originalImage,
        depthMap || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' // 1x1 black
    ]);

    useEffect(() => {
        // When textures load, update settings
        colorMap.colorSpace = THREE.SRGBColorSpace;
        displacementMap.colorSpace = THREE.LinearSRGBColorSpace; // Depth should form linear
    }, [colorMap, displacementMap]);

    const geometry = useMemo(() => new THREE.PlaneGeometry(10, 10, 512, 512), []);
    // Adjust aspect ratio based on image
    useEffect(() => {
        if (colorMap.image) {
            const aspect = colorMap.image.width / colorMap.image.height;
            meshRef.current?.scale.set(10, 10 / aspect, 1);
            // Or usually easier: width = 10 * aspect, height = 10.
            if (aspect > 1) {
                meshRef.current?.scale.set(10, 10 / aspect, 1);
            } else {
                meshRef.current?.scale.set(10 * aspect, 10, 1);
            }
        }
    }, [colorMap]);

    // Material
    const material = useMemo(() => {
        return new THREE.MeshStandardMaterial({
            map: colorMap,
            displacementMap: displacementMap,
            displacementScale: intensity, // This controls the physical height (10mm simulated)
            roughness: 0.4,
            metalness: 0.1, // Slight metallic feel for Art Deco
            side: THREE.FrontSide,
        });
    }, [colorMap, displacementMap, intensity]);

    return (
        <mesh ref={meshRef} geometry={geometry} material={material} rotation={[-Math.PI / 2, 0, 0]}>
            {/* Rotation -90 x to lay flat or facing camera? Usually 0 for facing camera. 
           Let's keep it 0 if we want it like a picture on wall.
       */}
        </mesh>
    );
}

// Adjust rotation: If we want it upright, rotation=[0,0,0].
// Stage usually centers things.

interface Preview3DProps {
    originalImage: string | null;
    depthMap: string | null;
    intensity?: number;
    className?: string;
}

export function Preview3D({ originalImage, depthMap, intensity = 2.0, className }: Preview3DProps) {
    if (!originalImage) return null;

    return (
        <div className={cn("relative w-full h-full min-h-[400px] bg-nano-dark rounded-xl overflow-hidden shadow-2xl border border-nano-dark/50", className)}>
            <Canvas shadows dpr={[1, 2]} camera={{ fov: 45, position: [0, 0, 15] }}>
                <ambientLight intensity={0.5} />
                <directionalLight position={[10, 10, 10]} intensity={1} castShadow />

                {/* Environment for nice reflections */}
                <Environment preset="city" />

                <group rotation={[0, 0, 0]}>
                    <ReliefPlane originalImage={originalImage} depthMap={depthMap} intensity={intensity} />
                </group>

                <OrbitControls makeDefault autoRotate autoRotateSpeed={0.5} minPolarAngle={0} maxPolarAngle={Math.PI / 1.5} />
            </Canvas>

            {/* Overlay UI for controls could go here */}
            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs text-white/80 pointer-events-none">
                Use mouse to rotate • Wheel to zoom
            </div>
        </div>
    );
}
