import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'info';
  isLoading?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'info',
  isLoading = false
}: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#111114] border border-white/10 rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex items-start gap-4 mb-6">
                {variant === 'danger' && (
                  <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-rose-500" />
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-serif italic text-white mb-1">{title}</h3>
                  <p className="text-sm text-[#71717A] leading-relaxed">{description}</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm font-medium text-[#71717A] hover:text-white transition-colors disabled:opacity-50"
                >
                  {cancelText}
                </button>
                {onConfirm && (
                  <button
                    onClick={onConfirm}
                    disabled={isLoading}
                    className={cn(
                      "px-6 py-2 text-sm font-bold uppercase tracking-widest rounded-xl transition-all font-mono",
                      variant === 'danger' 
                        ? "bg-rose-600 text-white hover:bg-rose-500 shadow-lg shadow-rose-900/20" 
                        : "bg-white text-black hover:bg-[#D4D4D8]",
                      isLoading && "opacity-50 cursor-wait"
                    )}
                  >
                    {isLoading ? 'Processing...' : confirmText}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
