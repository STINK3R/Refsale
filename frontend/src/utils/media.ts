/** Chat attachments are photos or short videos, told apart by their extension. */
export const isVideoUrl = (url: string): boolean => /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
