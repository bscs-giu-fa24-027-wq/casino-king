import api from '../../api/axios';

export function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function formatCkc(value) {
  return `${toNumber(value).toFixed(2)} CKC`;
}

export function normalizeRoundResult(data) {
  return {
    outcome: data?.outcome || 'unknown',
    stakeCkc: toNumber(data?.stakeCkc),
    payoutCkc: toNumber(data?.payoutCkc),
    newBalance: toNumber(data?.newBalance),
    rngResult: data?.rngResult || {},
  };
}

export async function playGameRound(gameId, payload) {
  const { data } = await api.post(`/games/${gameId}/play`, payload);
  return normalizeRoundResult(data);
}

export function getErrorMessage(err, fallback) {
  return err?.response?.data?.message || err?.response?.data?.error || fallback;
}
