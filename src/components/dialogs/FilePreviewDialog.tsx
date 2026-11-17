/**
 * Phone preview: an image, text, or a short note when the file cannot be
 * shown. The preview hook loads the file and handles the arrow keys; this
 * only draws what that hook already has.
 */
import type { SetStateAction } from "react";
import { getImageMimeType } from "../../lib/fileDisplay";
import { formatBytes } from "../../lib/format";
import { type FilePreview } from "../../types/transfer";

export interface FilePreviewDialogProps {
  setShowPreview: (value: SetStateAction<boolean>) => void;
  previewData: FilePreview | null;
  previewLoading: boolean;
  previewFileName: string;
  imageOrientation: "portrait" | "landscape" | "square";
  setImageOrientation: (value: SetStateAction<"portrait" | "landscape" | "square">) => void;
  imageDimensions: { width: number; height: number; } | null;
  setImageDimensions: (value: SetStateAction<{ width: number; height: number; } | null>) => void;
}

export function FilePreviewDialog({
  setShowPreview,
  previewData,
  previewLoading,
  previewFileName,
  imageOrientation,
  setImageOrientation,
  imageDimensions,
  setImageDimensions,
}: FilePreviewDialogProps) {
  return (
    <div className="modal-overlay" onClick={() => setShowPreview(false)}>
      <div
        className={`modal-dialog preview-dialog preview-${imageOrientation}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="preview-header">
          <h3 id="preview-title">📄 {previewFileName}</h3>
          <button 
            className="close-btn" 
            onClick={() => setShowPreview(false)}
            aria-label="Close preview"
          >
            ×
          </button>
        </div>
        <div className="preview-content">
          {previewLoading ? (
            <div className="preview-loading">
              <p>Loading preview...</p>
            </div>
          ) : previewData ? (
            <>
              {previewData.file_type === "image" && (
                <div className="preview-two-column">
                  <div className="preview-image-container">
                    <img
                      src={`data:${getImageMimeType(previewFileName)};base64,${previewData.content}`}
                      alt={previewFileName}
                      className="preview-image"
                      onLoad={(e) => {
                        const img = e.target as HTMLImageElement;
                        const ratio = img.naturalWidth / img.naturalHeight;
                        setImageDimensions({
                          width: img.naturalWidth,
                          height: img.naturalHeight
                        });
                        if (Math.abs(ratio - 1) < 0.1) {
                          setImageOrientation('square');
                        } else if (ratio > 1) {
                          setImageOrientation('landscape');
                        } else {
                          setImageOrientation('portrait');
                        }
                      }}
                    />
                  </div>
                  <div className="preview-info-panel">
                    <h4>File Information</h4>
                    <div className="info-item">
                      <span className="info-label">Name:</span>
                      <span className="info-value">{previewFileName}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Size:</span>
                      <span className="info-value">
                        {previewData.size < 1024 
                          ? `${previewData.size} B`
                          : previewData.size < 1024 * 1024
                          ? `${(previewData.size / 1024).toFixed(2)} KB`
                          : `${(previewData.size / (1024 * 1024)).toFixed(2)} MB`}
                      </span>
                    </div>
                    {imageDimensions && (
                      <>
                        <div className="info-item">
                          <span className="info-label">Dimensions:</span>
                          <span className="info-value">{imageDimensions.width} × {imageDimensions.height} px</span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Aspect Ratio:</span>
                          <span className="info-value">
                            {(imageDimensions.width / imageDimensions.height).toFixed(2)}
                          </span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Orientation:</span>
                          <span className="info-value">{imageOrientation}</span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Type:</span>
                          <span className="info-value">{getImageMimeType(previewFileName)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
              {previewData.file_type === "text" && (
                <div className="preview-text-container">
                  <pre className="preview-text">{previewData.content}</pre>
                  <p className="preview-info">
                    Size: {(previewData.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              )}
              {previewData.file_type === "unsupported" && (
                <div className="preview-two-column">
                  <div className="preview-no-preview">
                    <p>No preview</p>
                  </div>
                  <div className="preview-info-panel">
                    <h4>File Information</h4>
                    <div className="info-item">
                      <span className="info-label">Name:</span>
                      <span className="info-value">{previewFileName}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Size:</span>
                      <span className="info-value">{formatBytes(previewData.size)}</span>
                    </div>
                    {previewFileName.includes('.') && (
                      <div className="info-item">
                        <span className="info-label">Type:</span>
                        <span className="info-value">
                          {previewFileName.split('.').pop()?.toUpperCase()} file
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="preview-loading">
              <p>No preview data available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
