const MAX_SOURCE_SIZE = 10 * 1024 * 1024;
const MAX_AVATAR_DATA_URL_LENGTH = 340000;
const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const loadImage = (file: File) => new Promise<HTMLImageElement>((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Не удалось прочитать изображение.'));
  };
  image.src = url;
});

export const prepareAvatarImage = async (file: File): Promise<string> => {
  if (!SUPPORTED_TYPES.has(file.type)) {
    throw new Error('Для аватара подходят JPG, PNG и WebP.');
  }
  if (file.size > MAX_SOURCE_SIZE) {
    throw new Error('Исходное изображение не должно превышать 10 МБ.');
  }

  const image = await loadImage(file);
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  if (!sourceSize) {
    throw new Error('Не удалось определить размер изображения.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Браузер не поддерживает обработку изображения.');
  }

  const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
  const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 256, 256);

  for (const quality of [0.82, 0.72, 0.62]) {
    const dataUrl = canvas.toDataURL('image/webp', quality);
    if (dataUrl.length <= MAX_AVATAR_DATA_URL_LENGTH) {
      return dataUrl;
    }
  }

  throw new Error('Не удалось достаточно уменьшить изображение. Выберите другое.');
};
