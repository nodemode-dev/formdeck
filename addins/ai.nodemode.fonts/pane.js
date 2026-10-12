const SUGGESTED = ['Inter', 'Arial', 'Calibri', 'Cambria', 'Georgia', 'Helvetica', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Courier New', 'DM Sans', 'Figtree', 'IBM Plex Sans', 'Archivo', 'Libre Baskerville', 'JetBrains Mono'];
const pending = new Map();
let seq = 0;
let timer = 0;
let busy = false;

function call(fn, ...args) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    parent.postMessage({ fd: 'call', id, fn, args }, '*');
  });
}

function applyTheme(t) {
  if (!t) return;
  const s = document.documentElement.style;
  for (const [k, v] of Object.entries(t)) s.setProperty('--' + k, v);
}

const $ = (id) => document.getElementById(id);

function say(text, bad) {
  const m = $('msg');
  if (m.textContent !== text) m.textContent = text;
  m.classList.toggle('err', !!bad);
}

function draw(data) {
  const list = $('fonts');
  const from = $('from');
  const keep = from.value;
  data.fonts.forEach((f, i) => {
    let li = list.children[i];
    if (!li) {
      li = document.createElement('li');
      li.append(document.createElement('span'), document.createElement('span'));
      li.children[0].className = 'name';
      li.children[1].className = 'meta';
      list.appendChild(li);
    }
    const role = [f.heading ? 'heading' : '', f.body ? 'body' : ''].filter(Boolean).join(' and ');
    const meta = f.runs + (f.runs === 1 ? ' run' : ' runs') + (role ? ', theme ' + role : '');
    if (li.children[0].textContent !== f.name) li.children[0].textContent = f.name;
    if (li.children[1].textContent !== meta) li.children[1].textContent = meta;
    let opt = from.options[i];
    if (!opt) { opt = document.createElement('option'); from.appendChild(opt); }
    if (opt.value !== f.name) { opt.value = f.name; opt.textContent = f.name; }
  });
  while (list.children.length > data.fonts.length) list.lastElementChild.remove();
  while (from.options.length > data.fonts.length) from.remove(from.options.length - 1);
  if (data.fonts.some((f) => f.name === keep)) from.value = keep;
  $('go').disabled = busy || !data.fonts.length;
}

function refresh() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try { draw(await call('listFonts')); } catch (e) { say(e.message, true); }
  }, 60);
}

async function replace() {
  busy = true;
  $('go').disabled = true;
  try {
    const r = await call('replaceFont', $('from').value, $('to').value);
    const bits = [];
    if (r.runs) bits.push(r.runs + (r.runs === 1 ? ' run' : ' runs'));
    if (r.roles) bits.push(r.roles + (r.roles === 1 ? ' theme font' : ' theme fonts'));
    say('Replaced ' + bits.join(' and ') + '.', false);
  } catch (e) {
    say(e.message, true);
  }
  busy = false;
  refresh();
}

const choices = $('choices');
for (const name of SUGGESTED) {
  const o = document.createElement('option');
  o.value = name;
  choices.appendChild(o);
}
$('go').addEventListener('click', replace);
$('to').addEventListener('keydown', (e) => { if (e.key === 'Enter') replace(); });

window.addEventListener('message', (e) => {
  if (e.source !== parent) return;
  const m = e.data || {};
  if (m.fd === 'result') {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (p) (m.ok ? p.resolve(m.value) : p.reject(new Error(m.error)));
  } else if (m.fd === 'init') {
    applyTheme(m.theme);
    refresh();
  } else if (m.fd === 'event' && !busy) {
    refresh();
  }
});

parent.postMessage({ fd: 'ready' }, '*');
