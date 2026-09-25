import { FONT_PAIRS, TEMPLATES } from "./registry";
import type { ImageRef, PreviewConfig } from "@/types/preview";

/**
 * Renders a PreviewConfig into a single self-contained static HTML page.
 * Every dynamic value is HTML-escaped; no AI output is ever executed or
 * injected as markup. The page ships no JavaScript.
 */

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function safeHref(href: string): string {
  const h = href.trim();
  if (/^(https?:|mailto:|tel:|#)/i.test(h)) return esc(h);
  return "#contact";
}

function mixHex(hex: string, withHex: string, amount: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [p(hex), p(withHex)];
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, "0")).join("")}`;
}

function isDark(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45;
}

function imageOrPattern(img: ImageRef | null | undefined, className: string, label: string) {
  if (img) {
    return `<img class="${className}" src="${esc(img.url)}" alt="${esc(img.alt)}" loading="lazy" referrerpolicy="no-referrer">`;
  }
  return `<div class="${className} pattern" role="img" aria-label="${esc(label)}"></div>`;
}

const ICONS: Record<string, string> = {
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};
const icon = (name: keyof typeof ICONS) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

export function renderPreviewHtml(config: PreviewConfig, opts: { watermark?: boolean } = { watermark: true }): string {
  const t = TEMPLATES[config.templateKey];
  const fonts = FONT_PAIRS[config.fontPair];
  const c = config.colors;
  const dark = isDark(c.background);
  const muted = mixHex(c.text, c.background, 0.35);
  const border = mixHex(c.text, c.background, 0.85);
  const onPrimary = isDark(c.primary) ? "#ffffff" : "#111111";
  const onAccent = isDark(c.accent) ? "#ffffff" : "#111111";
  const k = config.content;
  const fontQuery = [...new Set([fonts.heading, fonts.body])]
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`)
    .join("&");

  const offerings = k.offerings.length
    ? k.offerings.map((o) => `<article class="card"><h3>${esc(o.title)}</h3><p>${esc(o.description)}</p></article>`).join("")
    : k.offeringsPlaceholder
        .map(
          (label) =>
            `<article class="card placeholder"><span class="tag">Your content here</span><h3>${esc(label)}</h3><p>This section will show your real ${esc(label.toLowerCase())} — added with you before launch.</p></article>`,
        )
        .join("");

  const gallery = config.images.gallery.length
    ? config.images.gallery.map((img) => `<figure>${imageOrPattern(img, "gimg", img.alt)}</figure>`).join("")
    : [0, 1, 2].map((i) => `<figure>${imageOrPattern(null, `gimg p${i}`, "Photo placeholder")}<figcaption>Your photos here</figcaption></figure>`).join("");

  const credits = [config.images.hero, ...config.images.gallery]
    .filter((i): i is ImageRef => Boolean(i && i.attribution))
    .map((i) => (i.attributionUrl ? `<a href="${esc(i.attributionUrl)}" rel="noopener" target="_blank">${esc(i.attribution)}</a>` : esc(i.attribution)))
    .join(", ");

  const contactRows = [
    k.contact.phone && `<li>${icon("phone")}<a href="tel:${esc(k.contact.phone.replace(/[^+\d]/g, ""))}">${esc(k.contact.phone)}</a></li>`,
    k.contact.email && `<li>${icon("mail")}<a href="mailto:${esc(k.contact.email)}">${esc(k.contact.email)}</a></li>`,
    (k.contact.address || k.contact.city) &&
      `<li>${icon("pin")}<span>${esc([k.contact.address, k.contact.city && !k.contact.address?.includes(k.contact.city) ? k.contact.city : null].filter(Boolean).join(", "))}</span></li>`,
  ]
    .filter(Boolean)
    .join("");

  const mapUrl = k.contact.mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(k.contact.mapQuery)}` : null;
  const social = Object.entries(k.social)
    .map(([name, url]) => `<a href="${esc(url)}" rel="noopener" target="_blank">${esc(name.charAt(0).toUpperCase() + name.slice(1))}</a>`)
    .join("");
  const year = new Date(config.generatedAt).getFullYear();

  const heroInner = `
      <p class="eyebrow">${esc(t.name === "Momentum" ? "Train with us" : [k.contact.city, k.contact.country].filter(Boolean).join(" · "))}</p>
      <h1>${esc(config.headline)}</h1>
      ${config.subheadline ? `<p class="lede">${esc(config.subheadline)}</p>` : ""}
      <div class="ctas">
        <a class="btn primary" href="${safeHref(config.primaryCTA.href)}">${esc(config.primaryCTA.label)}</a>
        ${config.secondaryCTA ? `<a class="btn ghost" href="${safeHref(config.secondaryCTA.href)}">${esc(config.secondaryCTA.label)}</a>` : ""}
      </div>
      ${k.rating ? `<p class="rating">${icon("star")}<strong>${k.rating.value.toFixed(1)}</strong> from ${k.rating.count} reviews <span>(${esc(k.rating.source)})</span></p>` : ""}`;

  const hero =
    t.layout === "split"
      ? `<section class="hero split"><div class="wrap grid2"><div>${heroInner}</div>${imageOrPattern(config.images.hero, "hero-img", `${config.businessName}`)}</div></section>`
      : t.layout === "fullbleed"
        ? `<section class="hero full">${imageOrPattern(config.images.hero, "hero-bg", `${config.businessName}`)}<div class="scrim"></div><div class="wrap">${heroInner}</div></section>`
        : `<section class="hero centered"><div class="wrap narrow">${heroInner}</div></section>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(config.seo.title)}</title>
