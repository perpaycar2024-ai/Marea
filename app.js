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
function formatearFechaCorta(fechaISO){
  const d = new Date(fechaISO + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function sumarDias(fechaISO, n){
  const d = new Date(fechaISO + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0,10);
}

/* ===== Modal propio (sustituye a alert/confirm nativos) ===== */
function modalAlert(mensaje, titulo = 'Aviso'){
  return new Promise((resolve) => {
    const overlay = document.getElementById('modalOverlay');
    document.getElementById('modalTitulo').textContent = titulo;
    document.getElementById('modalMensaje').textContent = mensaje;
    const botones = document.getElementById('modalBotones');
    botones.innerHTML = '';
    const btnOk = document.createElement('button');
    btnOk.textContent = 'Vale';
    btnOk.className = 'modal-btn-ok';
    btnOk.addEventListener('click', () => { overlay.style.display = 'none'; resolve(); });
    botones.appendChild(btnOk);
    overlay.style.display = 'flex';
  });
}

function modalConfirm(mensaje, titulo = '¿Seguro?'){
  return new Promise((resolve) => {
    const overlay = document.getElementById('modalOverlay');
    document.getElementById('modalTitulo').textContent = titulo;
    document.getElementById('modalMensaje').textContent = mensaje;
    const botones = document.getElementById('modalBotones');
    botones.innerHTML = '';
    const btnCancelar = document.createElement('button');
    btnCancelar.textContent = 'Cancelar';
    btnCancelar.className = 'modal-btn-cancelar';
    btnCancelar.addEventListener('click', () => { overlay.style.display = 'none'; resolve(false); });
    const btnConfirmar = document.createElement('button');
    btnConfirmar.textContent = 'Sí, seguro';
    btnConfirmar.className = 'modal-btn-confirmar';
    btnConfirmar.addEventListener('click', () => { overlay.style.display = 'none'; resolve(true); });
    botones.appendChild(btnCancelar);
    botones.appendChild(btnConfirmar);
    overlay.style.display = 'flex';
  });
}

/* ===== Estado ===== */

/* ===== Tabs ===== */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if(btn.dataset.tab === 'hoy') cargarHoy();
    if(btn.dataset.tab === 'resumen') renderResumen();
    if(btn.dataset.tab === 'ajustes') { /* nada que precargar */ }
  });
});

/* ===== HOY: sliders ===== */
const sliders = {
  dolor: document.getElementById('sliderDolor'),
  fatiga: document.getElementById('sliderFatiga')
};
const valores = {
  dolor: document.getElementById('valDolor'),
  fatiga: document.getElementById('valFatiga')
};
Object.keys(sliders).forEach(k => {
  sliders[k].addEventListener('input', () => valores[k].textContent = sliders[k].value);
});

function valoresPorDefecto(){
  sliders.dolor.value = 3; valores.dolor.textContent = 3;
  sliders.fatiga.value = 3; valores.fatiga.textContent = 3;
  document.getElementById('suenoHoras').value = '';
  document.getElementById('suenoCalidad').value = '';
  document.getElementById('notaHoy').value = '';
}

async function cargarHoy(){
  document.getElementById('fechaActual').textContent = formatearFechaLarga(hoyISO());
  const dia = await obtenerDia(hoyISO());
  if(dia){
    sliders.dolor.value = dia.dolor; valores.dolor.textContent = dia.dolor;
    sliders.fatiga.value = dia.fatiga; valores.fatiga.textContent = dia.fatiga;
    document.getElementById('suenoHoras').value = dia.suenoHoras || '';
    document.getElementById('suenoCalidad').value = dia.suenoCalidad || '';
    document.getElementById('notaHoy').value = dia.nota || '';
  } else {
    valoresPorDefecto();
  }
  await renderEventosHoy();
  await renderAlerta();
}

