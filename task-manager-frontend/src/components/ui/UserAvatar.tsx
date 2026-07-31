import React from 'react';
import { UserRound } from 'lucide-react';

interface UserAvatarProps {
  name?: string | null;
  avatar?: string | null;
  className?: string;
  imageClassName?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  avatar,
  className = 'h-10 w-10 bg-[#e8ecf1] text-[#2d3c54]',
  imageClassName = 'h-full w-full object-cover',
}) => (
  <div
    className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold ${className}`}
    title={name || 'Пользователь'}
  >
    {avatar ? (
      <img src={avatar} alt={name || 'Аватар'} className={imageClassName} />
    ) : (
      <UserRound className="h-[52%] w-[52%]" strokeWidth={1.8} aria-hidden="true" />
    )}
  </div>
);
