const { chromium } = require('playwright');
const U = 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: '/tmp/claude-0/ad/raw', size: { width: 1920, height: 1080 } } });
  const page = await ctx.newPage();
  const videoT0 = Date.now();
  await page.request.post(U + '/api/auth/login', { data: { email: 'admin@picklelive.local', password: 'changeme123' } });
  const bundle = await (await page.request.get(U + '/api/public/t/demo-cup')).json();
  const tour = bundle.tournament;
  const live = bundle.ties.flatMap((t) => t.matches).find((m) => m.status === 'LIVE');
  const tie = bundle.ties.find((t) => t.id === live.tieId);
  const { refPath } = await (await page.request.get(U + '/api/admin/matches/' + live.id)).json();
  const token = refPath.split('token=')[1];
  await page.goto(U + '/ad.html');
  await page.evaluate((m) => window.setSrc(m), {
    'f-tv': '/t/demo-cup/tv',
    'f-ref': refPath,
    'f-lap': `/t/demo-cup/tie/${tie.id}`,
    'f-tab': `/t/demo-cup/match/${live.id}`,
    'f-pho': '/t/demo-cup',
    'f-adm': `/admin/t/${tour.id}/ties/${tie.id}`,
  });
  await sleep(7000);
  const state = async () => (await (await page.request.get(U + '/api/public/matches/' + live.id)).json());
  // choose a winner that never ends the game (keeps the demo match live throughout)
  const safeWinner = (st, pref) => {
    const s = st.state;
    const w = pref;
    const ends = s.gamePoint.includes(w) && (s.config.scoringType === 'RALLY' || s.servingTeam === w);
    return ends ? (w === 'A' ? 'B' : 'A') : w;
  };
  const apiRally = async (pref) => {
    const d = await state();
    const w = safeWinner(d, pref);
    await page.request.post(`${U}/api/ref/${live.id}/events`, { headers: { 'x-ref-token': token }, data: { seq: d.match.seq + 1, idempotencyKey: 'ad-' + Math.random().toString(36).slice(2) + Date.now(), event: { type: 'RALLY', payload: { winner: w } } } });
  };
  const ref = page.frameLocator('#f-ref');
  const tapRally = async (pref) => {
    const d = await state();
    const w = safeWinner(d, pref);
    await ref.locator(`[data-testid=rally-${w}]:visible`).click();
  };
  const startWall = Date.now();
  await page.evaluate(() => window.startAd());
  const at = async (sec, fn) => { const wait = startWall + sec * 1000 - Date.now(); if (wait > 0) await sleep(wait); await fn().catch((e) => console.log('action err', e.message)); };
  // TV scene (5.6–11.7)
  await at(6.6, () => apiRally('A'));
  await at(8.1, () => apiRally('A'));
  await at(9.6, () => apiRally('B'));
  await at(11.0, () => apiRally('B'));
  // referee scene (11.7–18.7): real taps on the phone
  await at(13.0, () => tapRally('B'));
  await at(14.5, () => tapRally('B'));
  await at(16.0, () => tapRally('A'));
  await at(17.5, () => tapRally('A'));
  // devices (18.7–25.3)
  await at(19.6, () => apiRally('A'));
  await at(21.1, () => apiRally('B'));
  await at(22.6, () => apiRally('B'));
  await at(24.1, () => apiRally('A'));
  // admin (25.3–30.1): scroll to the lineup eligibility
  await at(26.2, () => page.frames().find((f) => f.url().includes('/admin/t/')).evaluate(() => window.scrollTo({ top: 260, behavior: 'smooth' })));
  await at(36.9, async () => {});
  const offset = (startWall - videoT0) / 1000;
  await page.close();
  const path = await page.video().path();
  await ctx.close(); await b.close();
  require('fs').writeFileSync('/tmp/claude-0/ad/meta.json', JSON.stringify({ path, offset }));
  console.log({ path, offset });
})();
