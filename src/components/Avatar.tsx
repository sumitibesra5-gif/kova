import React, { useState } from 'react';

interface AvatarProps {
  src?: string;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  ring?: boolean;
  online?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
};

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  size = 'md',
  ring = false,
  online = false,
}) => {
  const [failed, setFailed] = useState(false);
  const initials = alt
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  return (
    <div className="relative inline-flex shrink-0">
      <div
        className={`${SIZE_CLASSES[size]} rounded-full overflow-hidden bg-[#1D1D24] border ${
          ring ? 'ring-2 ring-[#FF385C] ring-offset-2 ring-offset-[#0A0A0C] border-transparent' : 'border-[#2A2A34]'
        } flex items-center justify-center font-semibold text-[#D4D4DC] select-none`}
      >
        {src && !failed ? (
          <img
            src={src}
            alt={alt}
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span>{initials || 'K'}</span>
        )}
      </div>
      {online && (
        <span
          aria-label="Online"
          className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#22C55E] ring-2 ring-[#0A0A0C]"
        />
      )}
    </div>
  );
};
