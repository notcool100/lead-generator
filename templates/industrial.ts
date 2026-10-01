import { createHash } from "node:crypto";
import { TEMPLATES } from "./registry";
import { icon } from "./icons";
import { esc, photoCredits, picture, rgb, safeHref } from "./shared";
import type { ImageRef, PreviewConfig } from "@/types/preview";

/**
 * "Summit" industrial layout for construction companies: a static port of the
 * Summit Industrial Construction homepage (summit-cms), with every piece of
 * copy, contact detail and photo filled from the lead's PreviewConfig.
 *
 * Same contract as render.ts: every dynamic value is escaped. Layout and motion
 * are CSS (they work with JavaScript off):
 *  - six-theme switcher      → radio inputs + :has()
 *  - overlay menu            → :target
 *  - reveal / mask / clip    → scroll-driven animations (animation-timeline: view())
 *  - pinned horizontal reel  → sticky section + named view timeline
 *  - scroll progress bar     → animation-timeline: scroll(root)
 * Browsers without scroll timelines (or with reduced motion) get a static,
 * fully visible page and a swipeable project reel.
 *
 * On top of that, two fixed scripts (HEAD_JS, BODY_JS) add Summit's pointer and
 * media behaviours: hero video, custom cursor, magnetic buttons, count-up stats,
 * cursor-following service preview, blueprint tilt and a remembered theme.
 * They contain no lead data (inputs come from escaped data-* attributes), and
 * the preview route allows them by sha256 hash only (INDUSTRIAL_CSP_EXTRA).
 */

interface Theme {
  key: string;
  label: string;
  paper: string;
  ink: string;
  panel: string;
}

/** Summit's six themes. "light" takes the template palette. */
function themes(cfg: PreviewConfig): Theme[] {
  return [
    { key: "light", label: "Light", paper: cfg.colors.background, ink: cfg.colors.text, panel: cfg.colors.surface },
    { key: "dark", label: "Dark", paper: "#0f1113", ink: "#f5f3ee", panel: "#15181b" },
    { key: "blueprint", label: "Blueprint", paper: "#0b1e33", ink: "#e8eef5", panel: "#13294a" },
    { key: "concrete", label: "Concrete", paper: "#d8d5ce", ink: "#2b2926", panel: "#c7c3ba" },
    { key: "safety", label: "Safety", paper: "#ffffff", ink: "#000000", panel: "#f0f0f0" },
    { key: "steel", label: "Steel", paper: "#3a3f44", ink: "#e4e7ea", panel: "#464c52" },
  ];
}

const themeVars = (t: Theme) =>
  `--paper:${t.paper};--paper-rgb:${rgb(t.paper).join(",")};--ink:${t.ink};--ink-rgb:${rgb(t.ink).join(",")};--panel:${t.panel}`;

const label = (idx: string, text: string) => `<div class="section-label">${idx} / ${esc(text)}</div>`;

