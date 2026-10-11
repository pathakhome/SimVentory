/**
 * Client-side Image Optimization Utility
 * Automatically resizes high-resolution camera photos (e.g., 12MP/48MP phone cameras)
 * down to crisp, lightweight WebP/JPEG blobs (~200-400KB) for fast network uploads.
 */

export async function optimizeImage(file, maxDimension = 1600, quality = 0.85) {
  // Pass SVGs through unchanged
  if (file.type === 'image/svg+xml') {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Calculate constrained dimensions
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      // Draw image onto canvas
      ctx.drawImage(img, 0, 0, width, height);

      // Export as webp with fallback to jpeg
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            // Fallback to jpeg if webp unsupported
            canvas.toBlob((jpegBlob) => resolve(jpegBlob || file), 'image/jpeg', quality);
          }
        },
        'image/webp',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // Fallback to raw file if decode fails
    };

    img.src = url;
  });
}
