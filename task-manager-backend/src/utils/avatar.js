const MAX_AVATAR_DATA_URL_LENGTH = 350000;
const MAX_AVATAR_BYTES = 256 * 1024;
const AVATAR_DATA_URL_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

const normalizeAvatarDataUrl = (value) => {
    if (value === null || value === '') {
        return null;
    }

    if (typeof value !== 'string') {
        throw new Error('Аватар должен быть изображением или null.');
    }

    if (value.length > MAX_AVATAR_DATA_URL_LENGTH) {
        throw new Error('Аватар слишком большой. Загрузите изображение меньшего размера.');
    }

    const match = value.match(AVATAR_DATA_URL_PATTERN);
    if (!match) {
        throw new Error('Поддерживаются аватары JPG, PNG и WebP.');
    }

    if (Buffer.byteLength(match[1], 'base64') > MAX_AVATAR_BYTES) {
        throw new Error('Аватар не должен превышать 256 КБ после обработки.');
    }

    return value;
};

module.exports = {
    MAX_AVATAR_DATA_URL_LENGTH,
    normalizeAvatarDataUrl
};