/** Splits text into two balanced lines (by character count) for the masked headline reveal. */
function twoLines(text: string): [string, string] {
  const sentence = text.match(/^(.+?[.!?])\s+(.+)$/);
  if (sentence) return [sentence[1], sentence[2]];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return [text, ""];
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (diff < bestDiff) [best, bestDiff] = [i, diff];
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/** Escapes a line and paints its final word in the accent (Summit's "Industrial <span>Scale</span>"). */
function accentLast(line: string) {
  const m = line.match(/^(.*\s)?(\S+)$/);
  if (!m) return esc(line);
  return `${esc(m[1] ?? "")}<span class="accent">${esc(m[2])}</span>`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function renderIndustrialHtml(config: PreviewConfig, opts: { watermark?: boolean } = { watermark: true }): string {
  const t = TEMPLATES[config.templateKey];
  const k = config.content;
  const f = config.features;
  const name = config.businessName;
  const all = themes(config);
  const [light, dark] = all;

  // ── images (gallery order from images.ts: about, about-2, band, offers x3, gallery x4, visit)
  const g = config.images.gallery;
  const pool = [config.images.hero, ...g].filter((x): x is ImageRef => Boolean(x));
  const gAt = (i: number) => (g.length ? g[i % g.length] : pool.length ? pool[i % pool.length] : null);
  const im = {
    hero: config.images.hero ?? gAt(0),
    manifesto: gAt(0),
    thumbs: [3, 4, 5, 1, 2, 6].map(gAt),
    projects: [6, 7, 8, 9].map(gAt),
  };

  // ── facts
  const where = [k.contact.city, k.contact.country].filter(Boolean).join(", ");
  const category = config.category?.trim() ? capitalize(config.category.trim()) : "Construction";
  const tel = k.contact.phone ? `tel:${k.contact.phone.replace(/[^+\d]/g, "")}` : null;
  const mapUrl = k.contact.mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(k.contact.mapQuery)}` : null;
  const primary = { label: config.primaryCTA.label, href: safeHref(config.primaryCTA.href) };
  const services = k.offerings.length
    ? k.offerings.slice(0, 6).map((o) => ({ name: o.title, tag: o.description, placeholder: false }))
    : k.offeringsPlaceholder.slice(0, 6).map((n) => ({ name: n, tag: "Sample service, confirmed with you before launch", placeholder: true }));
  const year = new Date(config.generatedAt).getFullYear();
  const pad = (i: number) => String(i + 1).padStart(2, "0");

  // ── header
  const navLinks: [string, string][] = [
    ["#about", "About"],
    ["#services", k.offeringsTitle],
    ["#projects", "Projects"],
    ["#contact", "Contact"],
  ];
  const brand = `<span class="brand-name">${esc(name.toUpperCase())}</span><span class="accent">.</span>`;
  const check = `<svg class="theme-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  const themeMenu = `
      <details class="theme">
        <summary class="icon-btn" aria-label="Choose theme"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"></circle><path d="M12 3a9 9 0 000 18V3z" fill="currentColor"></path></svg></summary>
        <div class="theme-menu" role="radiogroup" aria-label="Theme">
          ${all
            .map(
              (th) =>
                `<label class="theme-opt"><input class="th" type="radio" name="theme" id="th-${th.key}"><span class="swatch" style="background:${th.paper}"></span><span class="theme-name">${th.label}</span>${check}</label>`,
            )
            .join("")}
        </div>
      </details>`;

  const banner =
    opts.watermark !== false
      ? `<div class="concept"><strong>Website concept</strong> for ${esc(name)}. Not an official website: photos and some content are illustrative.</div>`
      : "";

  const header = `
  <header class="site-header">
    ${banner}
    <div class="bar">
      <a class="brand" href="#top">${brand}</a>
      <nav class="nav" aria-label="Main">${navLinks.map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join("")}</nav>
      <div class="bar-actions">
        <a class="btn-head" data-magnetic href="${primary.href}">${esc(primary.label)}</a>
        ${themeMenu}
        <a class="icon-btn menu-btn" href="#menu" aria-label="Open menu"><span></span><span class="accent-bg"></span></a>
      </div>
    </div>
    <div class="progress-rail"><div class="progress"></div></div>
  </header>`;

  const overlay = `
  <div class="overlay" id="menu" role="dialog" aria-label="Menu">
    <div class="overlay-bar">
      <span class="brand">${brand}</span>
      <a class="icon-btn" href="#close" aria-label="Close menu">✕</a>
    </div>
    <nav class="overlay-nav">
      ${[["#top", "Home"], ...navLinks]
        .map(([h, l], i) => `<div class="overlay-row"><a href="${h}" style="--i:${i}"><span class="overlay-idx">${pad(i)}</span>${esc(l)}</a></div>`)
        .join("")}
      <div class="overlay-meta">${[where, k.contact.phone, k.contact.email].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join("")}</div>
    </nav>
  </div>`;

  // ── hero
  const [h1a, h1b] = twoLines(config.headline);
  const heroSize = config.headline.length <= 22 ? "xl" : config.headline.length <= 44 ? "lg" : "md";
  const hero = `
  <section class="hero" id="top">
    <div class="hero-media">${picture(im.hero, { cls: "kb", eager: true, label: name, variant: 0 })}</div>
    <video class="hero-video" autoplay muted loop playsinline preload="auto" aria-hidden="true">
      ${HERO_VIDEOS.map((src) => `<source src="${src}" type="video/mp4">`).join("")}
    </video>
    <div class="hero-scrim" aria-hidden="true"></div>
    <div class="hero-tint" aria-hidden="true"></div>
    <div class="blueprint" aria-hidden="true">
      <svg data-tilt viewBox="0 0 640 420" fill="none">
        <g class="bp-ink" stroke-width="1" opacity="0.55">
          <path d="M80 340 L320 220 L560 340 M80 260 L320 140 L560 260 M80 180 L320 60 L560 180"></path>
          <path d="M80 340 L80 180 M320 220 L320 60 M560 340 L560 180"></path>
          <path d="M140 310 L140 165 M200 280 L200 135 M260 250 L260 105 M380 250 L380 105 M440 280 L440 135 M500 310 L500 165"></path>
        </g>
        <g class="bp-acc" stroke-width="1.5">
          <path class="pulse" d="M80 300 L320 180 L560 300"></path>
          <circle cx="320" cy="60" r="4"></circle>
        </g>
        <g class="bp-ink" stroke-dasharray="4 6" opacity="0.4">
          <path d="M60 360 L60 160 M60 160 L75 160 M60 360 L75 360"></path>
          <path d="M90 380 L570 380"></path>
        </g>
        <text class="bp-text" x="30" y="265" font-size="11" letter-spacing="2" transform="rotate(-90 30 265)">42'-6"</text>
        <text class="bp-text" x="300" y="404" font-size="11" letter-spacing="2">MODULE GRID A-F</text>
      </svg>
    </div>
    <div class="hero-copy">
      <div class="hero-eyebrow">
        <span class="rule ld-fade"></span>
        <span class="eyebrow-text ld-fade" style="--d:.1s">${esc(where ? `${category}, ${where}` : category)}</span>
      </div>
      <h1 class="h1-${heroSize}">
        <span class="mask-line"><span class="ld-mask">${h1b ? esc(h1a) : accentLast(h1a)}</span></span>
        ${h1b ? `<span class="mask-line"><span class="ld-mask" style="--d:.12s">${accentLast(h1b)}</span></span>` : ""}
      </h1>
      <div class="hero-bottom">
        ${config.subheadline ? `<p class="hero-lede ld-up" style="--d:.3s">${esc(config.subheadline)}</p>` : "<span></span>"}
        <div class="hero-cta ld-up" style="--d:.45s">
          <a class="btn btn--outline" data-magnetic data-cursor-view href="#projects">See the work</a>
          <a class="btn btn--solid" data-magnetic href="${primary.href}">${esc(primary.label)}</a>
        </div>
      </div>
    </div>
    <div class="scroll-hint" aria-hidden="true"><span>Scroll</span><span class="scroll-line"></span></div>
  </section>`;

  // ── stats strip: only real facts; the rest are clearly-marked placeholders
  const stats: { label: string; value: string; note: string; text?: boolean; placeholder?: boolean; count?: { to: number; decimals: number; suffix: string } }[] = [];
  if (k.rating) {
    const rating = Math.round(k.rating.value * 10) / 10;
    stats.push({ label: "Customer rating", value: `${rating.toFixed(1)}★`, note: `Average from ${k.rating.count} reviews`, count: { to: rating, decimals: 1, suffix: "★" } });
    stats.push({ label: "Reviews", value: k.rating.count.toLocaleString("en"), note: "Public customer reviews", count: { to: k.rating.count, decimals: 0, suffix: "" } });
  }
  if (k.contact.city) stats.push({ label: "Based in", value: k.contact.city, note: k.contact.country ?? "Local team", text: k.contact.city.length > 6 });
  for (const ph of ["Years building", "Projects completed", "Licensed & insured", "Crew size"]) {
    if (stats.length >= 4) break;
    stats.push({ label: ph, value: "TBC", note: "Confirmed with you before launch", placeholder: true });
  }
  const statsStrip = `
  <section class="stats" aria-label="At a glance">
    <div class="stats-grid">
      ${stats
        .map(
          (s, i) => `
      <div class="stat-cell sr-up" style="--i:${i}">
        <div class="stat-label">${esc(s.label)}</div>
        <div class="stat-value${s.text ? " stat-value--text" : ""}"${s.count ? ` data-count="${s.count.to}" data-decimals="${s.count.decimals}" data-suffix="${esc(s.count.suffix)}"` : ""}>${esc(s.value)}</div>
        <div class="stat-note${s.placeholder ? " stat-note--ph" : ""}">${esc(s.note)}</div>
      </div>`,
        )
        .join("")}
    </div>
  </section>`;

  // ── manifesto (about)
  const [m1, m2] = twoLines(t.aboutTitle);
  const aboutText =
    k.about ?? `This is where the story of ${name} goes: who you are, the kind of work you take on, and why clients keep calling you back.`;
  const manifesto = `
  <section class="manifesto" id="about">
    <div class="manifesto-eyebrow">${label("01", "About")}</div>
    <div class="manifesto-grid">
      <div>
        <h2>
          <span class="mask-line"><span class="sr-mask">${esc(m1)}</span></span>
          ${m2 ? `<span class="mask-line"><span class="sr-mask">${esc(m2)}</span></span>` : ""}
        </h2>
        <p class="manifesto-body sr-up">${esc(aboutText)}</p>
        ${k.highlights.length ? `<ul class="checks sr-up">${k.highlights.map((h) => `<li>${icon("check", "check")}<span>${esc(h)}</span></li>`).join("")}</ul>` : ""}
      </div>
      <figure class="manifesto-figure sr-clip">
        <div class="manifesto-img">${picture(im.manifesto, { sizes: "(min-width: 900px) 40vw, 90vw", label: "Team at work", variant: 1 })}</div>
        <div class="manifesto-fade" aria-hidden="true"></div>
        <figcaption class="fig-tag">FIG. 01: ${esc((k.contact.city ?? "On site").toUpperCase())}</figcaption>
      </figure>
    </div>
  </section>`;

  // ── services index (Summit's capabilities teaser, hover preview in CSS)
  const servicesSec = `
  <section class="teaser" id="services">
    <div class="teaser-head">${label("02", k.offeringsTitle)}<a class="link-accent" href="#contact">Get a quote →</a></div>
    <div class="teaser-rows">
      ${services
        .map(
          (s, i) => `
      <a class="teaser-row sr-up" data-cursor-view="QUOTE" href="#contact" style="--i:${i % 3}">
        <span class="teaser-idx">${pad(i)}</span>
        <span class="teaser-name">${esc(s.name)}</span>
        <span class="teaser-tag${s.placeholder ? " teaser-tag--ph" : ""}">${esc(s.tag)}</span>
        <span class="teaser-thumb" aria-hidden="true">${picture(im.thumbs[i] ?? null, { sizes: "300px", label: s.name, variant: i })}<span class="teaser-thumb-name">${esc(s.name)}</span><span class="teaser-thumb-idx">${pad(i)}</span></span>
      </a>`,
        )
        .join("")}
    </div>
  </section>`;

  // ── project reel (pinned horizontal scroll)
  const projects = `
  <section class="hs" id="projects">
    <div class="hs-sticky">
      <div class="projects-head">${label("03", t.galleryTitle)}<a class="link-accent" href="#contact">Start yours →</a></div>
      <div class="hs-scroller">
        <div class="hs-track">
          ${im.projects
            .map(
              (img, i) => `
          <figure class="project-card" data-cursor-view>
            <div class="project-frame">
              ${picture(img, { sizes: "(min-width: 900px) 560px, 72vw", label: "Project photo", variant: i })}
              <div class="project-scrim" aria-hidden="true"></div>
              <div class="project-idx" aria-hidden="true">${pad(i)}</div>
              <div class="project-industry">Sample project</div>
            </div>
            <figcaption class="project-meta">
              <span class="project-name">${esc(services[i % services.length]?.name ?? "Your project")}</span>
              <span class="project-stat">${esc(where || "Photo is illustrative")}</span>
            </figcaption>
          </figure>`,
            )
            .join("")}
          <a class="project-more" data-cursor-view="START" href="#contact">Start yours →</a>
        </div>
      </div>
    </div>
  </section>`;

  // ── statement marquee (Summit's safety band)
  const [s1, s2] = t.statement.match(/^(.+?[.!?])\s+(.+)$/)?.slice(1) ?? [t.statement, ""];
  const marqueeLine = `<span class="safety-line">${esc(s1)} ${s2 ? `<span class="accent">${esc(s2)}</span>` : ""}&nbsp;</span>`;
  const facts = [
    k.rating ? `${k.rating.value.toFixed(1)}★ from ${k.rating.count} reviews` : null,
    where || null,
    k.contact.phone ? `Call ${k.contact.phone}` : null,
  ].filter((x): x is string => Boolean(x));
  const safety = `
  <section class="safety" aria-label="${esc(t.statement)}">
    <div class="marquee"><div class="marquee-track">${marqueeLine}${marqueeLine}</div></div>
    <div class="safety-facts">
      ${[...facts.map((x) => `<span>${esc(x)}</span>`), `<span><a href="#contact">Get a quote →</a></span>`].join('<span class="dot">·</span>')}
    </div>
  </section>`;

  // ── contact + quote form
  const addressLine = [k.contact.address, k.contact.city && !k.contact.address?.includes(k.contact.city) ? k.contact.city : null].filter(Boolean).join(", ");
  const rows = [
    addressLine ? [`Office`, esc(addressLine)] : null,
    k.contact.phone && tel ? [`Phone`, `<a href="${esc(tel)}">${esc(k.contact.phone)}</a>`] : null,
    k.contact.email ? [`Email`, `<a href="mailto:${esc(k.contact.email)}">${esc(k.contact.email)}</a>`] : null,
    f.serviceArea ? [`Service area`, esc(f.serviceArea)] : null,
    [`Hours`, `<span class="muted">Added with you before launch</span>`],
  ].filter((x): x is string[] => Boolean(x));
  const formTitle = f.freeEstimate ? "Request a free estimate" : "Request a quote";
  const contact = `
  <section class="contact" id="contact">
    <div class="contact-grid">
      <div>
        ${label("04", "Contact")}
        <h2 class="contact-title">
          <span class="mask-line"><span class="sr-mask">Start a</span></span>
          <span class="mask-line"><span class="sr-mask"><span class="accent">project.</span></span></span>
        </h2>
        <p class="contact-lede sr-up">Tell ${esc(name)} about the job: what you're building, where, and when. You'll hear back with next steps.</p>
        <dl class="contact-rows sr-up">
          ${rows.map(([dt, dd]) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`).join("")}
        </dl>
        ${mapUrl ? `<a class="link-accent" href="${esc(mapUrl)}" target="_blank" rel="noopener">Open in Google Maps →</a>` : ""}
      </div>
      <form class="qform sr-up" id="quote" aria-label="${formTitle} form">
        <p class="qform-title">${formTitle}</p>
        <label class="field"><input name="name" placeholder=" " autocomplete="name"><span>Full name</span></label>
        <label class="field"><input name="phone" type="tel" placeholder=" " autocomplete="tel"><span>Phone</span></label>
        <label class="field full"><input name="email" type="email" placeholder=" " autocomplete="email"><span>Email address</span></label>
        <label class="field full field-select"><select name="service" aria-label="Project type"><option value="">Project type</option>${services.map((s) => `<option>${esc(s.name)}</option>`).join("")}<option>Something else</option></select></label>
        <label class="field full"><textarea name="message" rows="4" placeholder=" "></textarea><span>Tell us about the project</span></label>
        <button class="btn btn--solid full" data-magnetic type="button">${esc(f.freeEstimate ? "Request my free estimate" : "Send request")}</button>
        <p class="qform-note full">Preview only. On the live site, requests go straight to your inbox.</p>
      </form>
    </div>
  </section>`;

  // ── closing CTA (Summit's careers CTA)
  const [c1, c2] = twoLines(t.closing);
  const closing = `
  <section class="cta">
    <div class="cta-eyebrow sr-up">${esc(where ? `Building across ${where}` : "Ready when you are")}</div>
    <h2>
      <span class="mask-line"><span class="sr-mask">${esc(c1)}</span></span>
      ${c2 ? `<span class="mask-line"><span class="sr-mask">${esc(c2)}</span></span>` : ""}
    </h2>
    <div class="cta-actions sr-up"><a class="btn btn--solid btn--lg" data-magnetic data-cursor-view="GO" href="${primary.href}">${esc(primary.label)}</a></div>
  </section>`;

  // ── footer
  const social = Object.entries(k.social)
    .map(([n, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(capitalize(n))}</a>`)
    .join("");
  const credits = photoCredits([config.images.hero, ...config.images.gallery]);
  const wmLen = Math.max(name.length, 4);
  const footer = `
  <footer class="footer">
    <div class="footer-grid">
      <div>
        <div class="footer-brand">${brand}</div>
        ${config.subheadline ? `<p class="tagline">${esc(config.subheadline)}</p>` : ""}
        <div class="address">
          ${addressLine ? `${esc(addressLine)}<br>` : where ? `${esc(where)}<br>` : ""}
          ${k.contact.phone && tel ? `<a href="${esc(tel)}">${esc(k.contact.phone)}</a>` : ""}
        </div>
      </div>
      <nav class="col" aria-label="Company">
        <span class="col-title">Company</span>
        <a href="#about">About</a><a href="#services">${esc(k.offeringsTitle)}</a>
      </nav>
      <nav class="col" aria-label="Work">
        <span class="col-title">Work</span>
        <a href="#projects">Projects</a><a href="#contact">Start a project</a>
      </nav>
      <div>
        <span class="col-title">Get in touch</span>
        <p class="note">Quotes, site visits and project questions.</p>
        ${k.contact.email ? `<a class="foot-link" href="mailto:${esc(k.contact.email)}">${esc(k.contact.email)}</a>` : ""}
        <a class="btn-sub" data-magnetic href="#contact">Request a quote</a>
      </div>
    </div>
    <div class="bottom">
      <span>© ${year} ${esc(name)}</span>
      <div class="social">${social}<a class="top" href="#top">Back to top ↑</a></div>
    </div>
    ${credits ? `<div class="credits">Photos: ${credits}</div>` : ""}
    <div class="watermark" aria-hidden="true" style="font-size:min(21vw,${(190 / wmLen).toFixed(2)}vw,360px)"><div class="watermark-text">${esc(name.toUpperCase())}</div></div>
  </footer>`;

  const callBar = tel ? `<a class="callbar" href="${esc(tel)}">${icon("phone", "callbar-icon")}Call now</a>` : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>${esc(config.seo.title)}</title>
<meta name="description" content="${esc(config.seo.description)}">
<meta property="og:title" content="${esc(config.seo.title)}">
<meta property="og:description" content="${esc(config.seo.description)}">
${im.hero ? `<meta property="og:image" content="${esc(im.hero.url)}">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<script>${HEAD_JS}</script>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{${themeVars(light)};--accent:${config.colors.accent};--accent-rgb:${rgb(config.colors.accent).join(",")};--font-display:"Anton",Impact,sans-serif;--font-body:"Archivo",system-ui,sans-serif;--ease:cubic-bezier(.16,1,.3,1)}
@media (prefers-color-scheme:dark){:root:not([data-theme]):not(:has(.th:checked)){${themeVars(dark)}}}
${all.map((th) => `:root[data-theme="${th.key}"]{${themeVars(th)}}`).join("\n")}
${all.map((th) => `:root:has(#th-${th.key}:checked){${themeVars(th)}}`).join("\n")}
${CSS}
</style>
</head>
<body>
${header}
${overlay}
<main>
${hero}
${statsStrip}
${manifesto}
${servicesSec}
${projects}
${safety}
${contact}
${closing}
</main>
${footer}
${callBar}
<script>${BODY_JS}</script>
</body>
</html>`;
}

// ───────────────────────── scripts (ported from summit-cms) ─────────────────────────

/**
 * Hero footage from Summit (Pexels License: free to use, no attribution required).
 * Summit's other two sources were dropped: one now returns 403, the other is highway traffic.
 */
const HERO_VIDEOS = ["https://videos.pexels.com/video-files/4941357/4941357-hd_1920_1080_25fps.mp4"];

/** Runs before first paint: re-applies the visitor's saved theme (no flash). */
const HEAD_JS = `try{var t=localStorage.getItem("preview-theme");if(t&&/^[a-z]+$/.test(t))document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

/** Pointer + media behaviours. Static text: never interpolate anything into it (its hash is in the CSP). */
const BODY_JS = `(function(){
var d=document,root=d.documentElement,KEY="preview-theme";
var reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
var fine=matchMedia("(pointer: fine)").matches;

/* theme: remember the choice, close the menu */
var menu=d.querySelector("details.theme");
var saved=root.getAttribute("data-theme");
var radio=saved&&d.getElementById("th-"+saved);
if(radio)radio.checked=true;else root.removeAttribute("data-theme");
d.addEventListener("change",function(e){
  var t=e.target;
  if(!t.classList||!t.classList.contains("th"))return;
  var key=t.id.slice(3);
  root.setAttribute("data-theme",key);
  try{localStorage.setItem(KEY,key)}catch(_){}
  if(menu)menu.open=false;
});
d.addEventListener("click",function(e){if(menu&&menu.open&&!menu.contains(e.target))menu.open=false});
d.addEventListener("keydown",function(e){if(e.key==="Escape"&&menu)menu.open=false});

/* hero video: fade in once it is actually playing */
var video=d.querySelector(".hero-video");
if(video){
  if(reduce){video.pause();video.removeAttribute("autoplay")}
  else{
    var show=function(){video.classList.add("is-playing")};
    if(!video.paused&&video.readyState>2)show();
    video.addEventListener("playing",show);
  }
}

/* count-up stats */
function fmt(n,dec,suf){return n.toLocaleString("en",{minimumFractionDigits:dec,maximumFractionDigits:dec})+suf}
var counters=d.querySelectorAll("[data-count]");
if(!reduce&&"IntersectionObserver" in window&&counters.length){
  var io=new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(!en.isIntersecting)return;
      io.unobserve(en.target);
      var el=en.target,to=parseFloat(el.getAttribute("data-count"))||0,dec=parseInt(el.getAttribute("data-decimals"),10)||0,suf=el.getAttribute("data-suffix")||"",start=performance.now();
      (function tick(now){
        var p=Math.min(1,(now-start)/1600),eased=1-Math.pow(1-p,4);
        el.textContent=fmt(to*eased,dec,suf);
        if(p<1)requestAnimationFrame(tick);
      })(start);
    });
  },{threshold:.4});
  counters.forEach(function(el){io.observe(el)});
}

if(!fine||reduce)return;
root.classList.add("has-pointer");

/* custom cursor: dot + "VIEW" ring over [data-cursor-view] */
var dot=d.createElement("div");dot.className="cursor-dot";
var ring=d.createElement("div");ring.className="cursor-ring";ring.textContent="VIEW";
d.body.appendChild(dot);d.body.appendChild(ring);
var active=false,px=0,py=0;
addEventListener("mousemove",function(e){
  px=e.clientX/innerWidth-.5;py=e.clientY/innerHeight-.5;
  dot.style.transform="translate("+(e.clientX-4)+"px,"+(e.clientY-4)+"px)";
  ring.style.transform="translate("+(e.clientX-32)+"px,"+(e.clientY-32)+"px) scale("+(active?1:.4)+")";
},{passive:true});
d.addEventListener("mouseover",function(e){
  var t=e.target.closest&&e.target.closest("[data-cursor-view]");
  active=!!t;
  ring.classList.toggle("is-active",active);
  if(t)ring.textContent=t.getAttribute("data-cursor-view")||"VIEW";
});

/* magnetic buttons */
d.querySelectorAll("[data-magnetic]").forEach(function(el){
  el.addEventListener("mousemove",function(e){
    var r=el.getBoundingClientRect();
    el.style.transition="transform .2s var(--ease)";
    el.style.transform="translate("+(e.clientX-r.left-r.width/2)*.25+"px,"+(e.clientY-r.top-r.height/2)*.35+"px)";
  });
  el.addEventListener("mouseleave",function(){
    el.style.transition="transform .6s var(--ease)";
    el.style.transform="translate(0,0)";
  });
});

/* blueprint tilt toward the pointer */
var bp=d.querySelector("[data-tilt]");
if(bp)(function frame(){
  bp.style.transform="rotateX("+(-py*6)+"deg) rotateY("+(px*8)+"deg) translate("+(px*-14)+"px,"+(py*-10)+"px)";
  requestAnimationFrame(frame);
})();

/* services: photo preview that follows the cursor */
var teaser=d.querySelector(".teaser");
if(teaser){
  var prev=d.createElement("div");prev.className="teaser-preview";prev.setAttribute("aria-hidden","true");
  d.body.appendChild(prev);
  teaser.querySelectorAll(".teaser-row").forEach(function(row){
    row.addEventListener("mouseenter",function(){
      var thumb=row.querySelector(".teaser-thumb");
      prev.innerHTML="";
      if(thumb)prev.appendChild(thumb.cloneNode(true));
      prev.classList.add("visible");
    });
    row.addEventListener("mouseleave",function(){prev.classList.remove("visible")});
  });
  teaser.addEventListener("mousemove",function(e){
    prev.style.transform="translate("+(e.clientX+28)+"px,"+(e.clientY-prev.offsetHeight/2)+"px)";
  });
}
})();`;

const sha256 = (js: string) => `'sha256-${createHash("sha256").update(js, "utf8").digest("base64")}'`;

/** CSP additions for industrial pages: exactly these two scripts, plus the hero footage host. */
export const INDUSTRIAL_CSP_EXTRA = `script-src ${sha256(HEAD_JS)} ${sha256(BODY_JS)}; media-src https://videos.pexels.com`;

// ───────────────────────── stylesheet (ported from summit-cms) ─────────────────────────

const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;overflow-x:clip}
body{background:var(--paper);color:var(--ink);font-family:var(--font-body);-webkit-font-smoothing:antialiased;line-height:1.5;overflow-x:clip;transition:background-color .25s ease,color .25s ease}
::selection{background:var(--accent);color:var(--paper)}
a{color:var(--ink);text-decoration:none;transition:color .2s,background-color .2s,border-color .2s}
a:hover{color:var(--accent)}
img{display:block;width:100%;height:100%;object-fit:cover}
h1,h2,h3{font-weight:400}
.accent{color:var(--accent)}
.accent-bg{background:var(--accent)!important}
.muted{color:rgba(var(--ink-rgb),.5)}
section[id],form[id]{scroll-margin-top:90px}
.section-label{font-size:12px;font-weight:600;letter-spacing:.28em;color:rgba(var(--ink-rgb),.4);text-transform:uppercase}
.link-accent{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
.link-accent:hover{color:var(--ink)}
.mask-line{display:block;overflow:clip;padding-bottom:.04em}
.mask-line>span{display:block}

/* header */
.site-header{position:fixed;top:0;left:0;right:0;z-index:500;background:rgba(var(--paper-rgb),.7);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid rgba(var(--ink-rgb),.08)}
.concept{background:var(--ink);color:var(--paper);font-size:11px;letter-spacing:.04em;text-align:center;padding:6px 16px}
.bar{display:flex;align-items:center;justify-content:space-between;gap:32px;padding:0 clamp(20px,3vw,48px);height:clamp(60px,8vw,72px)}
.brand{display:flex;align-items:baseline;min-width:0;font-family:var(--font-display);font-size:22px;letter-spacing:.06em;color:var(--ink)}
.brand:hover{color:var(--ink)}
.brand-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:38vw}
.nav{display:flex;gap:clamp(16px,2.2vw,36px);align-items:center;font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase}
.nav a{white-space:nowrap}
.bar-actions{display:flex;align-items:center;gap:16px;flex:none}
.btn-head{display:inline-flex;align-items:center;background:var(--accent);color:var(--paper);font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:12px 20px;white-space:nowrap}
.btn-head:hover{background:var(--ink);color:var(--paper)}
.icon-btn{background:none;border:1px solid rgba(var(--ink-rgb),.25);color:var(--ink);width:44px;height:44px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;list-style:none}
.icon-btn::-webkit-details-marker{display:none}
.icon-btn:hover{border-color:var(--accent);color:var(--ink)}
.menu-btn{flex-direction:column;gap:5px}
.menu-btn span{display:block;width:18px;height:2px;background:var(--ink)}
.theme{position:relative}
.theme-menu{position:absolute;top:52px;right:0;min-width:176px;display:flex;flex-direction:column;gap:2px;background:var(--paper);border:1px solid rgba(var(--ink-rgb),.15);box-shadow:0 16px 40px rgba(var(--ink-rgb),.2);padding:6px}
.theme-opt{display:flex;align-items:center;gap:10px;padding:9px 10px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ink);cursor:pointer}
.theme-opt:hover{background:rgba(var(--ink-rgb),.06)}
.theme-opt input{position:absolute;opacity:0;pointer-events:none}
.theme-opt:has(input:focus-visible){outline:2px solid var(--accent)}
.swatch{width:13px;height:13px;border-radius:50%;border:1px solid rgba(15,17,19,.25);flex:none}
.theme-name{flex:1}
.theme-check{opacity:0;color:var(--accent)}
.theme-opt:has(input:checked) .theme-check{opacity:1}
:root:not(:has(.th:checked)) #th-light~.theme-check{opacity:.35}
.progress-rail{height:2px;background:rgba(var(--ink-rgb),.06)}
.progress{height:2px;background:var(--accent);transform:scaleX(0);transform-origin:left}

/* overlay menu */
.overlay{position:fixed;inset:0;z-index:600;background:var(--paper);overflow:auto;visibility:hidden;opacity:0;clip-path:inset(0 0 100% 0);transition:clip-path .7s var(--ease),opacity .3s,visibility 0s .7s}
.overlay:target{visibility:visible;opacity:1;clip-path:inset(0);transition:clip-path .7s var(--ease),opacity .3s}
.overlay-bar{display:flex;justify-content:space-between;align-items:center;padding:16px clamp(20px,3vw,48px);height:72px;border-bottom:1px solid rgba(var(--ink-rgb),.08)}
.overlay-nav{display:flex;flex-direction:column;padding:clamp(24px,6vh,64px) clamp(20px,6vw,96px);gap:4px}
.overlay-row{overflow:hidden;border-bottom:1px solid rgba(var(--ink-rgb),.08)}
.overlay-row a{display:flex;align-items:baseline;gap:24px;padding:14px 0;font-family:var(--font-display);font-size:clamp(34px,6.5vw,84px);text-transform:uppercase;letter-spacing:.02em;line-height:1.05;transition:color .25s,padding-left .35s var(--ease),transform .8s var(--ease);transform:translateY(105%)}
.overlay:target .overlay-row a{transform:none;transition-delay:0s,0s,calc(var(--i) * 60ms + 150ms)}
.overlay-row a:hover{padding-left:18px}
.overlay-idx{font-family:var(--font-body);font-size:13px;font-weight:600;color:var(--accent);letter-spacing:.2em}
.overlay-meta{margin-top:40px;display:flex;flex-wrap:wrap;gap:16px 40px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:rgba(var(--ink-rgb),.5)}

/* buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;font-family:var(--font-body);font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;border:0;white-space:nowrap}
.btn--outline{border:1px solid rgba(var(--ink-rgb),.35);padding:16px 28px;color:var(--ink)}
.btn--outline:hover{background:var(--accent);border-color:var(--accent);color:var(--paper)}
.btn--solid{background:var(--accent);color:var(--paper);padding:17px 28px}
.btn--solid:hover{background:var(--ink);color:var(--paper)}
.btn--lg{padding:20px 44px;font-size:13px;letter-spacing:.18em}

/* hero */
.hero{position:relative;height:100vh;height:100svh;min-height:560px;overflow:hidden;display:flex;align-items:flex-end}
.hero-media{position:absolute;inset:0}
.hero-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 1.4s var(--ease)}
.hero-video.is-playing{opacity:1}
.hero-scrim{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(var(--paper-rgb),.55) 0%,rgba(var(--paper-rgb),.25) 40%,rgba(var(--paper-rgb),.92) 100%)}
.hero-tint{position:absolute;inset:0;pointer-events:none;background:var(--accent);mix-blend-mode:color;opacity:.1}
.blueprint{position:absolute;right:4vw;top:16vh;width:min(44vw,640px);opacity:.5;pointer-events:none}
.blueprint svg{width:100%;height:auto;will-change:transform}
.bp-ink{stroke:var(--ink)}
.bp-acc{stroke:var(--accent)}
.bp-acc circle{fill:var(--accent)}
.bp-text{fill:var(--ink);opacity:.5;font-family:var(--font-body)}
.hero-copy{position:relative;z-index:2;padding:0 clamp(20px,4vw,64px) clamp(48px,8vh,96px);width:100%}
.hero-eyebrow{display:flex;flex-wrap:wrap;align-items:baseline;gap:12px 20px;margin-bottom:18px}
.rule{width:64px;height:1px;background:var(--accent);display:inline-block}
.eyebrow-text{font-size:12px;font-weight:600;letter-spacing:.28em;text-transform:uppercase;color:rgba(var(--ink-rgb),.7)}
.hero h1{font-family:var(--font-display);line-height:.92;letter-spacing:.01em;text-transform:uppercase;overflow-wrap:anywhere}
.h1-xl{font-size:clamp(56px,10.5vw,168px)}
.h1-lg{font-size:clamp(46px,7.6vw,124px)}
.h1-md{font-size:clamp(38px,5.6vw,92px)}
.hero-bottom{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:28px;align-items:end}
.hero-lede{max-width:480px;font-size:clamp(15px,1.2vw,18px);line-height:1.6;color:rgba(var(--ink-rgb),.8)}
.hero-cta{display:flex;flex-wrap:wrap;gap:16px;justify-content:flex-end}
.scroll-hint{position:absolute;bottom:24px;right:clamp(20px,4vw,64px);z-index:2;display:flex;align-items:center;gap:12px;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:rgba(var(--ink-rgb),.55)}
.scroll-line{width:1px;height:40px;background:linear-gradient(var(--accent),transparent);display:block}

/* stats */
.stats{border-top:1px solid rgba(var(--ink-rgb),.1);border-bottom:1px solid rgba(var(--ink-rgb),.1);background:var(--paper)}
.stats-grid{display:grid;grid-template-columns:repeat(4,1fr)}
.stat-cell{padding:clamp(28px,3.5vw,56px) clamp(20px,3vw,48px);border-right:1px solid rgba(var(--ink-rgb),.1);min-width:0}
.stat-cell:last-child{border-right:0}
.stat-label{font-size:11px;font-weight:600;letter-spacing:.24em;text-transform:uppercase;color:var(--accent);margin-bottom:14px}
.stat-value{font-family:var(--font-display);font-size:clamp(40px,4.5vw,72px);line-height:1;overflow-wrap:anywhere}
.stat-value--text{font-size:clamp(28px,2.9vw,46px);text-transform:uppercase;line-height:1.05}
.stat-note{font-size:13px;color:rgba(var(--ink-rgb),.55);margin-top:10px}
.stat-note--ph{display:inline-block;border:1px dashed rgba(var(--ink-rgb),.3);padding:3px 8px;font-size:11px}

/* manifesto */
.manifesto{padding:clamp(80px,12vh,160px) clamp(20px,4vw,64px);position:relative}
.manifesto-eyebrow{margin-bottom:48px}
.manifesto-grid{display:grid;grid-template-columns:7fr 5fr;gap:clamp(32px,5vw,96px);align-items:center}
.manifesto h2{font-family:var(--font-display);font-size:clamp(30px,4vw,58px);line-height:1.12;text-transform:uppercase;letter-spacing:.01em}
.manifesto-body{margin-top:24px;font-size:clamp(15px,1.25vw,19px);line-height:1.7;color:rgba(var(--ink-rgb),.75);max-width:52ch}
.checks{list-style:none;display:grid;gap:12px;margin-top:28px}
.checks li{display:flex;gap:12px;align-items:flex-start;font-size:14px;letter-spacing:.04em;color:rgba(var(--ink-rgb),.8)}
.check{width:18px;height:18px;color:var(--accent);margin-top:1px;flex:none}
.manifesto-figure{position:relative;overflow:clip;aspect-ratio:4/5;background:var(--panel)}
.manifesto-img{position:absolute;inset:-8% 0}
.manifesto-fade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(15deg,rgba(var(--paper-rgb),.5),transparent 55%)}
.fig-tag{position:absolute;right:14px;top:14px;font-size:10px;letter-spacing:.2em;color:rgba(var(--ink-rgb),.7);border:1px dashed rgba(var(--ink-rgb),.3);padding:6px 10px;background:rgba(var(--paper-rgb),.35)}

/* services index */
.teaser{padding:clamp(60px,9vh,120px) 0;border-top:1px solid rgba(var(--ink-rgb),.1);position:relative}
.teaser-head,.projects-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px 20px;padding:0 clamp(20px,4vw,64px);margin-bottom:40px}
.teaser-rows{border-top:1px solid rgba(var(--ink-rgb),.1)}
.teaser-row{display:flex;align-items:baseline;gap:clamp(16px,3vw,48px);padding:clamp(20px,2.6vw,34px) clamp(20px,4vw,64px);border-bottom:1px solid rgba(var(--ink-rgb),.1);color:var(--ink);position:relative}
.teaser-row:hover{background:var(--accent);color:var(--paper)}
.teaser-idx{font-size:13px;font-weight:600;letter-spacing:.2em;min-width:44px;opacity:.6}
.teaser-name{flex:1 1 auto;min-width:0;font-family:var(--font-display);font-size:clamp(22px,4vw,54px);text-transform:uppercase;letter-spacing:.01em;line-height:1.05}
.teaser-tag{margin-left:auto;font-size:13px;letter-spacing:.06em;opacity:.65;max-width:320px;text-align:right;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.teaser-tag--ph{font-style:italic}
.teaser-thumb{position:absolute;right:calc(clamp(20px,4vw,64px) + 340px);top:50%;width:300px;height:200px;z-index:5;pointer-events:none;overflow:hidden;background:var(--panel);opacity:0;transform:translateY(-50%) rotate(-3deg) scale(.92);transition:opacity .35s var(--ease),transform .5s var(--ease);box-shadow:0 24px 50px -20px rgba(0,0,0,.45)}
.teaser-thumb img{filter:grayscale(.35) contrast(1.05)}
.teaser-thumb::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 45%,rgba(var(--paper-rgb),.75))}
.teaser-thumb-name{position:absolute;left:16px;bottom:14px;z-index:1;font-family:var(--font-display);font-size:15px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink)}
.teaser-thumb-idx{position:absolute;right:12px;top:12px;z-index:1;color:var(--accent);font-size:11px;letter-spacing:.2em}
@media (hover:hover) and (min-width:1000px){:root:not(.has-pointer) .teaser-row:hover .teaser-thumb{opacity:1;transform:translateY(-50%) rotate(-3deg) scale(1)}}
/* JS: the preview follows the cursor instead (Summit) */
.teaser-preview{position:fixed;left:0;top:0;width:300px;height:200px;z-index:60;pointer-events:none;opacity:0;transition:opacity .4s var(--ease)}
.teaser-preview.visible{opacity:1}
.teaser-preview .teaser-thumb{position:relative;right:auto;top:auto;opacity:1;transform:none;box-shadow:none;display:block;width:300px;height:200px}