document.getElementById('btnGuardarHoy').addEventListener('click', async () => {
  const dia = {
    fecha: hoyISO(),
    dolor: parseFloat(sliders.dolor.value),
    fatiga: parseFloat(sliders.fatiga.value),
    suenoHoras: parseFloat(document.getElementById('suenoHoras').value) || null,
    suenoCalidad: document.getElementById('suenoCalidad').value || null,
    nota: document.getElementById('notaHoy').value || ''
  };
  await guardarDia(dia);
  valoresPorDefecto();
  const btn = document.getElementById('btnGuardarHoy');
  const original = btn.textContent;
  btn.textContent = 'Guardado ✓';
  setTimeout(() => btn.textContent = original, 1400);
  await renderAlerta();
});

/* ===== Dictado por voz (reutilizable) ===== */
function activarDictado(btnMic, textarea){
  if(!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)){
    btnMic.style.display = 'none';
    return;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = 'es-ES';
  recognition.continuous = false;
  recognition.interimResults = false;
  let grabando = false;

  btnMic.addEventListener('click', () => {
    if(grabando){ recognition.stop(); return; }
    recognition.start();
    grabando = true;
    btnMic.classList.add('recording');
  });
  recognition.onresult = (e) => {
    const texto = e.results[0][0].transcript;
    textarea.value = (textarea.value ? textarea.value + ' ' : '') + texto;
  };
  recognition.onend = () => { grabando = false; btnMic.classList.remove('recording'); };
  recognition.onerror = () => { grabando = false; btnMic.classList.remove('recording'); };
}
activarDictado(document.getElementById('btnDictarNota'), document.getElementById('notaHoy'));

/* ===== Eventos agudos ===== */
const SINTOMAS = ['Náuseas','Aura','Fotofobia','Fonofobia','Rigidez','Mareo','Hormigueo'];
const TRIGGERS = ['Mal sueño','Estrés','Cambio de tiempo','Esfuerzo físico','Comida','Ciclo menstrual'];

document.querySelectorAll('#tab-hoy .btn-evento').forEach(btn => {
  btn.addEventListener('click', () => {
    const contenedor = document.getElementById('tab-hoy').querySelector('.card:last-child');
    abrirFormularioEvento(btn.dataset.tipo, hoyISO(), contenedor, renderEventosHoy);
  });
});

function crearGrupoChips(lista, contenedor){
  lista.forEach(s => contenedor.appendChild(crearChip(s)));
  // chip especial "Otro" con texto libre
  const chipOtro = document.createElement('span');
  chipOtro.textContent = '+ Otro';
  chipOtro.style.cssText = 'font-size:11.5px; padding:6px 10px; border-radius:14px; border:1px dashed var(--line); color:var(--text-faint); cursor:pointer;';
  contenedor.appendChild(chipOtro);

  const inputWrap = document.createElement('div');
  inputWrap.className = 'chip-otro-input';
  inputWrap.style.display = 'none';
  inputWrap.innerHTML = `<input type="text" placeholder="Describe cuál"><button type="button">Añadir</button>`;
  contenedor.parentElement.appendChild(inputWrap);

  chipOtro.addEventListener('click', () => {
    inputWrap.style.display = inputWrap.style.display === 'none' ? 'flex' : 'none';
    inputWrap.querySelector('input').focus();
  });
  const anadirCustom = () => {
    const input = inputWrap.querySelector('input');
    const texto = input.value.trim();
    if(!texto) return;
    const chip = crearChip(texto);
    chip.classList.add('chip-on');
    chip.style.background = 'var(--dolor)'; chip.style.color = '#17140f'; chip.style.borderColor = 'var(--dolor)';
    contenedor.insertBefore(chip, chipOtro);
    input.value = '';
    inputWrap.style.display = 'none';
  };
  inputWrap.querySelector('button').addEventListener('click', anadirCustom);
  inputWrap.querySelector('input').addEventListener('keydown', (e) => { if(e.key === 'Enter'){ e.preventDefault(); anadirCustom(); } });
}

