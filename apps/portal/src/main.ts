import '@ht/ui/tokens.css';
import './style.css';
import data from '../services.json';
import pkg from '../package.json';

interface Service {
  id: string;
  audience: string;
  title: string;
  summary: string;
  cta: string;
  href: string;
  tone: 'forest' | 'cream';
  emoji: string;
  tag?: string;
  /** 'soon'이면 링크 없이 "곧 열려요"로 보인다 */
  status?: 'live' | 'soon';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderService(s: Service): HTMLLIElement {
  const soon = s.status === 'soon';
  const card = soon ? el('div', 'tile') : el('a', 'tile');
  card.classList.add(`tile--${s.tone}`);
  card.dataset.testid = `service-${s.id}`;
  if (card instanceof HTMLAnchorElement) card.href = s.href;
  else card.setAttribute('aria-disabled', 'true');

  const art = el('span', 'tile__art', s.emoji);
  art.setAttribute('aria-hidden', 'true');

  const meta = el('p', 'tile__meta');
  meta.append(el('span', 'tile__audience', s.audience));
  if (s.tag) meta.append(el('span', 'tile__tag', s.tag));

  card.append(art, meta, el('h2', 'tile__title', s.title), el('p', 'tile__summary', s.summary), el('span', 'tile__cta', soon ? '곧 열려요' : s.cta));

  const item = el('li', 'portal__item');
  item.append(card);
  return item;
}

const list = document.getElementById('services');
list?.replaceChildren(...(data.services as Service[]).map(renderService));
const version = document.getElementById('version');
if (version) version.textContent = `v${pkg.version}`;
