#!/usr/bin/env node
// Attach only to the OH-Paseo debug WebView forwarded with hdc fport.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function connectArkWeb(endpoint = 'http://127.0.0.1:9226') {
  const targets = await (await fetch(`${endpoint}/json/list`, {
    signal: AbortSignal.timeout(10000),
  })).json();
  const pages = targets.filter((item) => item.type === 'page');
  const target = pages.length === 1 ? pages[0] : pages.find((item) => item.title === 'Paseo');
  if (!target) throw new Error('No Paseo WebView on the forwarded debug endpoint');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id) {
      for (const listener of listeners) listener(message);
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  function send(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 20000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  return {
    target,
    send,
    onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    },
    close() { socket.close(); },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const client = await connectArkWeb(process.env.OHPASEO_CDP_ENDPOINT);
  try {
    if (process.argv[2] === '--screenshot') {
      const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(process.argv[3], Buffer.from(data, 'base64'));
      console.log(process.argv[3]);
    } else {
      const expression = process.argv[2] === '--file'
        ? await readFile(process.argv[3], 'utf8')
        : process.argv[2] || '({url:location.href,title:document.title,text:document.body.innerText})';
      console.log(JSON.stringify(await client.evaluate(expression), null, 2));
    }
  } finally { client.close(); }
}