function abrirFormularioEvento(tipo, fecha, contenedor, onGuardado){
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
      <button type="button" id="btnDictarEv" class="btn-mic" title="Dictar">🎙️</button>
    </div>
    <div style="display:flex; gap:8px; margin-top:10px;">
      <button id="btnCancelarEv" class="btn-secundario" style="margin-top:0;">Cancelar</button>
      <button id="btnGuardarEv" class="btn-primario">Guardar evento</button>
    </div>
  `;
  contenedor.appendChild(form);

  crearGrupoChips(SINTOMAS, form.querySelector('#chipsSintomas'));
  crearGrupoChips(TRIGGERS, form.querySelector('#chipsTriggers'));

  form.querySelector('#sliderIntensidadEv').addEventListener('input', (e) => {
    form.querySelector('#valIntensidadEv').textContent = e.target.value;
  });

  activarDictado(form.querySelector('#btnDictarEv'), form.querySelector('#notaEv'));

  form.querySelector('#btnCancelarEv').addEventListener('click', () => form.remove());
  form.querySelector('#btnGuardarEv').addEventListener('click', async () => {
    const seleccionSintomas = [...form.querySelector('#chipsSintomas').querySelectorAll('.chip-on')].map(c => c.textContent);
    const seleccionTriggers = [...form.querySelector('#chipsTriggers').querySelectorAll('.chip-on')].map(c => c.textContent);
    const evento = {
      fecha,
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
    if(onGuardado) await onGuardado();
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
  await renderListaEventos(hoyISO(), document.getElementById('listaEventosHoy'), renderEventosHoy);
}

async function renderListaEventos(fecha, contenedor, onCambio){
  const eventos = await obtenerEventosPorFecha(fecha);
  if(eventos.length === 0){
    contenedor.innerHTML = '<div class="vacio-msg">Todavía no hay eventos registrados este día.</div>';
    return;
  }
  contenedor.innerHTML = '';
  eventos.forEach(ev => {
    const el = document.createElement('div');
    el.className = 'evento-item ' + (ev.tipo === 'fibro' ? 'fibro' : '');
    el.innerHTML = `<span>${ev.tipo === 'migrana' ? 'Migraña' : 'Fibromialgia'} · intensidad ${ev.intensidad}</span><span class="borrar" data-id="${ev.id}">✕</span>`;
    contenedor.appendChild(el);
  });
  contenedor.querySelectorAll('.borrar').forEach(b => {
    b.addEventListener('click', async () => {
      await borrarEvento(parseInt(b.dataset.id));
      if(onCambio) await onCambio();
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

/* ===== Editar un día anterior (desde Ajustes) ===== */
document.getElementById('fechaEditar').addEventListener('change', (e) => {
  if(e.target.value) mostrarEditorDia(e.target.value);
});

async function mostrarEditorDia(fechaISO){
  const box = document.getElementById('diaDetalle');
  const dia = await obtenerDia(fechaISO);

  box.innerHTML = `
    <h2 style="margin-top:16px;">${formatearFechaLarga(fechaISO)}</h2>
    <div class="slider-row">
      <div class="slider-label"><span>Dolor general</span><b id="valDolorDet">${dia ? dia.dolor : 3}</b></div>
      <input type="range" min="0" max="10" step="0.5" id="sliderDolorDet" class="slider dolor" value="${dia ? dia.dolor : 3}">
    </div>
    <div class="slider-row">
      <div class="slider-label"><span>Fatiga</span><b id="valFatigaDet">${dia ? dia.fatiga : 3}</b></div>
      <input type="range" min="0" max="10" step="0.5" id="sliderFatigaDet" class="slider fatiga" value="${dia ? dia.fatiga : 3}">
    </div>
    <div class="sueno-row">
      <label>Horas de sueño <input type="number" id="suenoHorasDet" min="0" max="14" step="0.5" value="${dia && dia.suenoHoras ? dia.suenoHoras : ''}"></label>
      <label>Calidad
        <select id="suenoCalidadDet">
          <option value="">—</option>
          <option value="mala" ${dia && dia.suenoCalidad==='mala' ? 'selected':''}>Mala</option>
          <option value="regular" ${dia && dia.suenoCalidad==='regular' ? 'selected':''}>Regular</option>
          <option value="buena" ${dia && dia.suenoCalidad==='buena' ? 'selected':''}>Buena</option>
        </select>
      </label>
    </div>
    <textarea id="notaDet" placeholder="Estado del día" style="width:100%; min-height:50px; background:var(--panel-2); border:1px solid var(--line); border-radius:8px; color:var(--text); padding:10px; font-size:13.5px; margin-bottom:12px;">${dia && dia.nota ? dia.nota : ''}</textarea>
    <button id="btnGuardarDet" class="btn-primario">${dia ? 'Actualizar día' : 'Guardar día'}</button>

    <h2 style="margin-top:20px;">Eventos agudos</h2>
    <div id="listaEventosDet" class="lista-eventos"></div>
    <div class="eventos-add">
      <button class="btn-evento migrana" data-tipo="migrana">+ migraña</button>
      <button class="btn-evento fibro" data-tipo="fibro">+ brote de fibro</button>
    </div>
  `;

  ['Dolor','Fatiga'].forEach(campo => {
    const slider = box.querySelector(`#slider${campo}Det`);
    const val = box.querySelector(`#val${campo}Det`);
    slider.addEventListener('input', () => val.textContent = slider.value);
  });

  const refrescarEventosDet = () => renderListaEventos(fechaISO, box.querySelector('#listaEventosDet'), refrescarEventosDet);
  await refrescarEventosDet();

  box.querySelectorAll('.btn-evento').forEach(btn => {
    btn.addEventListener('click', () => {
      abrirFormularioEvento(btn.dataset.tipo, fechaISO, box, refrescarEventosDet);
    });
  });

  box.querySelector('#btnGuardarDet').addEventListener('click', async () => {
    const nuevoDia = {
      fecha: fechaISO,
      dolor: parseFloat(box.querySelector('#sliderDolorDet').value),
      fatiga: parseFloat(box.querySelector('#sliderFatigaDet').value),
      suenoHoras: parseFloat(box.querySelector('#suenoHorasDet').value) || null,
      suenoCalidad: box.querySelector('#suenoCalidadDet').value || null,
      nota: box.querySelector('#notaDet').value || ''
    };
    await guardarDia(nuevoDia);
    const btn = box.querySelector('#btnGuardarDet');
    const original = btn.textContent;
    btn.textContent = 'Guardado ✓';
    setTimeout(() => btn.textContent = original, 1400);
    if(fechaISO === hoyISO()) await cargarHoy();
  });
}

