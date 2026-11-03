/** «1 отзыв», «2 отзыва», «5 отзывов». */
export const reviewsWord = (n: number) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'отзыв';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'отзыва';
  return 'отзывов';
};
