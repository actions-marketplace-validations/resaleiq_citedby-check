// What each check id and status means, in the words of the web check at https://citedby.eu/free-ai-visibility-check.
// The API sends ids and statuses only. A new id or status shows up as itself (see messageOf) until it gets a line here.

const DEFAULT_BOTS = ['OAI-SearchBot', 'GPTBot', 'PerplexityBot', 'Google-Extended', 'Bingbot'];
const NO_PRODUCT = 'No product page was found from the home page, so product data was not checked.';
const UNREADABLE = 'The page could not be read: the server sent no text to our request. This is not a verdict on your site. Run the check again.';

export const TITLES = {
  crawlers: 'AI crawlers allowed in robots.txt',
  raw_text: 'Text in the page HTML',
  org_schema: 'Organization data (JSON-LD)',
  product_schema: 'Product data (JSON-LD)',
  product_price: 'Price in product data',
  product_availability: 'Availability in product data',
  product_gtin: 'GTIN or barcode in product data',
  llms_txt: 'llms.txt',
};

export const STATUS_WORDS = { pass: 'OK', fail: 'Fix', warn: 'Check', info: 'Optional', na: 'Not checked', unknown: 'Not checked' };

const join = (list, fallback = '') => (Array.isArray(list) && list.length ? list.join(', ') : fallback);
const orList = (list) => {
  const l = Array.isArray(list) && list.length ? list : DEFAULT_BOTS;
  return l.length > 1 ? `${l.slice(0, -1).join(', ')} or ${l[l.length - 1]}` : l[0];
};

const MESSAGES = {
  crawlers: {
    pass: (c) => (c.robots_found === false ? 'No robots.txt found, so nothing is blocked.' : `None of ${orList(c.checked)} is blocked in robots.txt.`),
    fail: (c) => `robots.txt blocks: ${join(c.blocked)}. Fix: remove those Disallow rules, or the blanket Disallow for all robots. OAI-SearchBot is the crawler behind ChatGPT search. GPTBot is OpenAI's separate training crawler, so you can allow one and not the other.`,
  },
  raw_text: {
    pass: (c) => `${c.words} words of text are in the HTML a crawler receives.`,
    warn: (c) => `Only ${c.words} words of text are in the raw HTML. Fix: make sure brand and product text is in the page itself, not added by JavaScript after load.`,
    fail: (c) => `Only ${c.words} words are readable without JavaScript. Fix: render the homepage text on the server, so a crawler that does not run JavaScript still reads it.`,
    unknown: UNREADABLE,
  },
  org_schema: {
    pass: (c) => `Organization or business data found (${join(c.found)}).`,
    fail: 'No Organization or LocalBusiness data. Fix: add it as JSON-LD on the homepage with your name, logo, address or contact and social profiles, so assistants get your basic facts from one place.',
    unknown: UNREADABLE,
  },
  product_schema: {
    pass: 'Product data found.',
    fail: 'No Product data on the product page we checked. Fix: add Product JSON-LD with name, image, description and offers.',
    na: NO_PRODUCT,
  },
  product_price: {
    pass: 'A price is in the product data.',
    fail: 'No price in the product data. Fix: add offers.price and offers.priceCurrency, matching the price shown on the page.',
    na: NO_PRODUCT,
  },
  product_availability: {
    pass: 'Availability is in the product data.',
    fail: 'No availability in the product data. Fix: add offers.availability (for example InStock), kept in sync with your stock.',
    na: NO_PRODUCT,
  },
  product_gtin: {
    pass: 'A GTIN is in the product data.',
    warn: 'No GTIN. Fix: if your products carry barcodes, add gtin13 so the product can be matched across shops. Skip it for products with no barcode.',
    na: NO_PRODUCT,
  },
  llms_txt: {
    pass: 'An llms.txt file exists.',
    info: 'No llms.txt. Optional hygiene: it is cheap to add, but we do not expect it to change what AI assistants answer.',
  },
};

export function titleOf(c) {
  return TITLES[c.id] || String(c.id);
}

export function wordOf(status) {
  return STATUS_WORDS[status] || String(status);
}

export function messageOf(c) {
  const m = MESSAGES[c.id]?.[c.status];
  if (typeof m === 'function') return m(c);
  if (typeof m === 'string') return m;
  if (c.status === 'unknown') return UNREADABLE;
  if (c.status === 'na') return 'Not checked.';
  return c.status === 'pass' ? 'OK.' : `Status: ${c.status}.`;
}
