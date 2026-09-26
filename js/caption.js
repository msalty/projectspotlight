import { tradeById } from './presets.js';

const tagify = (s) => '#' + String(s).replace(/&/g, 'and').replace(/[^A-Za-z0-9]+/g, '');

// Builds a ready-to-paste social caption from the project and client details.
export function buildCaption(p, c) {
  const lines = [];
  const head = [p.headline && p.headline !== 'Project Spotlight' ? p.headline : '', p.title].filter(Boolean).join(': ');
  if (head) lines.push(head + (p.location ? ` in ${p.location}` : ''));
  if (p.template === 'review' && p.review?.text) {
    lines.push(`“${p.review.text}”${p.review.name ? ` — ${p.review.name}` : ''}`);
  } else if (p.template === 'offer' && (p.offer?.headline || p.offer?.details)) {
    lines.push([p.offer.headline, p.offer.details].filter(Boolean).join(' — '));
  }
  if (p.description) lines.push(p.description);
  const perks = (c.badges || []).slice(0, 3).map((b) => `✔ ${b}`).join('  ');
  if (perks) lines.push(perks);
  const cta = [c.phone && `📞 ${c.phone}`, c.website && `🌐 ${c.website.replace(/^https?:\/\//, '')}`].filter(Boolean).join('  ');
  if (cta) lines.push(`${c.name ? `Ready for your project? Contact ${c.name}.` : 'Ready for your project? Get in touch.'}\n${cta}`);
  const tags = new Set();
  for (const t of (c.hashtags || tradeById(c.trade).hashtags || '').split(/[\s,]+/)) if (t) tags.add(t.startsWith('#') ? t : '#' + t);
  if (p.category) tags.add(tagify(p.category).toLowerCase());
  if (p.location) tags.add(tagify(p.location.split(',')[0]).toLowerCase());
  if (p.location) tags.add(tagify(p.location));
  tags.add('#beforeandafter');
  lines.push([...tags].slice(0, 12).join(' '));
  return lines.join('\n\n');
}

// Caption from the AI writer, with the business's contact line and hashtags added.
export function composeCaption(ai, c) {
  const contact = [c.phone && `📞 ${c.phone}`, c.website && `🌐 ${c.website.replace(/^https?:\/\//, '')}`].filter(Boolean).join('  ');
  const tags = (ai.hashtags || []).map((t) => (t.startsWith('#') ? t : '#' + t).replace(/\s+/g, '')).join(' ');
  return [String(ai.caption || '').trim(), contact, tags].filter(Boolean).join('\n\n');
}
