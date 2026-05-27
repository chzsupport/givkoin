export const formatAdminK = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(n);
};
