'use client';

type Props = {
  src: string;
  alt: string;
  /** Show checkerboard behind transparent images */
  transparent?: boolean;
  maxHeightClass?: string;
};

export function ImagePreview({
  src,
  alt,
  transparent = false,
  maxHeightClass = 'max-h-80',
}: Props) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-hair ${transparent ? 'bg-checker' : 'bg-wash'}`}
      style={
        transparent
          ? {
              backgroundImage:
                'linear-gradient(45deg, var(--wash) 25%, transparent 25%), linear-gradient(-45deg, var(--wash) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--wash) 75%), linear-gradient(-45deg, transparent 75%, var(--wash) 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
            }
          : undefined
      }
    >
      <div className={`flex min-h-[12rem] items-center justify-center p-2 ${maxHeightClass}`}>
        <img
          src={src}
          alt={alt}
          className="max-h-full max-w-full object-contain"
          decoding="async"
        />
      </div>
    </div>
  );
}
