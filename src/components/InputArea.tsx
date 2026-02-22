import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Plus, X } from 'lucide-react';

interface InputAreaProps {
    onSend: (text: string, file?: File) => Promise<void> | void;
    disabled?: boolean;
}

export const InputArea: React.FC<InputAreaProps> = ({ onSend, disabled }) => {
    const [text, setText] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [text]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedFile(file);

            // Create preview
            const objectUrl = URL.createObjectURL(file);
            setPreviewUrl(objectUrl);
        }
    };

    const clearImage = () => {
        setSelectedFile(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSend = async () => {
        if ((text.trim() || selectedFile) && !disabled) {
            const currentText = text;
            const currentFile = selectedFile;

            // Optimistically clear the UI immediately
            setText('');
            clearImage();
            if (textareaRef.current) textareaRef.current.style.height = 'auto';

            try {
                await onSend(currentText, currentFile || undefined);
            } catch (error) {
                console.error("Failed to send message:", error);
                // Restore text if the send completely failed (e.g. timeout)
                setText(currentText);
                if (currentFile) {
                    setSelectedFile(currentFile);
                    setPreviewUrl(URL.createObjectURL(currentFile));
                }
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 z-20 pointer-events-none transition-colors duration-300">
            {/* Gradient fade to hide content behind */}
            <div className="absolute inset-0 bg-gradient-to-t from-warm-charcoal via-warm-charcoal/95 to-transparent pointer-events-none" />

            <div className="relative px-4 pt-6 pb-6 max-w-3xl mx-auto pointer-events-auto">
                {/* Main Input Pill - Floating Glass */}
                <div className="bg-surface-charcoal/80 backdrop-blur-2xl rounded-[32px] p-2 flex items-end gap-2 shadow-2xl shadow-black/20 border border-white/10 ring-1 ring-white/5 transition-all duration-300 hover:bg-surface-charcoal/90 hover:border-white/20 pl-4 mb-4">

                    {/* File Input (Hidden) */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept="image/*,application/pdf"
                        className="hidden"
                    />

                    {/* Attachment Button */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={disabled}
                        className={`p-2.5 rounded-full mb-0.5 transition-all duration-200 ${disabled ? 'bg-white/5 text-text-muted-zinc/30 cursor-not-allowed' : 'text-text-muted-zinc hover:text-text-cream hover:bg-white/10'}`}
                        title="Upload Image"
                    >
                        <Plus size={20} strokeWidth={2.5} />
                    </button>

                    {/* Text Input */}
                    <div className="flex-1 min-h-[44px] relative flex flex-col justify-center py-2">
                        {/* Image Preview */}
                        {previewUrl && (
                            <div className="relative inline-block mb-2 w-fit group">
                                <img
                                    src={previewUrl}
                                    alt="Preview"
                                    className="h-16 w-auto rounded-lg border border-white/10 shadow-lg object-cover"
                                />
                                <button
                                    onClick={clearImage}
                                    className="absolute -top-2 -right-2 bg-warm-charcoal text-white rounded-full p-0.5 shadow-md border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        )}
                        <textarea
                            ref={textareaRef}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={previewUrl ? "Add a caption..." : "Message Ekam..."}
                            className="w-full bg-transparent text-text-cream placeholder-text-muted-zinc/60 text-[16px] focus:outline-none resize-none max-h-32 scrollbar-hide leding-relaxed"
                            rows={1}
                        />
                    </div>

                    {/* Send Button */}
                    <button
                        onClick={handleSend}
                        disabled={disabled || (!text.trim() && !selectedFile)}
                        className={`p-2.5 rounded-full mb-0.5 transition-all duration-200 ${(!text.trim() && !selectedFile) ? 'bg-white/5 text-text-muted-zinc cursor-not-allowed' : 'bg-text-cream text-warm-charcoal hover:scale-105 active:scale-95 shadow-md'}`}
                    >
                        <ArrowUp size={20} strokeWidth={3} />
                    </button>
                </div>
            </div>
        </div>
    );
};
