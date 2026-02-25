import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, Image as ImageIcon, Eye, File, Calendar, Trash2, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
    storage,
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject,
    functions,
    httpsCallable
} from '../lib/firebase';
import { supabase } from '../lib/supabase';

interface MedicalRepositoryProps {
    onClose: () => void;
}

interface VaultFile {
    id: string;
    fileName: string;
    fileUrl: string;
    fileType: 'pdf' | 'image' | 'other';
    uploadedAt: any;
    size?: number;
    storagePath?: string;
}

export const MedicalRepository: React.FC<MedicalRepositoryProps> = ({ onClose }) => {
    const { user } = useAuth();
    const [files, setFiles] = useState<VaultFile[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch Files
    useEffect(() => {
        if (!user) return;

        const fetchFiles = async () => {
            const { data, error } = await supabase
                .from('vault')
                .select('*')
                .eq('user_id', user.uid)
                .order('uploaded_at', { ascending: false });

            if (error) {
                console.error("Error fetching vault files:", error);
                return;
            }

            if (data) {
                setFiles(data.map(f => ({
                    id: f.id,
                    fileName: f.file_name,
                    fileUrl: f.file_url || '', // We'll add this to the database if missing
                    fileType: f.file_type as 'pdf' | 'image' | 'other',
                    uploadedAt: f.uploaded_at,
                    storagePath: f.storage_path
                })));
            }
        };

        fetchFiles();

        const channel = supabase
            .channel(`vault-${user.uid}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'vault',
                filter: `user_id=eq.${user.uid}`
            }, () => {
                fetchFiles();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);

    // Handle File Upload
    const handleFileUpload = async (uploadedFile: File) => {
        if (!user || !uploadedFile) return;

        // specific basic validation
        const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
        if (!validTypes.includes(uploadedFile.type)) {
            alert('Please upload PDFs or Images (JPEG, PNG, WEBP).');
            return;
        }

        setIsUploading(true);
        try {
            const timestamp = Date.now();
            const storagePath = `uploads/${user.uid}/${timestamp}_${uploadedFile.name}`;
            const storageRef = ref(storage, storagePath);

            // Upload
            await uploadBytes(storageRef, uploadedFile);

            // Get URL
            const downloadURL = await getDownloadURL(storageRef);

            // Determine type
            let fileType: 'pdf' | 'image' | 'other' = 'other';
            if (uploadedFile.type.includes('pdf')) fileType = 'pdf';
            if (uploadedFile.type.includes('image')) fileType = 'image';

            // Save Metadata to Supabase
            const { error: dbError } = await supabase.from('vault').insert({
                user_id: user.uid,
                file_name: uploadedFile.name,
                file_url: downloadURL,
                file_type: fileType,
                size: uploadedFile.size,
                storage_path: storagePath,
                uploaded_at: new Date().toISOString()
            });

            if (dbError) throw dbError;

        } catch (error) {
            console.error("Upload failed:", error);
            alert("Upload failed. Please try again.");
        } finally {
            setIsUploading(false);
        }
    };

    // Drag & Drop Handlers
    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    };

    // Handle manual select
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            handleFileUpload(e.target.files[0]);
        }
    };

    const handleDelete = async (e: React.MouseEvent, file: VaultFile) => {
        e.stopPropagation();
        if (!user || !confirm('Are you sure you want to permanently delete this file?')) return;

        try {
            // 1. Delete from Storage (if path exists)
            if (file.storagePath) {
                const storageRef = ref(storage, file.storagePath);
                await deleteObject(storageRef).catch(err => console.warn("Storage deletion failed:", err));
            }

            // 2. Delete from Supabase
            const { error: dbError } = await supabase.from('vault').delete().eq('id', file.id);
            if (dbError) throw dbError;

        } catch (error) {
            console.error("Error deleting file:", error);
            alert("Failed to delete file.");
        }
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp) return 'Just now';
        return new Date(timestamp.seconds * 1000).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const handleGenerateSummary = async () => {
        setIsGeneratingSummary(true);
        try {
            const generateClinicalSummary = httpsCallable(functions, 'generateClinicalSummary');
            await generateClinicalSummary();
            // The snapshot listener will automatically fetch the new file when it is written and show it in the list
        } catch (error) {
            console.error("Failed to generate summary:", error);
            alert("Failed to generate summary. Please try again.");
        } finally {
            setIsGeneratingSummary(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="flex-1 flex flex-col h-full bg-background-dark overflow-y-auto"
        >
            <div className="max-w-4xl mx-auto w-full p-6 pb-24 space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/5 rounded-full text-text-muted-zinc transition-colors mr-2 group"
                            title="Back to Chat"
                        >
                            <ArrowLeft size={24} className="group-hover:text-text-cream" />
                        </button>
                        <div>
                            <h1 className="text-3xl font-serif text-text-cream">Medical Repository</h1>
                            <p className="text-text-muted-zinc mt-1">Secure storage for your health records.</p>
                        </div>
                    </div>
                    <button
                        onClick={handleGenerateSummary}
                        disabled={isGeneratingSummary}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-accent-clay hover:bg-accent-clay/90 disabled:opacity-50 disabled:cursor-not-allowed text-background-dark font-medium rounded-xl transition-all shadow-md shrink-0 focus:outline-none focus:ring-2 focus:ring-accent-clay focus:ring-offset-2 focus:ring-offset-background-dark"
                    >
                        {isGeneratingSummary ? (
                            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                                <Upload size={18} />
                            </motion.div>
                        ) : (
                            <FileText size={18} />
                        )}
                        {isGeneratingSummary ? 'Generating Summary...' : 'Generate Doctor Summary'}
                    </button>
                </div>

                {/* Upload Drop Zone */}
                <div
                    className={`relative border-2 border-dashed rounded-2xl p-10 transition-all text-center group cursor-pointer
                        ${dragActive ? 'border-accent-clay bg-accent-clay/10' : 'border-white/10 hover:border-white/20 hover:bg-white/5'}
                        ${isUploading ? 'opacity-50 pointer-events-none' : ''}
                    `}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept="image/*,application/pdf"
                        onChange={handleChange}
                    />

                    <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-surface-charcoal border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                            {isUploading ? (
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                                >
                                    <Upload size={24} className="text-text-muted-zinc" />
                                </motion.div>
                            ) : (
                                <Upload size={24} className="text-accent-clay" />
                            )}
                        </div>
                        <div>
                            <p className="text-text-cream font-medium text-lg">
                                {isUploading ? 'Uploading...' : 'Click to upload or drag and drop'}
                            </p>
                            <p className="text-text-muted-zinc text-sm mt-1">
                                PDF, JPG, PNG (Max 10MB)
                            </p>
                        </div>
                    </div>
                </div>

                {/* File List */}
                <div className="space-y-4">
                    <h2 className="text-xl font-medium text-text-cream/90">Your Documents</h2>

                    {files.length === 0 ? (
                        <div className="text-center py-12 text-text-muted-zinc border border-white/5 rounded-xl bg-surface-charcoal/30">
                            <FileText size={48} className="mx-auto mb-4 opacity-20" />
                            <p>No documents uploaded yet.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <AnimatePresence>
                                {files.map((file) => (
                                    <motion.div
                                        key={file.id}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="bg-surface-charcoal border border-white/5 rounded-xl p-4 flex items-center justify-between group hover:border-white/10 transition-all hover:bg-white/5"
                                    >
                                        <div className="flex items-center gap-4 overflow-hidden">
                                            <div className="w-10 h-10 rounded-lg bg-background-dark border border-white/10 flex items-center justify-center flex-shrink-0">
                                                {file.fileType === 'pdf' ? (
                                                    <FileText size={20} className="text-red-400" />
                                                ) : file.fileType === 'image' ? (
                                                    <ImageIcon size={20} className="text-blue-400" />
                                                ) : (
                                                    <File size={20} className="text-text-muted-zinc" />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-text-cream text-sm font-medium truncate pr-4" title={file.fileName}>
                                                    {file.fileName}
                                                </h3>
                                                <div className="flex items-center gap-2 text-xs text-text-muted-zinc mt-0.5">
                                                    <Calendar size={10} />
                                                    {formatDate(file.uploadedAt)}
                                                    {file.size && <span>• {(file.size / 1024 / 1024).toFixed(2)} MB</span>}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <a
                                                href={file.fileUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="p-2 text-text-muted-zinc hover:text-text-cream hover:bg-white/10 rounded-lg transition-colors"
                                                title="View File"
                                            >
                                                <Eye size={18} />
                                            </a>
                                            <button
                                                onClick={(e) => handleDelete(e, file)}
                                                className="p-2 text-text-muted-zinc hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                title="Delete File"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};