/* ===== Resumen: frases directas, sin gráficas ni tablas que interpretar ===== */
function nivelTexto(valor){
  if(valor >= 8) return 'muy alto';
  if(valor >= 6) return 'alto';
  if(valor >= 3) return 'normal';
  return 'bajo';
}

function fraseNivel(nombre, hoy, ayer){
  const nivel = nivelTexto(hoy);
  if(ayer === null || ayer === undefined){
    return `${nombre}: ${nivel} (${hoy})`;
  }
  const diff = hoy - ayer;
  if(Math.abs(diff) < 0.5) return `${nombre}: ${nivel}, igual que ayer (${hoy})`;
  const flecha = diff > 0 ? 'subió' : 'bajó';
  return `${nombre}: ${nivel}, ${flecha} (${ayer} → ${hoy})`;
}

async function renderResumen(){
  const box = document.getElementById('resumenBox');
  const dias = await obtenerTodosDias();
  const eventos = await obtenerTodosEventos();
  const diasMap = Object.fromEntries(dias.map(d => [d.fecha, d]));
  const diaHoy = diasMap[hoyISO()];

  let frases = [];

  // Nivel de hoy + comparación con ayer
  if(diaHoy){
    const ayer = diasMap[sumarDias(hoyISO(), -1)];
    frases.push(fraseNivel('Dolor', diaHoy.dolor, ayer ? ayer.dolor : null));
    frases.push(fraseNivel('Fatiga', diaHoy.fatiga, ayer ? ayer.fatiga : null));
  } else {
    frases.push('Todavía no has guardado el día de hoy.');
  }

  // Racha de migraña / fibro
  ['migrana', 'fibro'].forEach(tipo => {
    const nombre = tipo === 'migrana' ? 'migraña' : 'brote de fibro';
    const fechasConEvento = new Set(eventos.filter(e => e.tipo === tipo).map(e => e.fecha));
    if(fechasConEvento.size === 0) return;
    let racha = 0, f = hoyISO();
    while(fechasConEvento.has(f)){ racha++; f = sumarDias(f, -1); }
    if(racha > 0){
      frases.push(`Llevas ${racha} día${racha > 1 ? 's' : ''} seguido${racha > 1 ? 's' : ''} con ${nombre}.`);
    } else {
      let sinEvento = 0; f = hoyISO();
      while(!fechasConEvento.has(f) && sinEvento < 60){ sinEvento++; f = sumarDias(f, -1); }
      if(sinEvento > 0 && sinEvento < 60) frases.push(`Sin ${nombre} desde hace ${sinEvento} día${sinEvento > 1 ? 's' : ''}.`);
    }
  });

  // El suelo está subiendo (racha de dolor de fondo al alza sin evento agudo hoy)
  const ultimos = dias.filter(d => d.fecha <= hoyISO()).sort((a,b) => a.fecha.localeCompare(b.fecha)).slice(-4);
  if(ultimos.length >= 3){
    const subida = ultimos[ultimos.length - 1].dolor - ultimos[0].dolor;
    const eventosHoy = eventos.filter(e => e.fecha === hoyISO());
    if(subida >= 2 && eventosHoy.length === 0){
      frases.push(`⚠️ El dolor de fondo lleva ${ultimos.length} días subiendo (+${subida.toFixed(1)}) sin que haya llegado una crisis todavía. Vigila las próximas 24-48h.`);
    }
  }

  // Patrones históricos (solo si hay suficientes eventos)
  if(eventos.length >= 3){
    let conSuenoBajo = 0, conDatoSueno = 0;
    eventos.forEach(ev => {
      const diaAyer = diasMap[sumarDias(ev.fecha, -1)];
      if(diaAyer && diaAyer.suenoHoras !== null && diaAyer.suenoHoras !== undefined){
        conDatoSueno++;
        if(diaAyer.suenoHoras < 6) conSuenoBajo++;
      }
    });
    let conSubida = 0, conDatosBase = 0;
    eventos.forEach(ev => {
      const d0 = diasMap[sumarDias(ev.fecha, -3)], d1 = diasMap[sumarDias(ev.fecha, -1)];
      if(d0 && d1){ conDatosBase++; if(d1.dolor - d0.dolor >= 2) conSubida++; }
    });
    const contadorTriggers = {};
    eventos.forEach(ev => (ev.triggers || []).forEach(t => contadorTriggers[t] = (contadorTriggers[t] || 0) + 1));
    const triggerTop = Object.entries(contadorTriggers).sort((a,b) => b[1]-a[1])[0];

    const MUESTRA_MINIMA = 5;
    if(conDatosBase >= MUESTRA_MINIMA && conSubida / conDatosBase >= 0.5){
      frases.push(`El dolor de fondo suele subir antes de una crisis: pasó en ${conSubida} de tus últimos ${conDatosBase} episodios.`);
    }
    if(conDatoSueno >= MUESTRA_MINIMA && conSuenoBajo / conDatoSueno >= 0.5){
      frases.push(`Dormir poco (menos de 6h) suele ir antes de una crisis: pasó en ${conSuenoBajo} de ${conDatoSueno} veces.`);
    }
    if(triggerTop && triggerTop[1] >= 3){
      frases.push(`Tu desencadenante más repetido es "${triggerTop[0]}" (${triggerTop[1]} veces).`);
    }
  } else if(eventos.length > 0) {
    frases.push(`Con ${eventos.length} evento${eventos.length > 1 ? 's' : ''} registrado${eventos.length > 1 ? 's' : ''} todavía es pronto para sacar patrones — sigue apuntando.`);
  }

  if(dias.length === 0 && eventos.length === 0){
    box.innerHTML = '<div class="vacio-msg">Todavía no hay registros. Guarda tu primer día en la pestaña Hoy.</div>';
    return;
  }

  box.innerHTML = frases.map(f => `<div class="frase-card">${f}</div>`).join('');
}