/* custom cursor (JS, fine pointers only) */
.cursor-dot{position:fixed;z-index:9999;pointer-events:none;left:0;top:0;width:8px;height:8px;border-radius:50%;background:var(--accent);transform:translate(-100px,-100px)}
.cursor-ring{position:fixed;z-index:9998;pointer-events:none;left:0;top:0;width:64px;height:64px;border-radius:50%;border:1px solid rgba(var(--accent-rgb),.9);display:flex;align-items:center;justify-content:center;font:600 10px/1 var(--font-body);letter-spacing:.14em;color:#f5f3ee;background:rgba(15,17,19,.55);opacity:0;transform:translate(-100px,-100px) scale(.4);transition:opacity .3s,transform .3s var(--ease)}
.cursor-ring.is-active{opacity:1}

/* project reel */
.hs{position:relative;border-top:1px solid rgba(var(--ink-rgb),.1);padding:clamp(60px,9vh,120px) 0}
.hs-scroller{overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}
.hs-scroller::-webkit-scrollbar{display:none}
.hs-track{display:flex;gap:clamp(20px,2.5vw,40px);padding:0 clamp(20px,4vw,64px);width:max-content}
.project-card{display:block;width:min(72vw,560px);flex:none;scroll-snap-align:start}
.project-frame{position:relative;overflow:hidden;aspect-ratio:16/10;background:var(--panel)}
.project-frame>img,.project-frame>.ph{transition:transform 1.2s var(--ease)}
.project-card:hover .project-frame>img,.project-card:hover .project-frame>.ph{transform:scale(1.06)}
.project-scrim{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,transparent 55%,rgba(var(--paper-rgb),.85))}
.project-idx{position:absolute;left:20px;top:16px;font-family:var(--font-display);font-size:44px;color:transparent;-webkit-text-stroke:1px rgba(var(--ink-rgb),.4)}
.project-industry{position:absolute;right:16px;top:16px;font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--paper);background:var(--accent);padding:5px 10px}
.project-meta{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:4px 16px;margin-top:14px}
.project-name{font-family:var(--font-display);font-size:clamp(18px,1.6vw,24px);text-transform:uppercase;letter-spacing:.02em}
.project-stat{font-size:12px;color:rgba(var(--ink-rgb),.55);letter-spacing:.08em;white-space:nowrap}
.project-more{width:320px;flex:none;display:flex;align-items:center;justify-content:center;border:1px dashed rgba(var(--ink-rgb),.25);font-family:var(--font-display);font-size:24px;text-transform:uppercase;letter-spacing:.04em;scroll-snap-align:start}
.project-more:hover{border-color:var(--accent)}

