/** Turns any picture into a 400×400 JPEG square, cut from its middle. */
export async function squareAvatar(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 400;
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 400, 400);
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.88));
  return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
}

