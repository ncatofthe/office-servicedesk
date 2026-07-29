export interface ProfileExtras {
  about?: string;
  avatarDataUrl?: string;
}

export const PROFILE_EXTRAS_UPDATED_EVENT = 'profile-extras-updated';

const getStorageKey = (userId: string) => `profile-extras:${userId}`;

const readStoredProfileExtras = (userId: string): ProfileExtras => {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as ProfileExtras;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
};

const emitProfileExtrasUpdated = (userId: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(PROFILE_EXTRAS_UPDATED_EVENT, {
      detail: { userId },
    })
  );
};

export const getProfileExtras = (userId?: string | null): ProfileExtras => {
  if (!userId) {
    return {};
  }

  return readStoredProfileExtras(userId);
};

export const saveProfileExtras = (userId: string, nextExtras: ProfileExtras): ProfileExtras => {
  const normalized: ProfileExtras = {
    about: nextExtras.about?.trim() || undefined,
    avatarDataUrl: nextExtras.avatarDataUrl || undefined,
  };

  localStorage.setItem(getStorageKey(userId), JSON.stringify(normalized));
  emitProfileExtrasUpdated(userId);
  return normalized;
};
