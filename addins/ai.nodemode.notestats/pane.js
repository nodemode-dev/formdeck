const pending = new Map();
let seq = 0;
let timer = 0;

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

const clock = (sec) => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');

function put(id, value) {
  const node = document.getElementById(id);
  if (node.textContent !== value) node.textContent = value;
}

function draw(data) {
  put('words', String(data.words));
  put('time', clock(data.seconds));
  const here = data.rows.find((r) => r.id === data.current);
  put('here', String(here ? here.words : 0));
  const list = document.getElementById('rows');
  data.rows.forEach((r, i) => {
    let li = list.children[i];
    if (!li) {
      li = document.createElement('li');
      li.className = 'row';
      for (const c of ['n', 't', 'w', 's']) {
        const span = document.createElement('span');
        span.className = c;
        li.appendChild(span);
      }
      list.appendChild(li);
    }
    const [n, t, w, s] = li.children;
    li.classList.toggle('is-current', r.id === data.current);
    li.classList.toggle('is-hidden', r.hidden);
    if (n.textContent !== String(r.n)) n.textContent = String(r.n);
    if (t.textContent !== r.title) t.textContent = r.title;
    if (w.textContent !== String(r.words)) w.textContent = String(r.words);
    const secs = r.hidden ? '' : clock(Math.round((r.words / data.wpm) * 60));
    if (s.textContent !== secs) s.textContent = secs;
  });
  while (list.children.length > data.rows.length) list.lastElementChild.remove();
}

function refresh() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const err = document.getElementById('err');
    try {
      draw(await call('notesStats'));
      err.hidden = true;
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    }
  }, 60);
}

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
  } else if (m.fd === 'event') {
    refresh();
  }
});

parent.postMessage({ fd: 'ready' }, '*');
