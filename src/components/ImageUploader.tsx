import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileImage } from 'lucide-react';
import { cn } from '../utils/cn';

interface ImageUploaderProps {
    onImageSelected: (file: File) => void;
    className?: string;
}

export function ImageUploader({ onImageSelected, className }: ImageUploaderProps) {
    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            onImageSelected(acceptedFiles[0]);
        }
    }, [onImageSelected]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': [] },
        multiple: false
    });

    return (
        <div
            {...getRootProps()}
            className={cn(
                "cursor-pointer relative overflow-hidden rounded-xl border-2 border-dashed transition-all duration-300 group flex flex-col items-center justify-center p-12 text-center",
                isDragActive
                    ? "border-nano-gold bg-nano-gold/10"
                    : "border-nano-dark hover:border-nano-gold/50 bg-nano-panel",
                className
            )}
        >
            <input {...getInputProps()} />

            <div className="z-10 relative space-y-4">
                <div className={cn(
                    "w-16 h-16 rounded-full flex items-center justify-center mx-auto transition-colors",
                    isDragActive ? "bg-nano-gold text-black" : "bg-nano-dark text-nano-gold"
                )}>
                    {isDragActive ? <Upload size={32} /> : <FileImage size={32} />}
                </div>

                <div>
                    <h3 className="text-lg font-medium text-white mb-1">
                        {isDragActive ? "Drop image here" : "Upload Reference Image"}
                    </h3>
                    <p className="text-sm text-nano-gray max-w-xs mx-auto">
                        Drag & drop or click to browse. <br />
                        Best results with high-contrast portraits against plain backgrounds.
                    </p>
                </div>
            </div>

            {/* Decorative corner accents */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-nano-gold/30 rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-nano-gold/30 rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-nano-gold/30 rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-nano-gold/30 rounded-br-lg" />
        </div>
    );
}
