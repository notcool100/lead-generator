/**
 * Development-only sample "existing websites" used by the mock lead provider so
 * the website analyzer can be exercised end-to-end without touching real sites.
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function GET(req: Request, ctx: RouteContext<"/mock-sites/[variant]">) {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_MOCK_SITES !== "true") return new Response("Not found", { status: 404 });
  const { variant } = await ctx.params;
  const name = esc(new URL(req.url).searchParams.get("name") ?? "Sample Business");
  let html: string;
  if (variant === "poor") {
    html = `<html><head><title>${name}</title></head><body bgcolor="#ffffcc"><table width="760"><tr><td width="760"><font size="5">Welcome to ${name}</font><br><img src="/x.gif"></td></tr><tr><td width="760">Under new management. Call us.</td></tr></table><p>&copy; 2014 ${name}</p></body></html>`;
  } else if (variant === "outdated") {
    html = `<html><head><title>${name} - Home</title><meta name="description" content="${name}"><script src="/js/jquery-1.7.2.min.js"></script></head><body><div style="width:960px;margin:auto"><h1 style="color:#333">${name}</h1><div style="float:left"><a href="/menu">Menu</a> | <a href="/contact">Contact us</a></div><p style="font-size:12px">We serve the local community. Opening hours Monday to Saturday. Find us on the high street. ${"Lorem ipsum dolor sit amet. ".repeat(20)}</p><h2>About</h2><h3>Location</h3><img src="/a.jpg" alt="front"><p>Phone: <a href="tel:+005550000">+00 555 0000</a></p><p>Copyright © 2019 ${name}</p></div></body></html>`;
  } else {
    html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title><meta name="description" content="${name} — modern local business"><meta property="og:title" content="${name}"><link rel="icon" href="/favicon.ico"><script type="application/ld+json">{"@type":"LocalBusiness"}</script></head><body><header><nav><a href="#menu">Menu</a><a href="#book">Book a table</a></nav></header><main><h1>${name}</h1><h2>Seasonal food</h2><h2>Our story</h2><h3>Visit</h3><p>${"Fresh local ingredients cooked with care every day. ".repeat(40)}</p><img src="/a.jpg" alt="dining room"><img src="/b.jpg" alt="dish"><a href="#book">Reserve now</a><a href="mailto:hello@example.com">hello@example.com</a><a href="https://instagram.com/example">Instagram</a></main><footer>© ${new Date().getFullYear()} ${name}</footer></body></html>`;
  }
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
