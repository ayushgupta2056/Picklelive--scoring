
// All times in seconds from start. V = voice offset (voice track starts at V).
const V = 0.6;
const CAPS = [
  [0.00, 1.96, "Running a team pickleball tournament?"],
  [1.96, 3.57, "Make every <em>point</em> count."],
  [3.57, 4.99, "Meet <em>PickleLive</em>."],
  [4.99, 7.32, "Every tie, <em>live on the big screen</em>."],
  [7.32, 11.06, "Scores, courts and players update the moment a rally ends."],
  [11.06, 12.94, "Referees score from <em>any phone</em>."],
  [12.94, 14.53, "Just tap who won the rally."],
  [14.53, 18.08, "PickleLive handles the serve order, side outs and the score call."],
  [18.08, 21.21, "Fans follow on their own <em>phones, tablets and laptops</em>."],
  [21.21, 24.70, "One link. No app. <em>No refresh.</em>"],
  [24.70, 29.51, "Organisers set up categories, lineups and the schedule in minutes, with eligibility checked automatically."],
  [29.51, 30.46, "<em>PickleLive.</em>"],
  [30.46, 32.90, "Live team pickleball, point by point."],
  [32.90, 34.60, "Bring it to your next tournament."],
];
const SCENES = [
  ["s-intro", 0, 3.57 + V], ["s-logo", 3.57 + V, 4.99 + V], ["s-tv", 4.99 + V, 11.06 + V], ["s-ref", 11.06 + V, 18.08 + V],
  ["s-dev", 18.08 + V, 24.70 + V], ["s-adm", 24.70 + V, 29.51 + V], ["s-out", 29.51 + V, 99],
];
const LINES = [["i1", 0.2], ["i2", 1.96 + V], ["l1", 3.57 + V], ["o1", 29.51 + V], ["o2", 30.46 + V], ["o3", 32.9 + V], ["o4", 33.4 + V]];
window.setSrc = (map) => { for (const [id, src] of Object.entries(map)) document.getElementById(id).src = src; };
window.startAd = () => {
  const t0 = performance.now();
  const cap = document.getElementById("cap");
  const tick = () => {
    const t = (performance.now() - t0) / 1000;
    for (const [id, a, b] of SCENES) document.getElementById(id).classList.toggle("on", t >= a && t < b);
    for (const [id, a] of LINES) document.getElementById(id).classList.toggle("on", t >= a);
    const c = CAPS.find(([a, b]) => t >= a + V && t < b + V);
    if (c) { if (cap.dataset.k !== String(c[0])) { cap.innerHTML = c[2]; cap.dataset.k = String(c[0]); } cap.classList.add("on"); } else cap.classList.remove("on");
    window.__t = t;
    requestAnimationFrame(tick);
  };
  tick();
};
