import { FONT_PAIRS, TEMPLATES, type Palette, type TemplateDefinition } from "./registry";
import { icon } from "./icons";
import { esc, isDark, luminance, mix, monogram, onColor, photoCredits, picture, safeHref, stars } from "./shared";
import { INDUSTRIAL_CSP_EXTRA, renderIndustrialHtml } from "./industrial";
import type { ImageRef, PreviewConfig } from "@/types/preview";

/**
 * Renders a PreviewConfig into one self-contained static HTML page.
 *
 * Design read: concept homepage for a local business, shown to its owner.
 * Warm, photo-led, premium-consumer language (dials: variance 7, motion 6, density 3).
 *
 * - Every dynamic value is HTML-escaped; AI output is never injected as markup.
 * - No JavaScript (the page is served with a strict CSP). All motion is CSS:
 *   load-in keyframes, scroll-driven animations (animation-timeline) for
 *   reveals and parallax, hover transitions. Everything is disabled under
 *   prefers-reduced-motion, and browsers without scroll timelines get a
 *   static, fully visible page.
 * - Light and dark mode: dark tokens are derived from the template palette.
 */

// ───────────────────────── colour helpers ─────────────────────────

function tokens(p: Palette) {
  return {
    bg: p.background,
    surface: p.surface,
    ink: p.text,
    muted: mix(p.text, p.background, 0.38),
    line: mix(p.text, p.background, 0.86),
    accent: p.accent,
    onAccent: onColor(p.accent),
    deep: p.primary,
    onDeep: onColor(p.primary),
  };
}

/** Dark-mode tokens derived from a light palette (keeps the brand accent recognisable). */
function darkTokens(p: Palette) {
  const bg = mix(p.primary, "#0b0c0d", 0.55);
  const ink = mix(p.background, "#ffffff", 0.25);
  const accent = luminance(p.accent) < 0.12 ? mix(p.accent, "#ffffff", 0.3) : p.accent;
  return {
    bg,
    surface: mix(bg, "#ffffff", 0.06),
    ink,
    muted: mix(ink, bg, 0.35),
    line: mix(ink, bg, 0.84),
    accent,
    onAccent: onColor(accent),
    deep: mix(bg, "#000000", 0.35),
    onDeep: ink,
  };
}

function tokenCss(t: ReturnType<typeof tokens>) {
  return Object.entries(t)
    .map(([k, v]) => `--${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v}`)
    .join(";");
}

function paletteFor(t: TemplateDefinition, cfg: PreviewConfig): Palette {
  return t.palettes.find((p) => p.accent.toLowerCase() === cfg.colors.accent.toLowerCase()) ?? t.palettes[0];
}

// ───────────────────────── images ─────────────────────────

/**
 * Assigns stored images to page roles.
 * `gallery` order (see images.ts): about, about-2, band, offers x3, gallery x4, visit.
 */
function allocate(cfg: PreviewConfig) {
  const g = cfg.images.gallery;
  const pool = [cfg.images.hero, ...g].filter((x): x is ImageRef => Boolean(x));
  const gAt = (i: number) => (g.length ? g[i % g.length] : pool.length ? pool[i % pool.length] : null);
  return {
    hero: cfg.images.hero ?? gAt(0),
    hero2: gAt(1),
    about: gAt(0),
    about2: gAt(1),
    band: gAt(2),
    offers: [gAt(3), gAt(4), gAt(5)],
    gallery: [gAt(6), gAt(7), gAt(8), gAt(9), gAt(3), gAt(0)],
    visit: gAt(10),
  };
}

const SOCIAL_ICONS: Record<string, "instagram" | "facebook" | "tiktok"> = { instagram: "instagram", facebook: "facebook", tiktok: "tiktok" };

// ───────────────────────── page ─────────────────────────

const BASE_CSP =
  "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'self'; base-uri 'none'; form-action 'none'";

/** Content-Security-Policy for a rendered preview. Only the industrial layout runs (hash-pinned) scripts. */
export function previewCsp(config: PreviewConfig): string {
  return TEMPLATES[config.templateKey].layout === "industrial" ? `${BASE_CSP}; ${INDUSTRIAL_CSP_EXTRA}` : BASE_CSP;
}

