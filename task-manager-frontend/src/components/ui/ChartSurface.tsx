import React, { useEffect, useRef, useState } from 'react';

interface ChartSurfaceProps {
  height: number;
  children: React.ReactNode | ((size: { width: number; height: number }) => React.ReactNode);
}

export const ChartSurface: React.FC<ChartSurfaceProps> = ({ height, children }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      const nextWidth = Math.floor(rect.width);
      const nextHeight = Math.floor(rect.height);
      if (nextWidth > 0 && nextHeight > 0) {
        setSize((current) => {
          if (current?.width === nextWidth && current.height === nextHeight) {
            return current;
          }
          return { width: nextWidth, height: nextHeight };
        });
      }
    };

    updateSize();

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="min-w-0"
      style={{ width: '100%', height, minHeight: height }}
    >
      {size ? (typeof children === 'function' ? children(size) : children) : null}
    </div>
  );
};