/* statement marquee */
.safety{padding:clamp(70px,11vh,140px) 0;border-top:1px solid rgba(var(--ink-rgb),.1);border-bottom:1px solid rgba(var(--ink-rgb),.1);overflow:hidden;background:var(--panel)}
.marquee{overflow:hidden}
.marquee-track{display:flex;gap:64px;white-space:nowrap;width:max-content}
.safety-line{font-family:var(--font-display);font-size:clamp(64px,11vw,180px);text-transform:uppercase;letter-spacing:.02em;line-height:1.1;color:transparent;-webkit-text-stroke:1.5px rgba(var(--ink-rgb),.55)}
.safety-line .accent{-webkit-text-stroke:0;color:var(--accent)}
.safety-facts{display:flex;flex-wrap:wrap;justify-content:center;gap:12px 48px;margin-top:40px;padding:0 20px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:rgba(var(--ink-rgb),.5)}
.safety-facts a{color:rgba(var(--ink-rgb),.5)}
.safety-facts a:hover{color:var(--accent)}
.dot{color:var(--accent)}

/* contact */
.contact{padding:clamp(80px,12vh,160px) clamp(20px,4vw,64px);position:relative}
.contact-grid{display:grid;grid-template-columns:1fr 1.1fr;gap:clamp(40px,6vw,110px);align-items:start}
.contact-title{font-family:var(--font-display);font-size:clamp(48px,7vw,112px);line-height:.95;text-transform:uppercase;margin-top:28px}
.contact-lede{margin-top:24px;font-size:clamp(15px,1.2vw,18px);line-height:1.7;color:rgba(var(--ink-rgb),.75);max-width:46ch}
.contact-rows{margin:36px 0 28px;border-top:1px solid rgba(var(--ink-rgb),.1)}
.contact-rows div{display:grid;grid-template-columns:140px 1fr;gap:16px;padding:16px 0;border-bottom:1px solid rgba(var(--ink-rgb),.1)}
.contact-rows dt{font-size:11px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:var(--accent);padding-top:3px}
.contact-rows dd{font-size:15px;line-height:1.6;overflow-wrap:anywhere}
.qform{display:grid;grid-template-columns:1fr 1fr;gap:28px 32px;padding:clamp(28px,3.5vw,52px);background:var(--panel);border:1px solid rgba(var(--ink-rgb),.08)}
.qform-title{grid-column:1/-1;font-family:var(--font-display);font-size:clamp(22px,2.2vw,32px);text-transform:uppercase;letter-spacing:.02em}
.qform .full{grid-column:1/-1}
.field{position:relative;display:block;padding-top:20px}
.field input,.field textarea,.field select{width:100%;background:none;border:0;border-bottom:1px solid rgba(var(--ink-rgb),.25);border-radius:0;color:var(--ink);font:inherit;font-size:15px;padding:6px 0;outline:none;resize:vertical}
.field select{appearance:none;cursor:pointer;color:rgba(var(--ink-rgb),.7)}
.field select option{background:var(--paper);color:var(--ink)}
.field>span{position:absolute;left:0;top:26px;font-size:14px;color:rgba(var(--ink-rgb),.5);pointer-events:none;transform-origin:left top;transition:transform .35s var(--ease),color .25s}
.field input:focus+span,.field input:not(:placeholder-shown)+span,.field textarea:focus+span,.field textarea:not(:placeholder-shown)+span{transform:translateY(-22px) scale(.8);color:var(--accent);letter-spacing:.04em}
.field::after{content:"";position:absolute;left:0;bottom:0;width:100%;height:2px;background:var(--accent);transform:scaleX(0);transform-origin:left;transition:transform .5s var(--ease)}
.field-select::after{content:"↓";left:auto;right:0;bottom:8px;width:auto;height:auto;background:none;transform:none;font-size:13px;color:var(--accent);pointer-events:none}
.field:focus-within::after{transform:scaleX(1)}
.qform-note{font-size:12px;color:rgba(var(--ink-rgb),.5);letter-spacing:.04em}

