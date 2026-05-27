const NIGHT_SHIFT_DEFAULT_SALARY = Object.freeze({ k: 100, lm: 100, stars: 0.001 });

function normalizeNightShiftSalary(value) {
  const k = Number(value?.k);
  const lm = Number(value?.lm);
  const stars = Number(value?.stars);

  if (k === 10 && lm === 50 && stars === 0.01) {
    return { ...NIGHT_SHIFT_DEFAULT_SALARY };
  }

  if (!Number.isFinite(k) || !Number.isFinite(lm) || !Number.isFinite(stars)) {
    return { ...NIGHT_SHIFT_DEFAULT_SALARY };
  }

  return {
    k,
    lm,
    stars,
  };
}

module.exports = {
  NIGHT_SHIFT_DEFAULT_SALARY,
  normalizeNightShiftSalary,
};
