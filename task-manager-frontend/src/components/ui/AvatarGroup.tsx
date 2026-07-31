import React from 'react';
import { UserAvatar } from './UserAvatar';

interface AvatarPerson {
  name: string;
  avatar?: string | null;
}

export const AvatarGroup: React.FC<{ people: AvatarPerson[] }> = ({ people }) => {
  return (
    <div className="flex -space-x-2">
      {people.slice(0, 4).map((person, index) => (
        <UserAvatar
          key={`${person.name}:${index}`}
          name={person.name}
          avatar={person.avatar}
          className="h-8 w-8 border border-white bg-[#2f2f2f] text-[10px] text-white shadow-[0_4px_10px_rgba(0,0,0,0.18)]"
        />
      ))}
      {people.length > 4 && (
        <div className="w-8 h-8 rounded-full border border-white bg-[#e9e9e9] text-[#5f5f5f] text-[10px] font-semibold flex items-center justify-center">
          +{people.length - 4}
        </div>
      )}
    </div>
  );
};