/* closing CTA */
.cta{padding:clamp(90px,14vh,180px) clamp(20px,4vw,64px);text-align:center;position:relative;border-top:1px solid rgba(var(--ink-rgb),.1)}
.cta-eyebrow{font-size:12px;font-weight:600;letter-spacing:.28em;color:var(--accent);text-transform:uppercase;margin-bottom:20px}
.cta h2{margin:0 auto;font-family:var(--font-display);font-size:clamp(40px,7vw,110px);line-height:1;text-transform:uppercase;max-width:14ch}
.cta-actions{margin-top:40px;display:flex;justify-content:center}

/* footer */
.footer{border-top:1px solid rgba(var(--ink-rgb),.1);background:var(--panel);overflow:hidden}
.footer-grid{display:grid;grid-template-columns:2fr 1fr 1fr 1.4fr;gap:clamp(28px,4vw,64px);padding:clamp(48px,7vh,88px) clamp(20px,4vw,64px) 40px}
.footer-brand{display:flex;align-items:baseline;font-family:var(--font-display);font-size:26px;letter-spacing:.05em}
.footer-brand .brand-name{max-width:none;white-space:normal}
.tagline{margin:16px 0 0;font-size:14px;line-height:1.7;color:rgba(var(--ink-rgb),.6);max-width:34ch}
.address{margin-top:24px;font-size:13px;line-height:1.9;color:rgba(var(--ink-rgb),.6)}
.col{display:flex;flex-direction:column;gap:12px;font-size:13px;letter-spacing:.08em}
.col-title{display:block;font-size:11px;font-weight:700;letter-spacing:.24em;color:var(--accent);text-transform:uppercase;margin-bottom:6px}
.note{margin:12px 0 16px;font-size:13px;color:rgba(var(--ink-rgb),.6)}
.foot-link{display:block;font-size:14px;overflow-wrap:anywhere}
.btn-sub{display:inline-block;margin-top:18px;border:1px solid rgba(var(--ink-rgb),.3);padding:12px 24px;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase}
.btn-sub:hover{background:var(--accent);border-color:var(--accent);color:var(--paper)}
.bottom{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px 20px;padding:0 clamp(20px,4vw,64px) 16px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(var(--ink-rgb),.4)}
.social{display:flex;flex-wrap:wrap;gap:16px 24px}
.social a{color:rgba(var(--ink-rgb),.4)}
.social a.top{color:var(--accent)}
.credits{padding:0 clamp(20px,4vw,64px) 8px;font-size:11px;color:rgba(var(--ink-rgb),.4)}
.credits a{color:inherit;text-decoration:underline;text-underline-offset:2px}
.watermark{height:.62em;overflow:hidden;pointer-events:none;margin-top:16px}
.watermark-text{font-family:var(--font-display);line-height:.78;letter-spacing:.02em;text-align:center;white-space:nowrap;color:transparent;-webkit-text-stroke:1px rgba(var(--ink-rgb),.18)}
.callbar{display:none}