export function renderPreviewHtml(config: PreviewConfig, opts: { watermark?: boolean } = { watermark: true }): string {
  const t = TEMPLATES[config.templateKey];
  if (t.layout === "industrial") return renderIndustrialHtml(config, opts);
  const fonts = FONT_PAIRS[t.defaultFontPair];
  const palette = paletteFor(t, config);
  const light = tokens(palette);
  const darkByDesign = isDark(palette.background);
  const dark = darkByDesign ? null : darkTokens(palette);
  const k = config.content;
  const im = allocate(config);

  const fontQuery = [...new Set([fonts.heading, fonts.body])]
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500`)
    .join("&");

  const where = [k.contact.city, k.contact.country].filter(Boolean).join(", ");
  const mapUrl = k.contact.mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(k.contact.mapQuery)}` : null;
  const primary = { label: config.primaryCTA.label, href: safeHref(config.primaryCTA.href) };
  const directionsLabel = "Get directions";
  const f = config.features;
  const tel = k.contact.phone ? `tel:${k.contact.phone.replace(/[^+\d]/g, "")}` : null;
  // Click-to-call sits next to the primary CTA whenever the primary isn't already the phone link.
  const secondaryBtn =
    tel && !primary.href.startsWith("tel:")
      ? `<a class="btn btn-ghost" href="${esc(tel)}">${icon("phone", "btn-icon-l")}Call ${esc(k.contact.phone)}</a>`
      : mapUrl
        ? `<a class="btn btn-ghost" href="${esc(mapUrl)}" target="_blank" rel="noopener">${icon("navigation", "btn-icon-l")}${directionsLabel}</a>`
        : "";

  const ctas = `
    <div class="ctas">
      <a class="btn btn-accent" href="${primary.href}">${esc(primary.label)}${icon("arrowRight", "btn-icon")}</a>
      ${secondaryBtn}
    </div>`;

  // ── Hero (max 4 text elements: eyebrow, headline, subtext, CTAs)
  const heroCopy = `
      ${where ? `<p class="eyebrow load" style="--i:0">${esc(where)}</p>` : ""}
      <h1 class="load" style="--i:1">${esc(config.headline)}</h1>
      ${config.subheadline ? `<p class="lede load" style="--i:2">${esc(config.subheadline)}</p>` : ""}
      <div class="load" style="--i:3">${ctas}</div>`;

  const hero =
    t.layout === "fullbleed"
      ? `<section class="hero hero-full" id="top">
          <div class="hero-media">${picture(im.hero, { cls: "kb", eager: true, label: config.businessName, variant: 0 })}</div>
          <div class="hero-scrim"></div>
          <div class="hero-inner">${heroCopy}</div>
        </section>`
      : `<section class="hero hero-split" id="top">
          <div class="wrap hero-grid">
            <div class="hero-copy">${heroCopy}</div>
            <div class="collage load" style="--i:2">
              <figure class="collage-a">${picture(im.hero, { cls: "kb", eager: true, sizes: "(min-width: 980px) 42vw, 90vw", label: config.businessName, variant: 0 })}</figure>
              <figure class="collage-b drift">${picture(im.hero2, { sizes: "(min-width: 980px) 20vw, 45vw", label: "Detail photo", variant: 1 })}</figure>
            </div>
          </div>
        </section>`;

  // ── Ribbon (the one marquee on the page)
  const ribbonItems = [
    k.rating ? `${k.rating.value.toFixed(1)} rating from ${k.rating.count} reviews` : null,
    ...k.highlights,
    where || null,
  ].filter((x): x is string => Boolean(x));
  const uniqueRibbon = [...new Set(ribbonItems)];
  const ribbon =
    uniqueRibbon.length >= 2
      ? `<div class="ribbon" aria-label="Highlights"><div class="ribbon-track">${[0, 1]
          .map((n) => `<ul${n ? ' aria-hidden="true"' : ""}>${[...uniqueRibbon, ...uniqueRibbon].map((x) => `<li>${icon("sparkle", "ribbon-icon")}${esc(x)}</li>`).join("")}</ul>`)
          .join("")}</div></div>`
      : "";

  // ── About (offset photo collage + story)
  const aboutText =
    k.about ?? `This is where the story of ${config.businessName} goes: who you are, what you love doing, and why people keep coming back.`;
  const about = `
  <section class="section about" id="about">
    <div class="wrap about-grid">
      <div class="about-media sr">
        <figure class="about-main">${picture(im.about, { sizes: "(min-width: 980px) 38vw, 90vw", label: "About photo", variant: 1 })}</figure>
        <figure class="about-inset drift">${picture(im.about2, { sizes: "(min-width: 980px) 18vw, 40vw", label: "Detail photo", variant: 2 })}</figure>
      </div>
      <div class="about-copy sr">
        <h2>${esc(t.aboutTitle)}</h2>
        <p class="body-lg">${esc(aboutText)}</p>
        ${k.highlights.length ? `<ul class="checks">${k.highlights.map((h) => `<li>${icon("check", "check")}<span>${esc(h)}</span></li>`).join("")}</ul>` : ""}
      </div>
    </div>
  </section>`;

  // ── Offerings (bento: cell count = item count)
  const items = k.offerings.length
    ? k.offerings.slice(0, 3).map((o) => ({ title: o.title, text: o.description, placeholder: false }))
    : k.offeringsPlaceholder.slice(0, 3).map((label) => ({
        title: label,
        text: `Your real ${label.toLowerCase()} will go here, written with you before launch.`,
        placeholder: true,
      }));
  const offerings = `
  <section class="section offers" id="offerings">
    <div class="wrap">
      <h2 class="sr">${esc(k.offeringsTitle)}</h2>
      <div class="bento bento-${items.length}">
        ${items
          .map(
            (it, i) => `
          <article class="tile tile-${i} sr" style="--i:${i}">
            <figure class="tile-media">${picture(im.offers[i] ?? null, { sizes: i === 0 ? "(min-width: 980px) 55vw, 90vw" : "(min-width: 980px) 35vw, 90vw", label: it.title, variant: i + 1 })}</figure>
            <div class="tile-body">
              <h3>${esc(it.title)}</h3>
              <p>${esc(it.text)}</p>
              ${it.placeholder ? `<span class="note">Sample section</span>` : ""}
            </div>
          </article>`,
          )
          .join("")}
      </div>
    </div>
  </section>`;

  // ── Parallax band (the page's one centred statement)
  const band = `
  <section class="band" aria-label="${esc(t.statement)}">
    <div class="band-media">${picture(im.band, { sizes: "100vw", label: "Atmosphere photo", variant: 3 })}</div>
    <div class="band-scrim"></div>
    <p class="band-text sr">${esc(t.statement)}</p>
  </section>`;

  // ── Gallery (mosaic with varied spans)
  const gallery = `
  <section class="section gallery-sec" id="gallery">
    <div class="wrap">
      <h2 class="sr">${esc(t.galleryTitle)}</h2>
      <div class="mosaic">
        ${im.gallery
          .map((g, i) => `<figure class="m m-${i} sr" style="--i:${i % 3}">${picture(g, { sizes: "(min-width: 980px) 33vw, 90vw", label: "Gallery photo", variant: i })}</figure>`)
          .join("")}
      </div>
    </div>
  </section>`;

  // ── Reviews (real rating only; no invented testimonials)
  const reviews = k.rating
    ? `
  <section class="section reviews" id="reviews">
    <div class="wrap reviews-grid">
      <div class="score sr">
        <p class="score-num">${k.rating.value.toFixed(1)}</p>
        ${stars(k.rating.value)}
        <p class="score-meta">Average from ${k.rating.count} reviews</p>
        ${mapUrl ? `<a class="link" href="${esc(mapUrl)}" target="_blank" rel="noopener">Read the reviews${icon("arrowUpRight", "link-icon")}</a>` : ""}
      </div>
      <div class="quotes">
        ${[0, 1]
          .map(
            (i) =>
              `<figure class="quote sr" style="--i:${i}">${icon("quotes", "quote-mark")}<blockquote>Your favourite customer review will appear here, word for word.</blockquote><figcaption>Chosen with you before launch</figcaption></figure>`,
          )
          .join("")}
      </div>
    </div>
  </section>`
    : "";

  // ── Visit
  const addressLine = [k.contact.address, k.contact.city && !k.contact.address?.includes(k.contact.city) ? k.contact.city : null].filter(Boolean).join(", ");
  const contactRows = [
    addressLine ? `<li>${icon("pin", "row-icon")}<div><p class="row-label">Address</p><p>${esc(addressLine)}</p></div></li>` : "",
    k.contact.phone
      ? `<li>${icon("phone", "row-icon")}<div><p class="row-label">Phone</p><p><a href="tel:${esc(k.contact.phone.replace(/[^+\d]/g, ""))}">${esc(k.contact.phone)}</a></p></div></li>`
      : "",
    k.contact.email
      ? `<li>${icon("mail", "row-icon")}<div><p class="row-label">Email</p><p><a href="mailto:${esc(k.contact.email)}">${esc(k.contact.email)}</a></p></div></li>`
      : "",
    f.serviceArea ? `<li>${icon("navigation", "row-icon")}<div><p class="row-label">Service area</p><p>${esc(f.serviceArea)}</p></div></li>` : "",
    `<li>${icon("clock", "row-icon")}<div><p class="row-label">Opening hours</p><p class="muted">Added with you before launch</p></div></li>`,
  ].join("");
  const visit = `
  <section class="section visit" id="visit">
    <div class="wrap visit-grid">
      <div class="visit-copy sr">
        <h2>Find us</h2>
        <ul class="rows">${contactRows}</ul>
        ${mapUrl ? `<a class="btn btn-ghost-ink" href="${esc(mapUrl)}" target="_blank" rel="noopener">${icon("navigation", "btn-icon-l")}${directionsLabel}</a>` : ""}
      </div>
      <figure class="visit-media sr">${picture(im.visit, { sizes: "(min-width: 980px) 45vw, 90vw", label: "Location photo", variant: 2 })}</figure>
    </div>
  </section>`;

  // ── Quote / contact form (demo: no JavaScript on the page, so it doesn't submit)
  const quote =
    f.quoteForm || f.freeEstimate
      ? `
  <section class="section quote-sec" id="quote">
    <div class="wrap quote-grid">
      <div class="sr">
        <h2>${f.freeEstimate ? "Request a free estimate" : "Send us a message"}</h2>
        <p class="body-lg muted">${f.freeEstimate ? `Tell us about the job and ${esc(config.businessName)} will get back to you with an estimate.` : `Questions or bookings — send a message and ${esc(config.businessName)} will get back to you.`}</p>
        ${tel ? `<a class="link" href="${esc(tel)}">${icon("phone", "link-icon")}Prefer to talk? Call ${esc(k.contact.phone)}</a>` : ""}
      </div>
      <form class="qform sr" aria-label="${f.freeEstimate ? "Estimate request" : "Contact"} form">
        <label>Name<input name="name" autocomplete="name"></label>
        <label>Phone<input name="phone" type="tel" autocomplete="tel"></label>
        <label class="full">Email<input name="email" type="email" autocomplete="email"></label>
        <label class="full">${f.freeEstimate ? "What do you need done?" : "Message"}<textarea name="message" rows="4"></textarea></label>
        <button class="btn btn-accent full" type="button">${f.freeEstimate ? "Request my free estimate" : "Send message"}</button>
        <p class="note full">Preview only — on the live site, enquiries go straight to your inbox.</p>
      </form>
    </div>
  </section>`
      : "";

  // Mobile click-to-call bar
  const callBar = tel ? `<a class="callbar" href="${esc(tel)}">${icon("phone", "btn-icon-l")}Call now</a>` : "";

  // ── Closing CTA (same label as the primary CTA: one label per intent)
  const closing = `
  <section class="closing">
    <div class="wrap closing-inner sr">
      <h2>${esc(t.closing)}</h2>
      <a class="btn btn-on-deep" href="${primary.href}">${esc(primary.label)}${icon("arrowRight", "btn-icon")}</a>
    </div>
  </section>`;

  // ── Footer
  const social = Object.entries(k.social)
    .map(([name, url]) => {
      const ic = SOCIAL_ICONS[name.toLowerCase()];
      return `<a href="${esc(url)}" target="_blank" rel="noopener" aria-label="${esc(name)}">${ic ? icon(ic, "social-icon") : esc(name.slice(0, 2))}</a>`;
    })
    .join("");
  const credits = photoCredits([config.images.hero, ...config.images.gallery]);
  const year = new Date(config.generatedAt).getFullYear();

  const navLinks = `<a href="#about">About</a><a href="#offerings">${esc(k.offeringsTitle)}</a><a href="#gallery">Gallery</a><a href="#visit">Visit</a>`;

  const footer = `
  <footer class="footer">
    <div class="wrap footer-grid">
      <div>
        <a class="brand brand-foot" href="#top">${monogram(config.businessName)}<span>${esc(config.businessName)}</span></a>
        ${where ? `<p class="foot-muted">${esc(where)}</p>` : ""}
        ${social ? `<div class="social">${social}</div>` : ""}
      </div>
      <nav class="foot-links" aria-label="Footer">${navLinks}</nav>
      <div class="foot-contact">
        ${k.contact.phone ? `<a href="tel:${esc(k.contact.phone.replace(/[^+\d]/g, ""))}">${esc(k.contact.phone)}</a>` : ""}
        ${k.contact.email ? `<a href="mailto:${esc(k.contact.email)}">${esc(k.contact.email)}</a>` : ""}
      </div>
    </div>
    <div class="wrap foot-base">
      <span>© ${year} ${esc(config.businessName)}</span>
      ${credits ? `<span>Photos: ${credits}</span>` : ""}
    </div>
  </footer>`;

  const banner =
    opts.watermark !== false
      ? `<div class="concept"><strong>Website concept</strong> for ${esc(config.businessName)}. Not an official website: photos and some content are illustrative.</div>`
      : "";

  const nav = `
  <header class="nav">
    <div class="wrap nav-inner">
      <a class="brand" href="#top">${monogram(config.businessName)}<span>${esc(config.businessName)}</span></a>
      <nav class="nav-links" aria-label="Main">${navLinks}</nav>
      <a class="btn btn-accent btn-sm nav-cta" href="${primary.href}">${esc(primary.label)}</a>
    </div>
  </header>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="${darkByDesign ? "dark" : "light dark"}">
<title>${esc(config.seo.title)}</title>
<meta name="description" content="${esc(config.seo.description)}">
<meta property="og:title" content="${esc(config.seo.title)}">
<meta property="og:description" content="${esc(config.seo.description)}">
${im.hero ? `<meta property="og:image" content="${esc(im.hero.url)}">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${fontQuery}&display=swap" rel="stylesheet">
<style>
:root{${tokenCss(light)};--hf:"${fonts.heading}",Georgia,serif;--bf:"${fonts.body}",system-ui,sans-serif;--hw:${t.headingWeight};--r:18px;--ease:cubic-bezier(.16,1,.3,1)}
${dark ? `@media (prefers-color-scheme:dark){:root{${tokenCss(dark)}}}` : ""}
${CSS}
</style>
</head>
<body>
${banner}
${nav}
<main>
${hero}
${ribbon}
${about}
${offerings}
${band}
${gallery}
${reviews}
${visit}
${quote}
${closing}
</main>
${footer}
${callBar}
</body>
</html>`;
}

// ───────────────────────── stylesheet ─────────────────────────

const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{font-family:var(--bf);background:var(--bg);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{display:block;width:100%;height:100%;object-fit:cover}
a{color:inherit;text-decoration:none}
.wrap{width:min(1240px,100% - 48px);margin-inline:auto}
h1,h2,h3{font-family:var(--hf);font-weight:var(--hw);line-height:1.08;letter-spacing:-.015em;text-wrap:balance}
h1{font-size:clamp(2.5rem,5.4vw,4.6rem)}
h2{font-size:clamp(2rem,3.6vw,3.1rem);margin-bottom:1.2rem}
h3{font-size:1.35rem;line-height:1.2}
p{text-wrap:pretty}
.muted{color:var(--muted)}
svg{flex:none}

/* concept banner + nav */
.concept{background:var(--deep);color:var(--on-deep);font-size:.78rem;text-align:center;padding:.5rem 1rem}
.nav{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 78%,transparent);backdrop-filter:blur(14px) saturate(160%);-webkit-backdrop-filter:blur(14px) saturate(160%);border-bottom:1px solid transparent}
.nav-inner{display:flex;align-items:center;justify-content:space-between;gap:1.5rem;height:70px}
.brand{display:inline-flex;align-items:center;gap:.7rem;font-family:var(--hf);font-weight:var(--hw);font-size:1.2rem;min-width:0}
.brand span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mark{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:var(--accent);color:var(--on-accent);font-family:var(--bf);font-weight:700;font-size:.8rem;letter-spacing:.04em;flex:none}
.nav-links{display:flex;gap:2rem;font-size:.93rem}
.nav-links a{color:var(--muted);transition:color .25s}
.nav-links a:hover{color:var(--ink)}

/* buttons: one pill system across the page */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.55rem;height:52px;padding:0 1.6rem;border-radius:999px;font-weight:600;font-size:.97rem;white-space:nowrap;transition:transform .35s var(--ease),background-color .25s,color .25s,border-color .25s,box-shadow .35s var(--ease)}
.btn:active{transform:translateY(1px) scale(.98)}
.btn-sm{height:42px;padding:0 1.15rem;font-size:.88rem}
.btn-accent{background:var(--accent);color:var(--on-accent);box-shadow:0 10px 30px -12px color-mix(in srgb,var(--accent) 70%,transparent)}
.btn-accent:hover{transform:translateY(-2px);box-shadow:0 18px 40px -14px color-mix(in srgb,var(--accent) 80%,transparent)}
.btn-ghost{border:1.5px solid color-mix(in srgb,currentColor 45%,transparent)}
.btn-ghost:hover{border-color:currentColor;transform:translateY(-2px)}
.btn-ghost-ink{border:1.5px solid var(--line);color:var(--ink);margin-top:2rem}
.btn-ghost-ink:hover{border-color:var(--ink)}
.btn-on-deep{background:var(--on-deep);color:var(--deep)}
.btn-on-deep:hover{transform:translateY(-2px)}
.btn-icon,.btn-icon-l{width:18px;height:18px}
.btn-icon{transition:transform .35s var(--ease)}
.btn:hover .btn-icon{transform:translateX(3px)}
.ctas{display:flex;flex-wrap:wrap;gap:.8rem;margin-top:2.1rem}

/* hero */
.hero{position:relative}
.eyebrow{font-size:.78rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-bottom:1.1rem}
.lede{font-size:clamp(1.05rem,1.4vw,1.2rem);color:var(--muted);margin-top:1.2rem;max-width:34rem;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.hero-full{min-height:calc(100dvh - 104px);display:flex;align-items:flex-end;overflow:hidden;color:#fafafa;isolation:isolate}
.hero-full .eyebrow{color:#fafafa;opacity:.85}
.hero-full .lede{color:rgba(250,250,250,.86)}
.hero-media{position:absolute;inset:-8% 0 0;z-index:-2;overflow:hidden}
.hero-scrim{position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(10,10,10,.1) 0%,rgba(10,10,10,.3) 45%,rgba(10,10,10,.8) 100%)}
.hero-inner{width:min(1240px,100% - 48px);margin-inline:auto;padding:6rem 0 5.5rem}
.hero-inner>*{max-width:760px}
.hero-full .btn-accent{box-shadow:none}
.hero-split{padding:clamp(2.5rem,6vw,5rem) 0 clamp(3rem,7vw,6rem)}
.hero-grid{display:grid;grid-template-columns:1.05fr 1fr;gap:clamp(2rem,5vw,5rem);align-items:center}
.collage{position:relative;padding:0 0 12% 10%}
.collage-a{aspect-ratio:4/5;border-radius:var(--r);overflow:hidden;box-shadow:0 30px 70px -35px color-mix(in srgb,var(--deep) 60%,transparent)}
.collage-b{position:absolute;left:0;bottom:0;width:44%;aspect-ratio:1;border-radius:var(--r);overflow:hidden;border:6px solid var(--bg);box-shadow:0 20px 50px -25px color-mix(in srgb,var(--deep) 55%,transparent)}

/* ribbon marquee */
.ribbon{border-block:1px solid var(--line);overflow:hidden;background:var(--surface)}
.ribbon-track{display:flex;width:max-content}
.ribbon ul{display:flex;list-style:none;gap:3rem;padding:1.1rem 1.5rem 1.1rem 0;white-space:nowrap}
.ribbon li{display:flex;align-items:center;gap:.75rem;font-family:var(--hf);font-size:1.15rem}
.ribbon-icon{width:18px;height:18px;color:var(--accent)}

/* sections */
.section{padding:clamp(4.5rem,9vw,8rem) 0}
.body-lg{font-size:1.12rem;color:var(--muted);max-width:60ch}
.about-grid{display:grid;grid-template-columns:5fr 6fr;gap:clamp(2.5rem,6vw,6rem);align-items:center}
.about-media{position:relative;padding:0 14% 14% 0}
.about-main{aspect-ratio:4/5;border-radius:var(--r);overflow:hidden}
.about-inset{position:absolute;right:0;bottom:0;width:48%;aspect-ratio:4/5;border-radius:var(--r);overflow:hidden;border:6px solid var(--bg)}
.checks{list-style:none;display:grid;gap:.9rem;margin-top:2rem}
.checks li{display:flex;gap:.8rem;align-items:flex-start;font-size:1.02rem}
.check{width:22px;height:22px;padding:4px;border-radius:50%;background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent);margin-top:2px}

.offers{background:var(--surface)}
.bento{display:grid;gap:1.25rem;margin-top:1rem}
.bento-3{grid-template-columns:1.35fr 1fr;grid-template-rows:auto auto}
.bento-3 .tile-0{grid-row:1/3}
.bento-2{grid-template-columns:1fr 1fr}
.tile{background:var(--bg);border-radius:var(--r);overflow:hidden;display:flex;flex-direction:column;transition:transform .5s var(--ease),box-shadow .5s var(--ease)}
.tile:hover{transform:translateY(-4px);box-shadow:0 26px 60px -34px color-mix(in srgb,var(--deep) 55%,transparent)}
.tile-media{overflow:hidden;aspect-ratio:16/9}
.tile-0 .tile-media{aspect-ratio:auto;flex:1;min-height:320px}
.tile-media>*{transition:transform 1.2s var(--ease)}
.tile:hover .tile-media>*{transform:scale(1.05)}
.tile-body{padding:1.5rem 1.6rem 1.7rem}
.tile-body p{color:var(--muted);margin-top:.45rem;font-size:.97rem}
.note{display:inline-block;margin-top:.9rem;font-size:.74rem;font-weight:600;color:var(--accent);border:1px dashed color-mix(in srgb,var(--accent) 60%,transparent);padding:.2rem .6rem;border-radius:999px}

.band{position:relative;min-height:72vh;display:grid;place-items:center;overflow:hidden;isolation:isolate;color:#fafafa;text-align:center}
.band-media{position:absolute;inset:-15% 0;z-index:-2}
.band-scrim{position:absolute;inset:0;z-index:-1;background:radial-gradient(ellipse at center,rgba(10,10,10,.35),rgba(10,10,10,.62))}
.band-text{font-family:var(--hf);font-weight:var(--hw);font-size:clamp(2.2rem,5.5vw,4.8rem);line-height:1.1;max-width:16ch;padding:0 24px;text-wrap:balance}

.mosaic{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:clamp(150px,17vw,230px);gap:1rem;margin-top:1rem}
.m{border-radius:var(--r);overflow:hidden}
.m>*{transition:transform 1.2s var(--ease)}
.m:hover>*{transform:scale(1.06)}
.m-0{grid-column:span 2;grid-row:span 2}.m-1,.m-4,.m-5{grid-column:span 2}

.reviews-grid{display:grid;grid-template-columns:.8fr 1.2fr;gap:clamp(2rem,6vw,6rem);align-items:center}
.score-num{font-family:var(--hf);font-weight:var(--hw);font-size:clamp(5rem,11vw,8.5rem);line-height:.9;letter-spacing:-.03em}
.stars{display:flex;gap:.2rem;margin-top:1rem;color:var(--accent)}
.star{width:24px;height:24px}
.star-empty{opacity:.45}
.score-meta{color:var(--muted);margin-top:.7rem}
.link{display:inline-flex;align-items:center;gap:.35rem;margin-top:1.4rem;font-weight:600;color:var(--accent);border-bottom:1.5px solid currentColor;padding-bottom:2px}
.link-icon{width:16px;height:16px}
.quotes{display:grid;grid-template-columns:1fr 1fr;gap:1.25rem}
.quote{border:1.5px dashed var(--line);border-radius:var(--r);padding:1.7rem}
.quote:nth-child(2){margin-top:3rem}
.quote-mark{width:30px;height:30px;color:var(--accent);opacity:.8}
.quote blockquote{font-family:var(--hf);font-size:1.2rem;line-height:1.35;margin-top:.9rem}
.quote figcaption{font-size:.85rem;color:var(--muted);margin-top:1rem}

.visit{background:var(--surface)}
.visit-grid{display:grid;grid-template-columns:1fr 1.1fr;gap:clamp(2rem,6vw,6rem);align-items:center}
.rows{list-style:none;display:grid;gap:1.4rem;margin-top:1.2rem}
.rows li{display:flex;gap:1rem;align-items:flex-start}
.row-icon{width:24px;height:24px;color:var(--accent);margin-top:2px}
.row-label{font-size:.82rem;color:var(--muted)}
.rows a:hover{color:var(--accent)}
.visit-media{aspect-ratio:5/4;border-radius:var(--r);overflow:hidden}

.quote-grid{display:grid;grid-template-columns:1fr 1.1fr;gap:clamp(2rem,6vw,6rem);align-items:start}
.qform{display:grid;grid-template-columns:1fr 1fr;gap:1rem;padding:clamp(1.4rem,3vw,2.2rem);border:1px solid var(--line);border-radius:var(--r);background:var(--surface)}
.qform label{display:grid;gap:.4rem;font-size:.85rem;color:var(--muted)}
.qform .full{grid-column:1/-1}
.qform input,.qform textarea{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:.75rem .9rem}
.qform input:focus,.qform textarea:focus{outline:2px solid var(--accent);outline-offset:1px}
.qform .note{font-size:.78rem;color:var(--muted)}
.callbar{display:none}

.closing{padding:clamp(4rem,8vw,6.5rem) 0;background:var(--deep);color:var(--on-deep)}
.closing-inner{display:flex;align-items:center;justify-content:space-between;gap:2rem;flex-wrap:wrap}
.closing h2{margin:0;font-size:clamp(2.2rem,4.5vw,3.8rem)}

.footer{background:var(--deep);color:var(--on-deep);border-top:1px solid color-mix(in srgb,var(--on-deep) 12%,transparent);padding:3.5rem 0 2rem}
.footer-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:2rem}
.brand-foot{color:var(--on-deep)}
.foot-muted{opacity:.65;margin-top:.8rem;font-size:.92rem}
.social{display:flex;gap:.8rem;margin-top:1.2rem}
.social a{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;border:1px solid color-mix(in srgb,var(--on-deep) 22%,transparent);transition:background-color .25s;font-size:.75rem;text-transform:capitalize}
.social a:hover{background:color-mix(in srgb,var(--on-deep) 10%,transparent)}
.social-icon{width:20px;height:20px}
.foot-links,.foot-contact{display:grid;gap:.6rem;align-content:start;font-size:.95rem}
.foot-links a,.foot-contact a{opacity:.8}
.foot-links a:hover,.foot-contact a:hover{opacity:1}
.foot-base{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-top:3rem;padding-top:1.5rem;border-top:1px solid color-mix(in srgb,var(--on-deep) 12%,transparent);font-size:.8rem;opacity:.65}
.foot-base a{text-decoration:underline;text-underline-offset:2px}

/* photo placeholders (until licensed photos are attached) */
.ph{position:relative;width:100%;height:100%;display:grid;place-items:center;color:rgba(255,255,255,.7);overflow:hidden}
.ph-icon{width:34px;height:34px;opacity:.55}
.ph-0{background:radial-gradient(120% 90% at 20% 10%,color-mix(in srgb,var(--accent) 55%,var(--deep)) 0%,var(--deep) 62%)}
.ph-1{background:radial-gradient(110% 80% at 80% 20%,color-mix(in srgb,var(--accent) 45%,var(--deep)) 0%,color-mix(in srgb,var(--deep) 85%,var(--accent)) 100%)}
.ph-2{background:linear-gradient(160deg,color-mix(in srgb,var(--deep) 85%,var(--accent)) 0%,color-mix(in srgb,var(--accent) 45%,var(--deep)) 100%)}
.ph-3{background:radial-gradient(90% 90% at 50% 100%,color-mix(in srgb,var(--accent) 50%,var(--deep)) 0%,var(--deep) 72%)}
.ph::after{content:"";position:absolute;inset:0;opacity:.12;background-image:radial-gradient(circle at 1px 1px,#fff 1px,transparent 0);background-size:16px 16px}

/* motion: every animation is gated behind the reduced-motion preference */
@media (prefers-reduced-motion:no-preference){
  .load{animation:rise 1.1s var(--ease) both;animation-delay:calc(var(--i,0) * 110ms + 120ms)}
  .kb{animation:kenburns 22s ease-out both}
  .ribbon-track{animation:marquee 44s linear infinite}
  .ribbon:hover .ribbon-track{animation-play-state:paused}
  @keyframes rise{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
  @keyframes kenburns{from{transform:scale(1.12)}to{transform:scale(1)}}
  @keyframes marquee{to{transform:translateX(-50%)}}

  @supports (animation-timeline:view()){
    /* ranges finish while the element is still entering, so content near the page end always completes */
    .sr{animation:reveal linear both;animation-timeline:view();animation-range:entry 0% entry 75%}
    .mosaic .sr,.bento .sr,.quotes .sr{animation-range:entry calc(var(--i,0) * 8%) entry calc(60% + var(--i,0) * 12%)}
    @keyframes reveal{from{opacity:0;transform:translateY(48px) scale(.98)}to{opacity:1;transform:none}}

    .hero-media{animation:hero-par linear both;animation-timeline:scroll(root);animation-range:0 100vh}
    @keyframes hero-par{to{transform:translateY(18%)}}
    .band-media{animation:band-par linear both;animation-timeline:view();animation-range:cover}
    @keyframes band-par{from{transform:translateY(-12%)}to{transform:translateY(12%)}}
    .drift{animation:drift linear both;animation-timeline:view();animation-range:cover}
    @keyframes drift{from{transform:translateY(40px)}to{transform:translateY(-40px)}}

    .nav{animation:nav-solid linear both;animation-timeline:scroll(root);animation-range:0 160px}
    @keyframes nav-solid{to{background:color-mix(in srgb,var(--bg) 94%,transparent);border-bottom-color:var(--line)}}
  }
}

/* responsive */
@media (max-width:980px){
  .nav-links{display:none}
  .hero-grid,.about-grid,.reviews-grid,.visit-grid,.quote-grid{grid-template-columns:1fr}
  .collage{padding:0 0 10% 12%;max-width:560px}
  .about-media{max-width:560px}
  .footer-grid{grid-template-columns:1fr 1fr}
}
@media (max-width:720px){
  .wrap,.hero-inner{width:calc(100% - 32px)}
  .hero-inner{padding:4.5rem 0 3.5rem}
  .bento-3,.bento-2{grid-template-columns:1fr}
  .bento-3 .tile-0{grid-row:auto}
  .tile-0 .tile-media{min-height:240px}
  .mosaic{grid-template-columns:1fr 1fr;grid-auto-rows:170px}
  .m-0{grid-row:span 1}
  .quotes{grid-template-columns:1fr}
  .quote:nth-child(2){margin-top:0}
  .footer-grid{grid-template-columns:1fr}
  .nav-cta{display:none}
  .ctas .btn{flex:1 1 100%}
  .qform{grid-template-columns:1fr}
  .callbar{position:fixed;left:16px;right:16px;bottom:16px;z-index:40;display:flex;align-items:center;justify-content:center;gap:.5rem;height:52px;border-radius:999px;background:var(--accent);color:var(--on-accent);font-weight:600;box-shadow:0 12px 30px -10px rgba(0,0,0,.45)}
  .footer{padding-bottom:6rem}
}
`;