<meta name="description" content="${esc(config.seo.description)}">
<meta property="og:title" content="${esc(config.seo.title)}">
<meta property="og:description" content="${esc(config.seo.description)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${fontQuery}&display=swap" rel="stylesheet">
<style>
:root{--primary:${c.primary};--accent:${c.accent};--bg:${c.background};--surface:${c.surface};--text:${c.text};--muted:${muted};--border:${border};--on-primary:${onPrimary};--on-accent:${onAccent};--hf:"${fonts.heading}",Georgia,serif;--bf:"${fonts.body}",system-ui,sans-serif;color-scheme:${dark ? "dark" : "light"}}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:var(--bf);background:var(--bg);color:var(--text);line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:inherit}
img{display:block;max-width:100%}
.wrap{width:min(1120px,100% - 40px);margin-inline:auto}
.narrow{max-width:760px;text-align:center}
h1,h2,h3{font-family:var(--hf);line-height:1.1;letter-spacing:-.01em}
h1{font-size:clamp(2.4rem,6vw,4.4rem);font-weight:600}
h2{font-size:clamp(1.8rem,3.5vw,2.6rem);font-weight:600;margin-bottom:.6em}
h3{font-size:1.25rem;font-weight:600;margin-bottom:.35em}
.icon{width:18px;height:18px;flex:none}
.banner{background:var(--text);color:var(--bg);font-size:.8rem;text-align:center;padding:.5rem 1rem}
.banner strong{font-weight:600}
nav{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--border)}
nav .wrap{display:flex;align-items:center;justify-content:space-between;height:68px;gap:1rem}
.brand{font-family:var(--hf);font-size:1.3rem;font-weight:600;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.links{display:flex;gap:1.6rem;font-size:.92rem}
.links a{text-decoration:none;color:var(--muted)}
.links a:hover{color:var(--text)}
.btn{display:inline-flex;align-items:center;gap:.5rem;padding:.85rem 1.4rem;border-radius:999px;font-weight:600;text-decoration:none;font-size:.95rem;transition:transform .15s ease,box-shadow .15s ease}
.btn:hover{transform:translateY(-1px);box-shadow:0 8px 24px -10px var(--primary)}
.btn.primary{background:var(--primary);color:var(--on-primary)}
.btn.ghost{border:1.5px solid currentColor}
.btn.small{padding:.55rem 1rem;font-size:.85rem}
.hero{position:relative;overflow:hidden}
.hero .eyebrow{text-transform:uppercase;letter-spacing:.18em;font-size:.78rem;color:var(--accent);font-weight:600;margin-bottom:1rem}
.hero .lede{font-size:1.2rem;color:var(--muted);margin-top:1.1rem;max-width:36rem}
.narrow .lede{margin-inline:auto}
.ctas{display:flex;flex-wrap:wrap;gap:.8rem;margin-top:2rem}
.narrow .ctas{justify-content:center}
.rating{display:flex;align-items:center;gap:.4rem;margin-top:1.6rem;font-size:.95rem}
.narrow .rating{justify-content:center}
.rating .icon{color:var(--accent);fill:var(--accent)}
.rating span{color:var(--muted)}
.hero.split{padding:5rem 0}
.grid2{display:grid;grid-template-columns:1.1fr 1fr;gap:3.5rem;align-items:center}
.hero-img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:28px}
.hero.full{min-height:86vh;display:flex;align-items:flex-end;padding:6rem 0 5rem;color:#fff}
.hero.full .lede,.hero.full .rating span{color:rgba(255,255,255,.85)}
.hero.full .btn.ghost{color:#fff}
.hero-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.15) 0%,rgba(0,0,0,.65) 100%)}
.hero.full .wrap{position:relative}
.hero-bg.pattern{position:absolute}
.hero.full .eyebrow{color:#fff;opacity:.85}
.hero.full .btn.primary{background:var(--accent);color:var(--on-accent)}
.hero.centered{padding:7rem 0 6rem;background:radial-gradient(1200px 500px at 50% -10%,color-mix(in srgb,var(--accent) 22%,transparent),transparent)}
.pattern{background:linear-gradient(135deg,var(--primary),var(--accent));position:relative}
.pattern::after{content:"";position:absolute;inset:0;opacity:.18;background-image:radial-gradient(circle at 1px 1px,#fff 1px,transparent 0);background-size:18px 18px}
.p1{background:linear-gradient(135deg,var(--accent),var(--primary))}
.p2{background:linear-gradient(200deg,var(--primary),var(--surface))}
section.block{padding:5.5rem 0}
section.alt{background:var(--surface)}
.kicker{color:var(--accent);font-weight:600;text-transform:uppercase;letter-spacing:.14em;font-size:.75rem;margin-bottom:.8rem}
.about{display:grid;grid-template-columns:1fr 1fr;gap:3rem;align-items:start}
.about p{font-size:1.1rem;color:var(--muted)}
.highlights{list-style:none;display:grid;gap:.9rem}
.highlights li{display:flex;gap:.7rem;align-items:flex-start;padding:1rem 1.2rem;background:var(--bg);border:1px solid var(--border);border-radius:14px}
.highlights .icon{color:var(--accent);margin-top:3px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1.2rem;margin-top:2rem}
.card{background:var(--bg);border:1px solid var(--border);border-radius:18px;padding:1.6rem}
.card p{color:var(--muted);font-size:.95rem}
.card.placeholder{border-style:dashed}
.tag{display:inline-block;font-size:.7rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--text);padding:.25rem .6rem;border-radius:999px;margin-bottom:.9rem}
.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-top:2rem}
.gallery figure{position:relative;overflow:hidden;border-radius:18px}
.gimg{width:100%;aspect-ratio:4/3;object-fit:cover}
.gallery figcaption{position:absolute;left:12px;bottom:10px;font-size:.75rem;color:#fff;background:rgba(0,0,0,.35);padding:.2rem .55rem;border-radius:999px}
.cta-band{background:var(--primary);color:var(--on-primary);border-radius:28px;padding:3.5rem;display:flex;align-items:center;justify-content:space-between;gap:2rem;flex-wrap:wrap}
.cta-band h2{margin:0}
.cta-band .btn{background:var(--accent);color:var(--on-accent)}
.contact{display:grid;grid-template-columns:1fr 1fr;gap:3rem}
.contact ul{list-style:none;display:grid;gap:1rem;font-size:1.05rem}
.contact li{display:flex;gap:.8rem;align-items:center}
.contact li .icon{color:var(--accent)}
.mapcard{border-radius:22px;border:1px solid var(--border);background:var(--surface);padding:2rem;display:flex;flex-direction:column;justify-content:space-between;min-height:220px}
.mapcard p{color:var(--muted)}
footer{border-top:1px solid var(--border);padding:2.5rem 0;font-size:.85rem;color:var(--muted)}
footer .wrap{display:flex;justify-content:space-between;gap:1.5rem;flex-wrap:wrap}
footer .social{display:flex;gap:1rem}
@media (max-width:860px){
  .links{display:none}
  .grid2,.about,.contact{grid-template-columns:1fr}
  .hero.split{padding:3rem 0}
  .hero-img{aspect-ratio:4/3}
  .gallery{grid-template-columns:1fr 1fr}
  .cta-band{padding:2.2rem}
  section.block{padding:4rem 0}
}
@media (max-width:520px){.gallery{grid-template-columns:1fr}.nav-cta{display:none}}
</style>
</head>
<body>
${opts.watermark !== false ? `<div class="banner"><strong>Website concept</strong> prepared for ${esc(config.businessName)} — not an official website. Content and photos are illustrative.</div>` : ""}
<nav><div class="wrap">
  <a class="brand" href="#top">${esc(config.businessName)}</a>
  <div class="links"><a href="#about">About</a><a href="#offerings">${esc(k.offeringsTitle)}</a><a href="#gallery">Gallery</a><a href="#contact">Contact</a></div>
  <a class="btn primary small nav-cta" href="${safeHref(config.primaryCTA.href)}">${esc(config.primaryCTA.label)}</a>
</div></nav>
<main id="top">
${hero}
<section class="block" id="about"><div class="wrap about">
  <div><p class="kicker">About</p><h2>${esc(config.businessName)}</h2>${k.about ? `<p>${esc(k.about)}</p>` : `<p>Your story goes here — who you are, what makes you different, and why locals keep coming back.</p>`}</div>
  ${k.highlights.length ? `<ul class="highlights">${k.highlights.map((h) => `<li>${icon("check")}<span>${esc(h)}</span></li>`).join("")}</ul>` : ""}
</div></section>
<section class="block alt" id="offerings"><div class="wrap">
  <p class="kicker">${esc(t.name)}</p><h2>${esc(k.offeringsTitle)}</h2>
  <div class="cards">${offerings}</div>
</div></section>
<section class="block" id="gallery"><div class="wrap">
  <p class="kicker">Gallery</p><h2>A look inside</h2>
  <div class="gallery">${gallery}</div>
</div></section>
<section class="block" id="contact"><div class="wrap">
  <div class="cta-band"><h2>${esc(config.primaryCTA.label)}</h2><a class="btn" href="${safeHref(config.primaryCTA.href)}">${esc(k.contact.phone ? "Call us" : "Get in touch")}</a></div>
  <div class="contact" style="margin-top:4rem">
    <div><p class="kicker">Visit &amp; contact</p><h2>Find us</h2><ul>${contactRows || "<li>Contact details will be added here.</li>"}</ul></div>
    <div class="mapcard"><div><h3>${esc(k.contact.city ?? "Location")}</h3><p>${esc(k.contact.address ?? "")}</p></div>${mapUrl ? `<a class="btn primary" href="${esc(mapUrl)}" target="_blank" rel="noopener">${icon("pin")} Open in Maps</a>` : ""}</div>
  </div>
</div></section>
</main>
<footer><div class="wrap">
  <span>© ${year} ${esc(config.businessName)}</span>
  ${social ? `<span class="social">${social}</span>` : ""}
  ${credits ? `<span>Photos: ${credits}</span>` : ""}
</div></footer>
</body>
</html>`;
}
