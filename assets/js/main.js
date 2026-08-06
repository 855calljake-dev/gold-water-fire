// Gold Water Fire — small no-dependency site behavior.
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function initials(name) {
  return String(name).split(/\s+/).map(function (p) { return p[0]; }).join("").slice(0, 2).toUpperCase();
}

function renderTeam(data) {
  var list = document.getElementById("team-list");
  if (!list) return;
  var team = data.team || [];
  list.innerHTML = team.map(function (m) {
    return (
      '<div class="team-card">' +
        '<div class="avatar">' + esc(initials(m.name)) + "</div>" +
        "<h3>" + esc(m.name) + "</h3>" +
        '<div class="role">' + esc(m.role) + "</div>" +
        '<p class="bio">' + esc(m.bio || "") + "</p>" +
      "</div>"
    );
  }).join("");
}

document.addEventListener("DOMContentLoaded", function () {
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  if (document.getElementById("team-list")) {
    fetch("/data/team.json")
      .then(function (r) { return r.json(); })
      .then(renderTeam)
      .catch(function () {});
  }
});
