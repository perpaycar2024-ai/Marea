/* ===== Marea — diario de dolor base y eventos agudos ===== */

const DB_NAME = 'marea_db';
const DB_VERSION = 1;
let db;

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const _db = e.target.result;
      if(!_db.objectStoreNames.contains('dias')){
        _db.createObjectStore('dias', { keyPath: 'fecha' });
      }
      if(!_db.objectStoreNames.contains('eventos')){
        const store = _db.createObjectStore('eventos', { keyPath: 'id', autoIncrement: true });
        store.createIndex('fecha', 'fecha', { unique: false });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => reject(e);
  });
}

function tx(storeName, mode = 'readonly'){
  return db.transaction(storeName, mode).objectStore(storeName);
}

function guardarDia(dia){
  return new Promise((resolve, reject) => {
    const req = tx('dias', 'readwrite').put(dia);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

function obtenerDia(fecha){
  return new Promise((resolve, reject) => {
    const req = tx('dias').get(fecha);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e);
  });
}

function obtenerTodosDias(){
  return new Promise((resolve, reject) => {
    const req = tx('dias').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e);
  });
}

function guardarEvento(evento){
  return new Promise((resolve, reject) => {
    const req = tx('eventos', 'readwrite').add(evento);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function borrarEvento(id){
  return new Promise((resolve, reject) => {
    const req = tx('eventos', 'readwrite').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

function obtenerEventosPorFecha(fecha){
  return new Promise((resolve, reject) => {
    const idx = tx('eventos').index('fecha');
    const req = idx.getAll(fecha);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e);
  });
}

function obtenerTodosEventos(){
  return new Promise((resolve, reject) => {
    const req = tx('eventos').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e);
  });
}

/* ===== Utilidades de fecha ===== */
function hoyISO(){ return new Date().toISOString().slice(0,10); }
function formatearFechaLarga(fechaISO){
  const d = new Date(fechaISO + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
}
function sumarDias(fechaISO, n){
  const d = new Date(fechaISO + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0,10);
}

/* ===== Estado ===== */
let mesActual = new Date();
let diaSeleccionadoCalendario = null;

/* ===== Tabs ===== */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if(btn.dataset.tab === 'calendario') renderCalendario();
    if(btn.dataset.tab === 'tendencia') renderTendencia();
    if(btn.dataset.tab === 'correlaciones') renderCorrelaciones();
  });
});

/* ===== HOY: sliders ===== */
const sliders = {
  dolor: document.getElementById('sliderDolor'),
  fatiga: document.getElementById('sliderFatiga'),
  niebla: document.getElementById('sliderNiebla')
};
const valores = {
  dolor: document.getElementById('valDolor'),
  fatiga: document.getElementById('valFatiga'),
  niebla: document.getElementById('valNiebla')
};
Object.keys(sliders).forEach(k => {
  sliders[k].addEventListener('input', () => valores[k].textContent = sliders[k].value);
});

async function cargarHoy(){
  document.getElementById('fechaActual').textContent = formatearFechaLarga(hoyISO());
  const dia = await obtenerDia(hoyISO());
  if(dia){
    sliders.dolor.value = dia.dolor; valores.dolor.textContent = dia.dolor;
    sliders.fatiga.value = dia.fatiga; valores.fatiga.textContent = dia.fatiga;
    sliders.niebla.value = dia.niebla; valores.niebla.textContent = dia.niebla;
    document.getElementById('suenoHoras').value = dia.suenoHoras || '';
    document.getElementById('suenoCalidad').value = dia.suenoCalidad || '';
    document.getElementById('notaHoy').value = dia.nota || '';
  } else {
    sliders.dolor.value = 3; valores.dolor.textContent = 3;
    sliders.fatiga.value = 3; valores.fatiga.textContent = 3;
    sliders.niebla.value = 2; valores.niebla.textContent = 2;
    document.getElementById('suenoHoras').value = '';
    document.getElementById('suenoCalidad').value = '';
    document.getElementById('notaHoy').value = '';
  }
  await renderEventosHoy();
  await renderAlerta();
}

document.getElementById('btnGuardarHoy').addEventListener('click', async () => {
  const dia = {
    fecha: hoyISO(),
    dolor: parseFloat(sliders.dolor.value),
    fatiga: parseFloat(sliders.fatiga.value),
    niebla: parseFloat(sliders.niebla.value),
    suenoHoras: parseFloat(document.getElementById('suenoHoras').value) || null,
    suenoCalidad: document.getElementById('suenoCalidad').value || null,
    nota: document.getElementById('notaHoy').value || ''
  };
  await guardarDia(dia);
  const btn = document.getElementById('btnGuardarHoy');
  const original = btn.textContent;
  btn.textContent = 'Guardado ✓';
  setTimeout(() => btn.textContent = original, 1400);
  await renderAlerta();
});

/* ===== Dictado por voz para la nota ===== */
const btnMic = document.getElementById('btnDictarNota');
let recognizing = false;
if('webkitSpeechRecognition' in window || 'SpeechRecognition' in window){
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = 'es-ES';
  recognition.continuous = false;
  recognition.interimResults = false;

  btnMic.addEventListener('click', () => {
    if(recognizing){ recognition.stop(); return; }
    recognition.start();
    recognizing = true;
    btnMic.classList.add('recording');
  });
  recognition.onresult = (e) => {
    const texto = e.results[0][0].transcript;
    const textarea = document.getElementById('notaHoy');
    textarea.value = (textarea.value ? textarea.value + ' ' : '') + texto;
  };
  recognition.onend = () => { recognizing = false; btnMic.classList.remove('recording'); };
  recognition.onerror = () => { recognizing = false; btnMic.classList.remove('recording'); };
} else {
  btnMic.style.display = 'none';
}

/* ===== Eventos agudos ===== */
const SINTOMAS = ['Náuseas','Aura','Fotofobia','Fonofobia','Rigidez','Mareo','Hormigueo'];
const TRIGGERS = ['Mal sueño','Estrés','Cambio de tiempo','Esfuerzo físico','Comida','Ciclo menstrual','Desconocido'];

document.querySelectorAll('.btn-evento').forEach(btn => {
  btn.addEventListener('click', () => abrirFormularioEvento(btn.dataset.tipo));
});

function abrirFormularioEvento(tipo){
  const existente = document.getElementById('formEventoTemp');
  if(existente) existente.remove();

  const form = document.createElement('div');
  form.id = 'formEventoTemp';
  form.style.cssText = 'background:var(--panel-2); border:1px solid var(--line); border-radius:10px; padding:14px; margin-top:12px;';
  form.innerHTML = `
    <div class="slider-row">
      <div class="slider-label"><span>Intensidad</span><b id="valIntensidadEv">5</b></div>
      <input type="range" min="0" max="10" step="0.5" value="5" id="sliderIntensidadEv" class="slider ${tipo === 'migrana' ? 'dolor' : 'fibro'}">
    </div>
    <div style="margin-bottom:10px;">
      <div class="ayuda" style="margin-bottom:6px;">Síntomas</div>
      <div id="chipsSintomas" style="display:flex; flex-wrap:wrap; gap:6px;"></div>
    </div>
    <div style="margin-bottom:10px;">
      <div class="ayuda" style="margin-bottom:6px;">Posibles desencadenantes</div>
      <div id="chipsTriggers" style="display:flex; flex-wrap:wrap; gap:6px;"></div>
    </div>
    <input type="text" id="alivioEv" placeholder="Qué tomaste o qué te alivió" style="width:100%; background:var(--panel); border:1px solid var(--line); border-radius:8px; color:var(--text); padding:9px; font-size:13px; margin-bottom:10px;">
    <div class="nota-row">
      <textarea id="notaEv" placeholder="Nota (opcional)" style="min-height:44px;"></textarea>
      <button id="btnDictarEv" class="btn-mic" title="Dictar">🎙️</button>
    </div>
    <div style="display:flex; gap:8px; margin-top:10px;">
      <button id="btnCancelarEv" class="btn-secundario" style="margin-top:0;">Cancelar</button>
      <button id="btnGuardarEv" class="btn-primario">Guardar evento</button>
    </div>
  `;
  document.getElementById('tab-hoy').querySelector('.card:last-child').appendChild(form);

  const chipsS = form.querySelector('#chipsSintomas');
  SINTOMAS.forEach(s => chipsS.appendChild(crearChip(s)));
  const chipsT = form.querySelector('#chipsTriggers');
  TRIGGERS.forEach(t => chipsT.appendChild(crearChip(t)));

  form.querySelector('#sliderIntensidadEv').addEventListener('input', (e) => {
    form.querySelector('#valIntensidadEv').textContent = e.target.value;
  });

  if('webkitSpeechRecognition' in window || 'SpeechRecognition' in window){
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.lang = 'es-ES'; rec.continuous = false; rec.interimResults = false;
    const micBtn = form.querySelector('#btnDictarEv');
    let grabando = false;
    micBtn.addEventListener('click', () => {
      if(grabando){ rec.stop(); return; }
      rec.start(); grabando = true; micBtn.classList.add('recording');
    });
    rec.onresult = (e) => {
      const ta = form.querySelector('#notaEv');
      ta.value = (ta.value ? ta.value + ' ' : '') + e.results[0][0].transcript;
    };
    rec.onend = () => { grabando = false; micBtn.classList.remove('recording'); };
  } else {
    form.querySelector('#btnDictarEv').style.display = 'none';
  }

  form.querySelector('#btnCancelarEv').addEventListener('click', () => form.remove());
  form.querySelector('#btnGuardarEv').addEventListener('click', async () => {
    const seleccionSintomas = [...chipsS.querySelectorAll('.chip-on')].map(c => c.textContent);
    const seleccionTriggers = [...chipsT.querySelectorAll('.chip-on')].map(c => c.textContent);
    const evento = {
      fecha: hoyISO(),
      tipo,
      intensidad: parseFloat(form.querySelector('#sliderIntensidadEv').value),
      sintomas: seleccionSintomas,
      triggers: seleccionTriggers,
      alivio: form.querySelector('#alivioEv').value || '',
      nota: form.querySelector('#notaEv').value || '',
      timestamp: Date.now()
    };
    await guardarEvento(evento);
    form.remove();
    await renderEventosHoy();
    await renderAlerta();
  });
}

function crearChip(texto){
  const chip = document.createElement('span');
  chip.textContent = texto;
  chip.style.cssText = 'font-size:11.5px; padding:6px 10px; border-radius:14px; border:1px solid var(--line); color:var(--text-dim); cursor:pointer;';
  chip.addEventListener('click', () => {
    chip.classList.toggle('chip-on');
    if(chip.classList.contains('chip-on')){
      chip.style.background = 'var(--dolor)'; chip.style.color = '#17140f'; chip.style.borderColor = 'var(--dolor)';
    } else {
      chip.style.background = 'transparent'; chip.style.color = 'var(--text-dim)'; chip.style.borderColor = 'var(--line)';
    }
  });
  return chip;
}

async function renderEventosHoy(){
  const lista = document.getElementById('listaEventosHoy');
  const eventos = await obtenerEventosPorFecha(hoyISO());
  if(eventos.length === 0){
    lista.innerHTML = '<div class="vacio-msg">Todavía no hay eventos hoy.</div>';
    return;
  }
  lista.innerHTML = '';
  eventos.forEach(ev => {
    const el = document.createElement('div');
    el.className = 'evento-item ' + (ev.tipo === 'fibro' ? 'fibro' : '');
    el.innerHTML = `<span>${ev.tipo === 'migrana' ? 'Migraña' : 'Fibromialgia'} · intensidad ${ev.intensidad}</span><span class="borrar" data-id="${ev.id}">✕</span>`;
    lista.appendChild(el);
  });
  lista.querySelectorAll('.borrar').forEach(b => {
    b.addEventListener('click', async () => {
      await borrarEvento(parseInt(b.dataset.id));
      await renderEventosHoy();
      await renderAlerta();
    });
  });
}

/* ===== Alerta de racha ===== */
async function renderAlerta(){
  const box = document.getElementById('alertaBox');
  const dias = await obtenerTodosDias();
  const ultimos = dias
    .filter(d => d.fecha <= hoyISO())
    .sort((a,b) => a.fecha.localeCompare(b.fecha))
    .slice(-4);

  if(ultimos.length < 3){ box.innerHTML = ''; return; }

  const primero = ultimos[0].dolor;
  const ultimo = ultimos[ultimos.length - 1].dolor;
  const subida = ultimo - primero;

  const eventosHoy = await obtenerEventosPorFecha(hoyISO());

  if(subida >= 2 && eventosHoy.length === 0){
    box.innerHTML = `
      <div class="alerta">
        <div class="txt">
          <b>El suelo está subiendo.</b> Dolor base +${subida.toFixed(1)} en los últimos ${ultimos.length} días, sin evento agudo todavía.
          <span>Vigila las próximas 24-48h — este patrón se ha repetido antes en tus registros.</span>
        </div>
      </div>`;
  } else {
    box.innerHTML = '';
  }
}

/* ===== Calendario ===== */
function nombreMes(fecha){
  return fecha.toLocaleDateString('es-ES', { month:'long', year:'numeric' });
}

document.getElementById('mesAnterior').addEventListener('click', () => {
  mesActual.setMonth(mesActual.getMonth() - 1);
  renderCalendario();
});
document.getElementById('mesSiguiente').addEventListener('click', () => {
  mesActual.setMonth(mesActual.getMonth() + 1);
  renderCalendario();
});

async function renderCalendario(){
  document.getElementById('mesLabel').textContent = nombreMes(mesActual);
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  const year = mesActual.getFullYear();
  const month = mesActual.getMonth();
  const primerDiaSemana = new Date(year, month, 1).getDay();
  const totalDias = new Date(year, month + 1, 0).getDate();

  const dias = await obtenerTodosDias();
  const eventos = await obtenerTodosEventos();
  const diasMap = Object.fromEntries(dias.map(d => [d.fecha, d]));
  const eventosMap = {};
  eventos.forEach(ev => {
    if(!eventosMap[ev.fecha]) eventosMap[ev.fecha] = [];
    eventosMap[ev.fecha].push(ev);
  });

  for(let i = 0; i < primerDiaSemana; i++){
    const vacio = document.createElement('div');
    vacio.className = 'cal-dia vacio';
    grid.appendChild(vacio);
  }

  for(let d = 1; d <= totalDias; d++){
    const fechaISO = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const el = document.createElement('div');
    el.className = 'cal-dia';
    el.textContent = d;

    const dia = diasMap[fechaISO];
    if(dia){
      const promedio = (dia.dolor + dia.fatiga + dia.niebla) / 3;
      const color = promedio >= 6 ? 'var(--dolor)' : promedio >= 3.5 ? 'var(--fatiga)' : 'var(--bueno)';
      el.style.background = `color-mix(in srgb, ${color} 45%, var(--panel-2))`;
      el.style.borderColor = color;
    }
    const evs = eventosMap[fechaISO];
    if(evs && evs.length){
      const dot = document.createElement('div');
      dot.className = 'evento-dot';
      dot.style.background = evs.some(e => e.tipo === 'migrana') ? 'var(--migrana)' : 'var(--fibro)';
      el.appendChild(dot);
    }
    el.addEventListener('click', () => mostrarDetalleDia(fechaISO, dia, evs || []));
    grid.appendChild(el);
  }
}

function mostrarDetalleDia(fechaISO, dia, eventos){
  const box = document.getElementById('diaDetalle');
  box.style.display = 'block';
  let html = `<h2>${formatearFechaLarga(fechaISO)}</h2>`;
  if(dia){
    html += `<p class="ayuda">Dolor ${dia.dolor} · Fatiga ${dia.fatiga} · Niebla ${dia.niebla}${dia.suenoHoras ? ' · Sueño ' + dia.suenoHoras + 'h' : ''}</p>`;
    if(dia.nota) html += `<p class="ayuda">"${dia.nota}"</p>`;
  } else {
    html += `<p class="ayuda">No hay línea base registrada este día.</p>`;
  }
  if(eventos.length){
    html += '<div class="lista-eventos" style="margin-top:10px;">';
    eventos.forEach(ev => {
      html += `<div class="evento-item ${ev.tipo === 'fibro' ? 'fibro' : ''}"><span>${ev.tipo === 'migrana' ? 'Migraña' : 'Fibromialgia'} · intensidad ${ev.intensidad}${ev.triggers.length ? ' · ' + ev.triggers.join(', ') : ''}</span></div>`;
    });
    html += '</div>';
  }
  box.innerHTML = html;
}

/* ===== Tendencia (canvas nativo, sin librerías) ===== */
async function renderTendencia(){
  const canvas = document.getElementById('franjaCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  const dias = await obtenerTodosDias();
  const eventos = await obtenerTodosEventos();

  const fechas = [];
  for(let i = 29; i >= 0; i--) fechas.push(sumarDias(hoyISO(), -i));

  const diasMap = Object.fromEntries(dias.map(d => [d.fecha, d]));
  const eventosMap = {};
  eventos.forEach(ev => {
    if(!eventosMap[ev.fecha]) eventosMap[ev.fecha] = [];
    eventosMap[ev.fecha].push(ev);
  });

  const padding = 24;
  const plotW = W - padding * 2;
  const plotH = H - padding * 2;
  const stepX = plotW / (fechas.length - 1);
  const escalaY = (v) => padding + plotH - (v / 10) * plotH;

  // líneas guía
  ctx.strokeStyle = '#38322680';
  ctx.lineWidth = 1;
  [0,5,10].forEach(v => {
    const y = escalaY(v);
    ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(W - padding, y); ctx.stroke();
  });

  function dibujarLinea(campo, color){
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let empezado = false;
    fechas.forEach((f, i) => {
      const dia = diasMap[f];
      if(!dia || dia[campo] === null || dia[campo] === undefined) return;
      const x = padding + i * stepX;
      const y = escalaY(dia[campo]);
      if(!empezado){ ctx.moveTo(x,y); empezado = true; } else { ctx.lineTo(x,y); }
    });
    ctx.stroke();
  }

  dibujarLinea('niebla', '#7896b3');
  dibujarLinea('fatiga', '#c9a04f');
  dibujarLinea('dolor', '#d4634a');

  // eventos como puntos
  fechas.forEach((f, i) => {
    const evs = eventosMap[f];
    if(!evs) return;
    const x = padding + i * stepX;
    evs.forEach(ev => {
      const y = escalaY(ev.intensidad);
      ctx.fillStyle = ev.tipo === 'migrana' ? '#e0533a' : '#9b84b8';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#17140f';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  });

  if(dias.length === 0 && eventos.length === 0){
    ctx.fillStyle = '#6e6555';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Todavía no hay suficientes registros', W/2, H/2);
  }
}

/* ===== Correlaciones ===== */
async function renderCorrelaciones(){
  const box = document.getElementById('correlacionesBox');
  const dias = await obtenerTodosDias();
  const eventos = await obtenerTodosEventos();
  const diasMap = Object.fromEntries(dias.map(d => [d.fecha, d]));

  if(eventos.length < 3){
    box.innerHTML = '<div class="vacio-msg">Necesitas al menos 3 eventos registrados para ver patrones fiables. Sigue registrando.</div>';
    return;
  }

  // 1. % eventos precedidos por sueño <6h el día anterior
  let conSuenoBajo = 0, conDatoSueno = 0;
  eventos.forEach(ev => {
    const ayer = sumarDias(ev.fecha, -1);
    const diaAyer = diasMap[ayer];
    if(diaAyer && diaAyer.suenoHoras !== null && diaAyer.suenoHoras !== undefined){
      conDatoSueno++;
      if(diaAyer.suenoHoras < 6) conSuenoBajo++;
    }
  });
  const pctSueno = conDatoSueno > 0 ? Math.round((conSuenoBajo / conDatoSueno) * 100) : null;

  // 2. % eventos precedidos por subida de dolor base (>=2 puntos en 3 días previos)
  let conSubida = 0, conDatosBase = 0;
  eventos.forEach(ev => {
    const f0 = sumarDias(ev.fecha, -3);
    const f1 = sumarDias(ev.fecha, -1);
    const d0 = diasMap[f0], d1 = diasMap[f1];
    if(d0 && d1){
      conDatosBase++;
      if(d1.dolor - d0.dolor >= 2) conSubida++;
    }
  });
  const pctSubida = conDatosBase > 0 ? Math.round((conSubida / conDatosBase) * 100) : null;

  // 3. triggers más repetidos
  const contadorTriggers = {};
  eventos.forEach(ev => (ev.triggers || []).forEach(t => contadorTriggers[t] = (contadorTriggers[t] || 0) + 1));
  const triggerTop = Object.entries(contadorTriggers).sort((a,b) => b[1]-a[1])[0];

  let html = '';
  if(pctSubida !== null){
    html += `<div class="corr-card"><div class="pct" style="color:var(--dolor)">${pctSubida}%</div><div class="desc"><b>Aviso temprano</b> — de tus eventos con datos suficientes, este porcentaje vino precedido de una subida de 2+ puntos en el dolor base los 3 días previos.</div></div>`;
  }
  if(pctSueno !== null){
    html += `<div class="corr-card"><div class="pct" style="color:var(--fatiga)">${pctSueno}%</div><div class="desc"><b>Sueño</b> — este porcentaje de tus eventos vinieron precedidos de una noche con menos de 6h de sueño.</div></div>`;
  }
  if(triggerTop){
    html += `<div class="corr-card"><div class="pct" style="color:var(--fibro)">${triggerTop[1]}×</div><div class="desc"><b>Desencadenante más repetido</b> — "${triggerTop[0]}" aparece marcado en ${triggerTop[1]} de tus eventos.</div></div>`;
  }
  if(html === '') html = '<div class="vacio-msg">Sigue registrando la línea base diaria junto a los eventos para desbloquear patrones.</div>';
  box.innerHTML = html;
}

/* ===== Backup / restore ===== */
document.getElementById('btnExportar').addEventListener('click', async () => {
  const dias = await obtenerTodosDias();
  const eventos = await obtenerTodosEventos();
  const backup = { version: 1, exportado: new Date().toISOString(), dias, eventos };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `marea-backup-${hoyISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('inputImportar').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const status = document.getElementById('importarStatus');
  try{
    const texto = await file.text();
    const backup = JSON.parse(texto);
    if(!backup.dias || !backup.eventos) throw new Error('formato inválido');

    for(const dia of backup.dias) await guardarDia(dia);
    for(const ev of backup.eventos){
      const evSinId = { ...ev };
      delete evSinId.id;
      await guardarEvento(evSinId);
    }
    status.textContent = `Restaurado: ${backup.dias.length} días y ${backup.eventos.length} eventos.`;
    status.style.color = 'var(--bueno)';
  } catch(err){
    status.textContent = 'No se pudo leer el archivo. Comprueba que es un backup válido de Marea.';
    status.style.color = 'var(--dolor)';
  }
  e.target.value = '';
});

document.getElementById('btnBorrarTodo').addEventListener('click', async () => {
  if(!confirm('¿Seguro? Esto borra todos tus registros de este dispositivo y no se puede deshacer.')) return;
  await new Promise((resolve) => { const r = tx('dias','readwrite').clear(); r.onsuccess = resolve; });
  await new Promise((resolve) => { const r = tx('eventos','readwrite').clear(); r.onsuccess = resolve; });
  await cargarHoy();
  alert('Datos borrados.');
});

/* ===== Arranque ===== */
(async () => {
  await openDB();
  await cargarHoy();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
