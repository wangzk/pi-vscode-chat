/**
 * Repro harness: drive the REAL webview (media/main.js) with mocked
 * acquireVsCodeApi, simulating: resume-from-history → new chat with
 * thinking, and webview-disposal-mid-think variants.
 *
 * Usage: bun __tests__/thinking-repro/run.ts
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT = join(__dirname, 'out');
mkdirSync(OUT, { recursive: true });

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="../../../media/style.css">
</head><body>
<div id="app">
  <div id="sessions-panel" class="hidden"><div id="sessions-panel-header"><span>Chat history</span><button id="btn-close-sessions">✕</button></div><div id="sessions-list"></div></div>
  <div id="team-monitor" class="hidden"><div id="team-monitor-header"><span>Agent team</span><span id="team-active-count" class="badge">0 active</span><span class="team-actions"><button id="btn-close-team">✕</button></span></div><div id="team-grid"></div></div>
  <div id="messages"></div>
  <div id="dialog-overlay" class="hidden"></div>
  <div id="bottom">
    <div id="status-bar" class="hidden"></div>
    <div id="widgets-container" class="hidden"></div>
    <div id="queue-bar" class="hidden"></div>
    <div id="changes-bar" class="hidden"></div>
    <div id="input-area">
      <div id="autocomplete" class="hidden"></div>
      <div id="input-container">
        <div id="attachment-list"></div>
        <textarea id="input" rows="1"></textarea>
        <div id="input-toolbar"><div class="left-actions"><button id="btn-attach"></button><button id="btn-key"></button><button id="btn-model"><span id="model-name"></span></button><button id="btn-thinking"><span id="thinking-level">off</span></button></div><div class="right-actions"><button id="btn-send"></button><button id="btn-abort" class="hidden"></button></div></div>
      </div>
      <div id="footer-bar"><div id="footer-left"><button id="btn-history">History</button><button id="btn-new">New chat</button><button id="btn-keys">Keys</button></div><div id="footer-stats"></div></div>
    </div>
  </div>
</div>
<script>
  window.__posted = [];
  window.__state = {}; // survives nothing; set per-scenario before scripts load
  window.acquireVsCodeApi = () => ({
    postMessage: (m) => window.__posted.push(m),
    getState: () => window.__getState ? window.__getState() : undefined,
    setState: (s) => { window.__setState = s; },
  });
</script>
<script src="../../../media/vendor.js"></script>
<script src="../../../media/main.js"></script>
</body></html>`;
writeFileSync(join(OUT, 'page.html'), html);

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const page = await browser.newPage();
page.on('pageerror', e => console.log('[PAGEERROR page1]', e.message));
await page.goto('file://' + join(OUT, 'page.html'));
await page.waitForTimeout(300);

const post = (m) => page.evaluate((d) => window.dispatchEvent(new MessageEvent('message', { data: d })), m);

const dump = () => page.evaluate(() => {
  const msgs = [...document.querySelectorAll('#messages .message')].map(el => {
    const role = el.classList.contains('user') ? 'user' : 'assistant';
    const id = el.dataset.msgId || '(no-id)';
    const content = el.querySelector('.message-content');
    const parts = [...(content?.children || [])].map(c => {
      if (c.classList.contains('thinking-block')) {
        const label = c.querySelector('.thinking-label')?.textContent;
        const hasShimmer = !!c.querySelector('.shimmer');
        const textLen = c.querySelector('.thinking-content')?.textContent?.length ?? 0;
        return `thinking[label=${label},shimmer=${hasShimmer},len=${textLen}]`;
      }
      if (c.classList.contains('streaming-text')) return `text[live=${c.classList.contains('live')},len=${c.textContent.length}]`;
      if (c.classList.contains('tool-card')) return `tool[running=${c.classList.contains('running')}]`;
      return c.className;
    });
    return `${role}#${id}: ${parts.join(' | ')}`;
  });
  return msgs;
});

// ═══ Scenario A: resume from history, then chat (happy path, no disposal) ═══
console.log('── Scenario A: resume → chat (sidebar stays visible) ──');
await post({ type: 'loadHistory', messages: [
  { role: 'user', content: 'previous question' },
  { role: 'assistant', content: [
    { type: 'thinking', thinking: 'old thought' },
    { type: 'text', text: 'old answer' },
  ]},
]});
await page.waitForTimeout(150); // let debounced saveState fire
console.log('after loadHistory:', JSON.stringify(await dump(), null, 1));

// new conversation with thinking
await post({ type: 'userMessage', text: 'new question' });
await post({ type: 'agentStart' });
await post({ type: 'thinkingDelta', messageId: 'current', blockIndex: 0, delta: 'let me think ' });
await post({ type: 'thinkingDelta', messageId: 'current', blockIndex: 0, delta: 'about this…' });
console.log('mid-think:', JSON.stringify(await dump(), null, 1));
await post({ type: 'thinkingEnd', messageId: 'current', blockIndex: 0, content: 'let me think about this…' });
await post({ type: 'textDelta', messageId: 'current', delta: 'Here is the answer.' });
await post({ type: 'agentEnd' });
await page.waitForTimeout(150);
console.log('after agentEnd:', JSON.stringify(await dump(), null, 1));

// ═══ Scenario B: webview disposed mid-think, restored, then events resume ═══
console.log('── Scenario B: disposal mid-think (sidebar hidden while thinking) ──');
const savedState = await page.evaluate(() => window.__setState);
// simulate fresh webview boot with the persisted state
const page2 = await browser.newPage();
await page2.addInitScript((st) => { window.__getState = () => st; }, savedState);
await page2.goto('file://' + join(OUT, 'page.html'));
await page2.waitForTimeout(300);
const post2 = (m) => page2.evaluate((d) => window.dispatchEvent(new MessageEvent('message', { data: d })), m);
const dump2 = () => page2.evaluate(() => [...document.querySelectorAll('#messages .message')].map(el => {
  const role = el.classList.contains('user') ? 'user' : 'assistant';
  const id = el.dataset.msgId || '(no-id)';
  const content = el.querySelector('.message-content');
  const parts = [...(content?.children || [])].map(c => {
    if (c.classList.contains('thinking-block')) {
      return `thinking[label=${c.querySelector('.thinking-label')?.textContent},shimmer=${!!c.querySelector('.shimmer')},len=${c.querySelector('.thinking-content')?.textContent?.length ?? 0}]`;
    }
    if (c.classList.contains('streaming-text')) return `text[live=${c.classList.contains('live')}]`;
    return c.className;
  });
  return `${role}#${id}: ${parts.join(' | ')}`;
}));

// NOTE: in scenario A we finished the turn cleanly; for B we need a mid-think snapshot.
// Rebuild: fresh page, mid-think state, then "dispose".
const page3 = await browser.newPage();
await page3.goto('file://' + join(OUT, 'page.html'));
await page3.waitForTimeout(300);
const post3 = (m) => page3.evaluate((d) => window.dispatchEvent(new MessageEvent('message', { data: d })), m);
await post3({ type: 'userMessage', text: 'q3' });
await post3({ type: 'agentStart' });
await post3({ type: 'thinkingDelta', messageId: 'current', blockIndex: 0, delta: 'partial thought…' });
await post3({ type: 'textDelta', messageId: 'current', delta: 'partial answer…' });
await page3.waitForTimeout(250); // debounced saveState persists mid-stream DOM
const midState = await page3.evaluate(() => window.__setState);
console.log('midState captured:', JSON.stringify(midState, (k,v) => k==='messages' ? (v||[]).map(m=>m.role) : v));

const page4 = await browser.newPage();
page4.on('pageerror', e => console.log('[PAGEERROR page4]', e.message));
await page4.addInitScript((st) => { window.__getState = () => st; }, midState);
await page4.goto('file://' + join(OUT, 'page.html'));
await page4.waitForTimeout(300);
const post4 = (m) => page4.evaluate((d) => window.dispatchEvent(new MessageEvent('message', { data: d })), m);
console.log('restored mid-think snapshot:', JSON.stringify(await page4.evaluate(() => [...document.querySelectorAll('#messages .message')].map(el => {
  const role = el.classList.contains('user') ? 'user' : 'assistant';
  const content = el.querySelector('.message-content');
  const parts = [...(content?.children || [])].map(c => {
    if (c.classList.contains('thinking-block')) return `thinking[label=${c.querySelector('.thinking-label')?.textContent},shimmer=${!!c.querySelector('.shimmer')}]`;
    if (c.classList.contains('streaming-text')) return `text[live=${c.classList.contains('live')}]`;
    return c.className;
  });
  return `${role}: ${parts.join(' | ')}`;
})), null, 1));
// agent still running: further events arrive to the restored webview
await post4({ type: 'thinkingDelta', messageId: 'current', blockIndex: 0, delta: ' more thinking' });
await post4({ type: 'thinkingEnd', messageId: 'current', blockIndex: 0, content: 'full thought' });
await post4({ type: 'textDelta', messageId: 'current', delta: ' final answer' });
await post4({ type: 'agentEnd' });
await page4.waitForTimeout(150);
console.log('after events resume on restored webview:', JSON.stringify(await page4.evaluate(() => [...document.querySelectorAll('#messages .message')].map(el => {
  const role = el.classList.contains('user') ? 'user' : 'assistant';
  const id = el.dataset.msgId || '(no-id)';
  const content = el.querySelector('.message-content');
  const parts = [...(content?.children || [])].map(c => {
    if (c.classList.contains('thinking-block')) return `thinking[label=${c.querySelector('.thinking-label')?.textContent},shimmer=${!!c.querySelector('.shimmer')},len=${c.querySelector('.thinking-content')?.textContent?.length ?? 0}]`;
    if (c.classList.contains('streaming-text')) return `text[live=${c.classList.contains('live')}]`;
    return c.className;
  });
  return `${role}#${id}: ${parts.join(' | ')}`;
})), null, 1));

await browser.close();
