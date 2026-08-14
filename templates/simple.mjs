import { shell } from "./shell.mjs";

function simpleBody({ heading, body, ctas }) {
  return `
    <section class="page-hero">
      <div class="wrap">
        <h1>${heading}</h1>
        <p>${body}</p>
        <div class="hero-ctas" style="margin-top:24px">
          ${ctas.map((c, i) => `<a class="${i === 0 ? "btn-primary" : "btn-secondary"}" href="${c.href}">${c.label}</a>`).join("\n          ")}
        </div>
      </div>
    </section>`;
}

export function renderThanks() {
  return shell({
    path: "/thanks.html",
    title: "Request Received | Gold Water Fire",
    description: "Your request was received.",
    robotsNoindex: true,
    bodyHtml: simpleBody({
      heading: "Request received.",
      body: "Thanks, we'll follow up shortly. For active flooding or fire, call (480) 999-3339 now.",
      ctas: [
        { href: "tel:+14809993339", label: "Call (480) 999-3339" },
        { href: "/", label: "Back to Home" },
      ],
    }),
  });
}

export function render404() {
  return shell({
    path: "/404.html",
    title: "Page Not Found | Gold Water Fire",
    description: "That page doesn't exist.",
    robotsNoindex: true,
    bodyHtml: simpleBody({
      heading: "Page not found.",
      body: "That page doesn't exist. Head back to the homepage, or call us directly.",
      ctas: [
        { href: "/", label: "Back to Home" },
        { href: "tel:+14809993339", label: "Call (480) 999-3339" },
      ],
    }),
  });
}