/* photo placeholders (until licensed photos are attached) */
.ph{position:relative;width:100%;height:100%;display:grid;place-items:center;color:rgba(255,255,255,.7);overflow:hidden}
.ph-icon{width:34px;height:34px;opacity:.55}
.ph-0{background:radial-gradient(120% 90% at 20% 10%,color-mix(in srgb,var(--accent) 50%,#15181b) 0%,#15181b 62%)}
.ph-1{background:radial-gradient(110% 80% at 80% 20%,color-mix(in srgb,var(--accent) 40%,#1b1e22) 0%,#1b1e22 100%)}
.ph-2{background:linear-gradient(160deg,#1b1e22 0%,color-mix(in srgb,var(--accent) 40%,#15181b) 100%)}
.ph-3{background:radial-gradient(90% 90% at 50% 100%,color-mix(in srgb,var(--accent) 45%,#15181b) 0%,#15181b 72%)}
.ph::after{content:"";position:absolute;inset:0;opacity:.12;background-image:linear-gradient(rgba(255,255,255,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.5) 1px,transparent 1px);background-size:32px 32px}

/* motion: everything is gated behind the reduced-motion preference */
@media (prefers-reduced-motion:no-preference){
  .kb{animation:kenburns 24s linear infinite alternate}
  .pulse{animation:pulseline 4s ease-in-out infinite}
  .marquee-track{animation:marquee 38s linear infinite}
  .ld-mask{animation:mask-in 1.1s var(--ease) both;animation-delay:calc(var(--d,0s) + .15s)}
  .ld-up{animation:up-in 1.1s var(--ease) both;animation-delay:calc(var(--d,0s) + .15s)}
  .ld-fade{animation:fade-in 1s var(--ease) both;animation-delay:calc(var(--d,0s) + .15s)}
  :root:not(.has-pointer) .btn--solid:hover,:root:not(.has-pointer) .btn--outline:hover,:root:not(.has-pointer) .btn-head:hover{transform:translateY(-2px)}
  .btn--solid,.btn--outline,.btn-head{transition:background-color .25s,border-color .25s,color .25s,transform .35s var(--ease)}
  @keyframes kenburns{0%{transform:scale(1) translate(0,0)}100%{transform:scale(1.12) translate(-1.5%,1%)}}
  @keyframes pulseline{0%,100%{opacity:.25}50%{opacity:.7}}
  @keyframes marquee{to{transform:translateX(calc(-50% - 32px))}}
  @keyframes mask-in{from{transform:translateY(105%)}to{transform:none}}
  @keyframes up-in{from{opacity:0;transform:translateY(46px)}to{opacity:1;transform:none}}
  @keyframes fade-in{from{opacity:0}to{opacity:1}}

  @supports (animation-timeline:view()){
    .sr-up{animation:up-in linear both;animation-timeline:view();animation-range:entry calc(var(--i,0) * 6%) entry calc(70% + var(--i,0) * 10%)}
    .sr-mask{animation:mask-in linear both;animation-timeline:view();animation-range:entry 0% entry 90%}
    .sr-clip{animation:clip-in linear both;animation-timeline:view();animation-range:entry 0% entry 80%}
    @keyframes clip-in{from{opacity:0;clip-path:inset(12% 8% 12% 8%)}to{opacity:1;clip-path:inset(0)}}
    .manifesto-img{animation:par linear both;animation-timeline:view();animation-range:cover}
    @keyframes par{from{transform:translateY(-6%)}to{transform:translateY(6%)}}
    .hero-media{animation:hero-par linear both;animation-timeline:scroll(root);animation-range:0 100vh}
    @keyframes hero-par{to{transform:translateY(14%)}}
    .blueprint{animation:bp-par linear both;animation-timeline:scroll(root);animation-range:0 100vh}
    @keyframes bp-par{to{transform:translateY(-12vh)}}
    .progress{animation:grow linear both;animation-timeline:scroll(root)}
    @keyframes grow{to{transform:scaleX(1)}}

    /* pinned horizontal project reel */
    @media (min-width:721px){
      .hs{height:320vh;padding:0;view-timeline:--reel block}
      .hs-sticky{position:sticky;top:0;height:100vh;overflow:clip;display:flex;flex-direction:column;justify-content:center;padding-top:60px}
      .hs-scroller{overflow:visible;scroll-snap-type:none}
      .hs-track{animation:reel linear both;animation-timeline:--reel;animation-range:contain 0% contain 100%}
      @keyframes reel{to{transform:translateX(calc(-100% + 100vw))}}
    }
  }
}

/* responsive */
@media (max-height:760px){.scroll-hint{display:none}}
@media (max-width:1100px){.nav{display:none}}
@media (max-width:900px){
  .btn-head,.blueprint{display:none}
  .hero-bottom,.manifesto-grid,.contact-grid{grid-template-columns:1fr}
  .hero-cta{justify-content:flex-start}
  .stats-grid{grid-template-columns:repeat(2,1fr)}
  .stat-cell{border-bottom:1px solid rgba(var(--ink-rgb),.1);padding:clamp(20px,5vw,32px) clamp(16px,4vw,24px)}
  .stat-cell:nth-child(2n){border-right:0}
  .stat-cell:nth-last-child(-n+2){border-bottom:0}
  .teaser-row{gap:16px}
  .teaser-idx{min-width:32px}
  .teaser-tag{display:none}
  .footer-grid{grid-template-columns:1fr 1fr}
}
@media (max-width:720px){
  .brand-name{max-width:52vw}
  .hero-cta .btn{flex:1 1 100%}
  .qform{grid-template-columns:1fr}
  .contact-rows div{grid-template-columns:1fr;gap:4px}
  .footer-grid{grid-template-columns:1fr}
  .safety-facts{flex-direction:column;align-items:center;gap:10px}
  .safety-facts .dot{display:none}
  .callbar{position:fixed;left:16px;right:16px;bottom:16px;z-index:400;display:flex;align-items:center;justify-content:center;gap:10px;height:52px;background:var(--accent);color:var(--paper);font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;box-shadow:0 12px 30px -10px rgba(0,0,0,.45)}
  .callbar:hover{color:var(--paper)}
  .callbar-icon{width:18px;height:18px}
  .footer{padding-bottom:84px}
}
`;
