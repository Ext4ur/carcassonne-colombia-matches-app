import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** If false, clicking the backdrop does not close (e.g. avoids closing when text selection ends outside the panel). Default true. */
  closeOnBackdropClick?: boolean;
}

/** z-index so modal and overlay are above everything (e.g. PlayerRegistration search bar z-[100]) */
const MODAL_Z_INDEX = 9999;

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnBackdropClick = true,
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  const handleBackdropClick = closeOnBackdropClick ? onClose : undefined;

  const modalContent = (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ zIndex: MODAL_Z_INDEX }}
      onClick={handleBackdropClick}
    >
      <div className="flex items-center justify-center min-h-full min-w-full p-4">
        <div
          className="fixed inset-0 transition-opacity bg-gray-500/75 dark:bg-black/70"
          aria-hidden="true"
          onClick={handleBackdropClick}
        />
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
          &#8203;
        </span>
        <div
          className={`relative inline-block align-middle bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all w-full max-h-[85vh] flex flex-col ${sizeClasses[size]}`}
          onClick={(e) => e.stopPropagation()}
        >
          {title && (
            <div className="flex-none px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{title}</h3>
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">{children}</div>
          {footer && (
            <div className="flex-none px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-2">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
