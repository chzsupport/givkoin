'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { BridgeImageType } from './types';
import { getBridgeImagePath } from './bridgeUtils';

type BridgeImageProps = {
  from: string;
  to: string;
  type?: BridgeImageType;
  className?: string;
  alt?: string;
};

export function BridgeImage({
  from,
  to,
  type = 'preview',
  className = '',
  alt = 'Bridge',
}: BridgeImageProps) {
  const [triedReverse, setTriedReverse] = useState(false);
  const [error, setError] = useState(false);

  const src = triedReverse
    ? getBridgeImagePath(to, from, type)
    : getBridgeImagePath(from, to, type);

  if (error && triedReverse) {
    return (
      <div className={`${className} bg-neutral-800 flex items-center justify-center text-neutral-600`}>
        <span className="text-4xl">🌉</span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="(max-width: 768px) 100vw, 50vw"
      className={className}
      unoptimized
      onError={() => {
        if (!triedReverse) {
          setTriedReverse(true);
        } else {
          setError(true);
        }
      }}
    />
  );
}