/* ===== Informe imprimible / PDF ===== */
document.getElementById('btnExportarPDF').addEventListener('click', async () => {
  const dias = (await obtenerTodosDias()).sort((a,b) => a.fecha.localeCompare(b.fecha));
  const eventos = (await obtenerTodosEventos()).sort((a,b) => a.fecha.localeCompare(b.fecha));

  if(dias.length === 0 && eventos.length === 0){
    await modalAlert('Todavía no hay registros para incluir en el informe.');
    return;
  }

  let filasDias = dias.map(d => `<tr><td>${formatearFechaCorta(d.fecha)}</td><td>${d.dolor}</td><td>${d.fatiga}</td><td>${d.suenoHoras ?? '—'}</td><td>${d.suenoCalidad ?? '—'}</td><td>${d.nota ?? ''}</td></tr>`).join('');
  let filasEventos = eventos.map(ev => `<tr><td>${formatearFechaCorta(ev.fecha)}</td><td>${ev.tipo === 'migrana' ? 'Migraña' : 'Fibromialgia'}</td><td>${ev.intensidad}</td><td>${(ev.sintomas||[]).join(', ')}</td><td>${(ev.triggers||[]).join(', ')}</td><td>${ev.alivio || ''}</td></tr>`).join('');

  document.getElementById('informePDF').innerHTML = `
    <h1>Marea — informe de registros</h1>
    <div class="informe-sub">Generado el ${formatearFechaCorta(hoyISO())} · ${dias.length} días registrados · ${eventos.length} eventos agudos</div>

    <h2>Línea base diaria</h2>
    <table>
      <thead><tr><th>Fecha</th><th>Dolor</th><th>Fatiga</th><th>Sueño (h)</th><th>Calidad</th><th>Nota</th></tr></thead>
      <tbody>${filasDias || '<tr><td colspan="6">Sin registros</td></tr>'}</tbody>
    </table>

    <h2>Eventos agudos</h2>
    <table>
      <thead><tr><th>Fecha</th><th>Tipo</th><th>Intensidad</th><th>Síntomas</th><th>Desencadenantes</th><th>Alivio</th></tr></thead>
      <tbody>${filasEventos || '<tr><td colspan="6">Sin eventos</td></tr>'}</tbody>
    </table>
  `;
  window.print();
});

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
  const confirmado = await modalConfirm('Esto borra todos tus registros de este dispositivo y no se puede deshacer.', '¿Borrar todos los datos?');
  if(!confirmado) return;
  await new Promise((resolve) => { const r = tx('dias','readwrite').clear(); r.onsuccess = resolve; });
  await new Promise((resolve) => { const r = tx('eventos','readwrite').clear(); r.onsuccess = resolve; });
  await cargarHoy();
  await modalAlert('Datos borrados.');
});

/* ===== Arranque ===== */
(async () => {
  await openDB();
  await cargarHoy();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
