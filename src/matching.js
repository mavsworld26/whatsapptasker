// Task-matching engine: pure functions, no I/O. Inputs are plain rows; outputs are ranked lists with reasons.
import { AREAS, distanceKm } from './areas.js';

const PRIOR_MEAN = 4.2;   // Bayesian prior for ratings, so a single 5★ doesn't outrank 40 jobs at 4.8★
const PRIOR_WEIGHT = 3;

export function bayesianRating(sum, count) {
  return (sum + PRIOR_MEAN * PRIOR_WEIGHT) / (count + PRIOR_WEIGHT);
}

export function displayRating(sum, count) {
  return count ? (sum / count).toFixed(1) : 'new';
}

function workerPoint(worker) {
  const a = AREAS[worker.home_area];
  return a ? { lat: a.lat, lng: a.lng } : null;
}

/**
 * Rank verified, available workers for a task.
 * worker: { phone, home_area, radius_km, skills (array), rating_sum, rating_count, jobs_completed, jobs_cancelled, active_jobs, last_inbound_at }
 */
export function rankWorkersForTask(task, workers, { now = Date.now(), limit = 15 } = {}) {
  const results = [];
  for (const w of workers) {
    if (w.phone === task.customer_phone) continue;
    const skills = Array.isArray(w.skills) ? w.skills : [];
    if (!skills.includes(task.category) && !(task.category === 'general' && skills.length)) continue;
    const p = workerPoint(w);
    if (!p) continue;
    const d = distanceKm(p, { lat: task.lat, lng: task.lng });
    if (d > w.radius_km) continue;
    if ((w.active_jobs || 0) >= 3) continue; // capacity guard
    const proximity = 1 - d / w.radius_km;                                     // 0..1
    const quality = (bayesianRating(w.rating_sum, w.rating_count) - 1) / 4;    // 0..1
    const done = w.jobs_completed || 0, cancelled = w.jobs_cancelled || 0;
    const reliability = (done + 2) / (done + cancelled + 2);                    // 0..1, smoothed
    const hoursSinceSeen = w.last_inbound_at ? (now - w.last_inbound_at) / 3600000 : 999;
    const responsiveness = hoursSinceSeen < 24 ? 1 : hoursSinceSeen < 72 ? 0.5 : 0.1;
    const load = 1 - (w.active_jobs || 0) / 3;
    const newcomerBoost = done < 3 ? 0.05 : 0; // give new verified workers a fair chance
    const score = 0.35 * proximity + 0.25 * quality + 0.2 * reliability + 0.1 * responsiveness + 0.1 * load + newcomerBoost;
    results.push({ phone: w.phone, score: Number(score.toFixed(4)), distanceKm: Number(d.toFixed(1)), withinCustomerWindow: hoursSinceSeen < 24 });
  }
  return results.sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm).slice(0, limit);
}

/**
 * Rank offers for a customer. Price matters most, but quality and reliability break near-ties.
 * offer: { id, amount_paise, rating_sum, rating_count, jobs_completed, jobs_cancelled, distance_km }
 */
export function rankOffers(offers, budgetPaise) {
  if (!offers.length) return [];
  const min = Math.min(...offers.map(o => o.amount_paise));
  const ranked = offers.map(o => {
    const price = min / o.amount_paise;                                     // 1 for cheapest
    const quality = (bayesianRating(o.rating_sum, o.rating_count) - 1) / 4;
    const done = o.jobs_completed || 0;
    const reliability = (done + 2) / (done + (o.jobs_cancelled || 0) + 2);
    const overBudget = budgetPaise && o.amount_paise > budgetPaise * 1.25 ? -0.1 : 0;
    const score = 0.5 * price + 0.3 * quality + 0.2 * reliability + overBudget;
    return { ...o, score: Number(score.toFixed(4)) };
  });
  return ranked.sort((a, b) => b.score - a.score || a.amount_paise - b.amount_paise || a.id - b.id);
}

// Pricing: customer pays quote + platform fee + GST on the fee. Worker receives the full quote.
export function priceBreakdown(quotePaise, { feeRate, gstRate }) {
  const fee = Math.round(quotePaise * feeRate);
  const gst = Math.round(fee * gstRate);
  return { quote: quotePaise, fee, gst, total: quotePaise + fee + gst };
}
