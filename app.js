/* ===== Marea — tensión arterial y diario de cabeza ===== */

// Base de datos propia: no se mezcla con los datos de la Marea original (marea_db)
const DB_NAME = 'marea_tension_db';
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

function borrarDia(fecha){
  return new Promise((resolve, reject) => {
    const req = tx('dias', 'readwrite').delete(fecha);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

/* ===== Utilidades de fecha (siempre en hora local) ===== */
function aISO(d){
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function hoyISO(){ return aISO(new Date()); }
function horaActual(){ return new Date().toTimeString().slice(0, 5); }
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
  return aISO(d);
}
function diasEntre(desdeISO, hastaISO){
  const a = new Date(desdeISO + 'T00:00:00');
  const b = new Date(hastaISO + 'T00:00:00');
  return Math.round((b - a) / 86400000) + 1;
}

/* ===== Utilidades varias ===== */
function esc(t){
  return String(t ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function media(arr){ return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function dec(n){ return n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
function pl(n, singular, plural){ return n === 1 ? singular : plural; }
function entero(v){ const n = parseInt(v, 10); return Number.isNaN(n) ? null : n; }

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

/* ===== Tabs ===== */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if(btn.dataset.tab === 'hoy') cargarHoy();
    if(btn.dataset.tab === 'resumen') renderResumen();
    if(btn.dataset.tab === 'ajustes') cargarAjustes();
  });
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

/* ===== Formulario del día (se usa en Hoy y al editar un día anterior) ===== */
const MOMENTOS = [
  { clave: 'm', titulo: 'Mañana' },
  { clave: 'n', titulo: 'Noche' }
];
const NIVELES = ['Bien', 'Regular', 'Mal', 'Muy mal'];
const ESTADOS = ['Ansiedad', 'Estrés', 'Nervios', 'Cansancio', 'Mareo', 'Náuseas', 'Tristeza'];
const ZONAS = ['Frente', 'Sienes', 'Nuca', 'Un lado', 'Toda la cabeza'];

function etiquetaCabeza(v){ return Number(v) === 0 ? 'Sin dolor' : `${v}/10`; }

function crearGrupoChips(cont, lista, seleccion, permitirOtro){
  const sel = new Set(seleccion || []);
  const nuevoChip = (texto, on) => {
    const c = document.createElement('span');
    c.className = 'chip' + (on ? ' on' : '');
    c.textContent = texto;
    c.addEventListener('click', () => c.classList.toggle('on'));
    return c;
  };
  lista.forEach(t => cont.appendChild(nuevoChip(t, sel.has(t))));
  // valores guardados que no están en la lista (los añadidos con "Otro")
  [...sel].filter(t => !lista.includes(t)).forEach(t => cont.appendChild(nuevoChip(t, true)));

  if(!permitirOtro) return;
  const chipOtro = document.createElement('span');
  chipOtro.className = 'chip chip-otro';
  chipOtro.textContent = '+ Otro';
  cont.appendChild(chipOtro);

  const wrap = document.createElement('div');
  wrap.className = 'chip-otro-input';
  wrap.style.display = 'none';
  wrap.innerHTML = '<input type="text" placeholder="Describe cuál"><button type="button">Añadir</button>';
  cont.insertAdjacentElement('afterend', wrap);
  const input = wrap.querySelector('input');

  chipOtro.addEventListener('click', () => {
    wrap.style.display = wrap.style.display === 'none' ? 'flex' : 'none';
    if(wrap.style.display === 'flex') input.focus();
  });
  const anadir = () => {
    const texto = input.value.trim();
    if(!texto) return;
    cont.insertBefore(nuevoChip(texto, true), chipOtro);
    input.value = '';
    wrap.style.display = 'none';
  };
  wrap.querySelector('button').addEventListener('click', anadir);
  input.addEventListener('keydown', (e) => { if(e.key === 'Enter'){ e.preventDefault(); anadir(); } });
}

function leerForm(cont, fechaISO, tocado){
  const tensiones = {};
  for(const m of MOMENTOS){
    const el = cont.querySelector(`.toma[data-momento="${m.clave}"]`);
    const sis = entero(el.querySelector('.t-sis').value);
    const dia = entero(el.querySelector('.t-dia').value);
    const pul = entero(el.querySelector('.t-pul').value);
    let hora = el.querySelector('.t-hora').value || '';
    const nombre = m.titulo.toLowerCase();

    if(sis === null && dia === null && pul === null){ tensiones[m.clave] = null; continue; }
    if(sis === null || dia === null){
      return { error: `En la toma de ${nombre} faltan la sistólica (la alta) o la diastólica (la baja).` };
    }
    if(sis < 50 || sis > 300 || dia < 30 || dia > 200){
      return { error: `Revisa la toma de ${nombre}: ${sis}/${dia} no parece un valor correcto.` };
    }
    if(sis <= dia){
      return { error: `Revisa la toma de ${nombre}: la sistólica (la alta) tiene que ser mayor que la diastólica (la baja).` };
    }
    if(pul !== null && (pul < 25 || pul > 250)){
      return { error: `Revisa el pulso de la toma de ${nombre}: ${pul} no parece un valor correcto.` };
    }
    if(!hora && fechaISO === hoyISO()) hora = horaActual();
    tensiones[m.clave] = { sis, dia, pul, hora };
  }

  const cabeza = parseInt(cont.querySelector('.s-cabeza').value, 10) || 0;
  const zonas = cabeza > 0 ? [...cont.querySelectorAll('.c-zonas .chip.on')].map(c => c.textContent) : [];
  const estados = [...cont.querySelectorAll('.c-estados .chip.on')].map(c => c.textContent);
  const btnNivel = cont.querySelector('.nivel-btn.on');
  const encontrado = btnNivel ? btnNivel.textContent : null;
  const nota = cont.querySelector('.nota-txt').value.trim();

  const hayTension = MOMENTOS.some(m => tensiones[m.clave]);
  if(!hayTension && !encontrado && estados.length === 0 && !nota && !tocado && cabeza === 0){
    return { error: 'Todavía no has apuntado nada de este día.' };
  }

  return { dia: { fecha: fechaISO, tensiones, encontrado, cabeza, cabezaZonas: zonas, estados, nota } };
}

function construirFormDia(cont, fechaISO, dia, alGuardar){
  const t = (dia && dia.tensiones) || {};
  const cabeza0 = dia && typeof dia.cabeza === 'number' ? dia.cabeza : 0;
  let tocado = !!dia;

  const tomasHTML = MOMENTOS.map(m => {
    const v = t[m.clave] || {};
    return `
      <div class="toma" data-momento="${m.clave}">
        <div class="toma-cab">
          <span>${m.titulo}</span>
          <input type="time" class="t-hora" title="Hora de la toma" value="${esc(v.hora || '')}">
        </div>
        <div class="toma-valores">
          <label>Sistólica (alta)<input type="number" inputmode="numeric" class="t-sis" min="40" max="300" placeholder="120" value="${v.sis ?? ''}"></label>
          <label>Diastólica (baja)<input type="number" inputmode="numeric" class="t-dia" min="20" max="200" placeholder="80" value="${v.dia ?? ''}"></label>
          <label>Pulso<input type="number" inputmode="numeric" class="t-pul" min="20" max="250" placeholder="70" value="${v.pul ?? ''}"></label>
        </div>
      </div>`;
  }).join('');

  const nivelesHTML = NIVELES.map(n =>
    `<button type="button" class="nivel-btn${dia && dia.encontrado === n ? ' on' : ''}">${n}</button>`
  ).join('');

  cont.innerHTML = `
    <div class="bloque">
      <div class="bloque-titulo">Tensión arterial</div>
      ${tomasHTML}
    </div>

    <div class="bloque">
      <div class="slider-row" style="margin-bottom:10px;">
        <div class="slider-label"><span>Dolor de cabeza</span><b class="v-cabeza">${etiquetaCabeza(cabeza0)}</b></div>
        <input type="range" min="0" max="10" step="1" class="slider dolor s-cabeza" value="${cabeza0}">
      </div>
      <div class="zonas-wrap" style="display:${cabeza0 > 0 ? 'block' : 'none'};">
        <div class="ayuda" style="margin-bottom:6px;">Zona</div>
        <div class="chips c-zonas"></div>
      </div>
    </div>

    <div class="bloque">
      <div class="bloque-titulo">Cómo se ha encontrado</div>
      <div class="niveles">${nivelesHTML}</div>
    </div>

    <div class="bloque">
      <div class="bloque-titulo">Estado</div>
      <div class="chips c-estados"></div>
    </div>

    <div class="nota-row">
      <div class="ayuda" style="margin-bottom:6px;">Notas del día (texto libre)</div>
      <textarea class="nota-txt" placeholder="Cómo ha ido el día, qué ha pasado, qué ha tomado…">${esc(dia && dia.nota ? dia.nota : '')}</textarea>
      <button type="button" class="btn-mic" title="Dictar nota">🎙️</button>
    </div>

    <button type="button" class="btn-primario btn-guardar">${dia ? 'Actualizar día' : 'Guardar día'}</button>
  `;

  crearGrupoChips(cont.querySelector('.c-zonas'), ZONAS, dia && dia.cabezaZonas, true);
  crearGrupoChips(cont.querySelector('.c-estados'), ESTADOS, dia && dia.estados, true);

  // Dolor de cabeza: etiqueta viva y zona solo si hay dolor
  const slider = cont.querySelector('.s-cabeza');
  slider.addEventListener('input', () => {
    tocado = true;
    cont.querySelector('.v-cabeza').textContent = etiquetaCabeza(slider.value);
    cont.querySelector('.zonas-wrap').style.display = Number(slider.value) > 0 ? 'block' : 'none';
  });

  // Cómo se ha encontrado: una sola opción, pulsar otra vez la quita
  const nivelBtns = [...cont.querySelectorAll('.nivel-btn')];
  nivelBtns.forEach(b => b.addEventListener('click', () => {
    const yaActivo = b.classList.contains('on');
    nivelBtns.forEach(x => x.classList.remove('on'));
    if(!yaActivo) b.classList.add('on');
  }));

  activarDictado(cont.querySelector('.btn-mic'), cont.querySelector('.nota-txt'));

  const btn = cont.querySelector('.btn-guardar');
  const textoBtn = btn.textContent;
  btn.addEventListener('click', async () => {
    const r = leerForm(cont, fechaISO, tocado);
    if(r.error){ await modalAlert(r.error, 'Revisa los datos'); return; }
    await guardarDia(r.dia);
    btn.textContent = 'Guardado ✓';
    setTimeout(() => btn.textContent = textoBtn, 1400);
    if(alGuardar) await alGuardar();
  });
}

/* ===== HOY ===== */
async function cargarHoy(forzar = false){
  const hoy = hoyISO();
  document.getElementById('fechaActual').textContent = formatearFechaLarga(hoy);
  const cont = document.getElementById('formHoy');
  // Si solo se cambia de pestaña no se reconstruye el formulario, para no perder lo que se esté escribiendo
  if(!forzar && cont.dataset.fecha === hoy && cont.children.length) return;
  const dia = await obtenerDia(hoy);
  cont.dataset.fecha = hoy;
  construirFormDia(cont, hoy, dia, null);
}

/* ===== Editar un día anterior (desde Ajustes) ===== */
document.getElementById('fechaEditar').addEventListener('change', (e) => {
  if(e.target.value) mostrarEditorDia(e.target.value);
});

async function mostrarEditorDia(fechaISO){
  const box = document.getElementById('diaDetalle');
  const dia = await obtenerDia(fechaISO);
  box.innerHTML = `<h2 style="margin-top:16px;">${formatearFechaLarga(fechaISO)}</h2><div id="formEditar"></div>`;
  const cont = box.querySelector('#formEditar');

  construirFormDia(cont, fechaISO, dia, async () => {
    if(fechaISO === hoyISO()) await cargarHoy(true);
    // refresca el editor (para que aparezca "Borrar este día") salvo que se haya cambiado de fecha
    setTimeout(() => {
      if(document.getElementById('fechaEditar').value === fechaISO) mostrarEditorDia(fechaISO);
    }, 900);
  });

  if(dia){
    const btnBorrar = document.createElement('button');
    btnBorrar.type = 'button';
    btnBorrar.className = 'btn-peligro';
    btnBorrar.style.marginTop = '10px';
    btnBorrar.textContent = 'Borrar este día';
    btnBorrar.addEventListener('click', async () => {
      const ok = await modalConfirm('Se borra el registro de este día. No se puede deshacer.', '¿Borrar el día?');
      if(!ok) return;
      await borrarDia(fechaISO);
      box.innerHTML = '';
      document.getElementById('fechaEditar').value = '';
      if(fechaISO === hoyISO()) await cargarHoy(true);
    });
    box.appendChild(btnBorrar);
  }
}

/* ===== Resumen: frases directas, sin gráficas ni tablas que interpretar ===== */
function tomasDeDia(d){
  const out = [];
  if(!d || !d.tensiones) return out;
  for(const m of MOMENTOS){
    const v = d.tensiones[m.clave];
    if(v && v.sis && v.dia) out.push({ fecha: d.fecha, momento: m.clave, sis: v.sis, dia: v.dia, pul: v.pul, hora: v.hora });
  }
  return out;
}
function fmtTension(tomas){
  return `${Math.round(media(tomas.map(t => t.sis)))}/${Math.round(media(tomas.map(t => t.dia)))}`;
}

async function renderResumen(){
  const box = document.getElementById('resumenBox');
  const dias = (await obtenerTodosDias()).sort((a, b) => a.fecha.localeCompare(b.fecha));

  if(dias.length === 0){
    box.innerHTML = '<div class="vacio-msg">Todavía no hay registros. Guarda tu primer día en la pestaña Hoy.</div>';
    return;
  }

  const hoy = hoyISO();
  const mapa = Object.fromEntries(dias.map(d => [d.fecha, d]));
  const enRango = (desde, hasta) => dias.filter(d => d.fecha >= desde && d.fecha <= hasta);
  const tomasDe = (lista) => lista.flatMap(tomasDeDia);
  const frases = [];

  // Hoy
  const dHoy = mapa[hoy];
  if(!dHoy){
    frases.push('Todavía no has guardado el día de hoy.');
  } else {
    const partes = MOMENTOS.map(m => {
      const v = dHoy.tensiones && dHoy.tensiones[m.clave];
      return v ? `${m.titulo.toLowerCase()} ${v.sis}/${v.dia}${v.pul ? ' (pulso ' + v.pul + ')' : ''}` : null;
    }).filter(Boolean);
    frases.push(partes.length ? `Tensión de hoy: ${partes.join(' · ')}.` : 'Hoy no hay tensión apuntada.');
    if(dHoy.cabeza > 0){
      const zonas = (dHoy.cabezaZonas || []).length ? ` (${esc(dHoy.cabezaZonas.join(', ').toLowerCase())})` : '';
      frases.push(`Dolor de cabeza hoy: ${dHoy.cabeza}/10${zonas}.`);
    } else {
      frases.push('Hoy sin dolor de cabeza.');
    }
  }

  // Tensión: últimos 7 días y semana anterior
  const s7 = tomasDe(enRango(sumarDias(hoy, -6), hoy));
  const s7prev = tomasDe(enRango(sumarDias(hoy, -13), sumarDias(hoy, -7)));
  if(s7.length){
    frases.push(`Tensión media de los últimos 7 días: ${fmtTension(s7)} (${s7.length} ${pl(s7.length, 'toma', 'tomas')}).`);
    if(s7.length >= 3 && s7prev.length >= 3){
      frases.push(`Los 7 días anteriores: ${fmtTension(s7prev)} (${s7prev.length} tomas).`);
    }
  }

  // Mañana frente a noche (últimos 30 días)
  const d30 = enRango(sumarDias(hoy, -29), hoy);
  const t30 = tomasDe(d30);
  const tm = t30.filter(t => t.momento === 'm');
  const tn = t30.filter(t => t.momento === 'n');
  if(tm.length >= 3 && tn.length >= 3){
    frases.push(`Últimos 30 días: media de mañana ${fmtTension(tm)} · media de noche ${fmtTension(tn)}.`);
  }

  // Dolor de cabeza (últimos 30 días)
  if(d30.length){
    const conDolor = d30.filter(d => d.cabeza > 0);
    if(conDolor.length === 0){
      frases.push(`Sin dolor de cabeza en los ${d30.length} ${pl(d30.length, 'día registrado', 'días registrados')} de los últimos 30.`);
    } else {
      frases.push(`Dolor de cabeza en ${conDolor.length} de ${d30.length} ${pl(d30.length, 'día registrado', 'días registrados')} (últimos 30), con intensidad media de ${dec(media(conDolor.map(d => d.cabeza)))}/10.`);
    }
  }

  // Racha (solo días registrados seguidos hasta hoy)
  if(mapa[hoy]){
    const conDolorHoy = mapa[hoy].cabeza > 0;
    let racha = 0, f = hoy;
    while(mapa[f] && (mapa[f].cabeza > 0) === conDolorHoy){ racha++; f = sumarDias(f, -1); }
    if(racha >= 2){
      frases.push(conDolorHoy
        ? `Llevas ${racha} días seguidos con dolor de cabeza.`
        : `Llevas ${racha} días seguidos sin dolor de cabeza.`);
    }
  }

  // Tensión en días con y sin dolor de cabeza (todo el histórico)
  const diasConTomas = dias.filter(d => tomasDeDia(d).length > 0);
  const gDolor = diasConTomas.filter(d => d.cabeza > 0);
  const gSin = diasConTomas.filter(d => !(d.cabeza > 0));
  if(gDolor.length >= 4 && gSin.length >= 4){
    frases.push(`Tensión media en días con dolor de cabeza: ${fmtTension(tomasDe(gDolor))} (${gDolor.length} días) · en días sin dolor: ${fmtTension(tomasDe(gSin))} (${gSin.length} días). Es solo una observación de estos registros, no un diagnóstico.`);
  }

  // Estado más repetido en días con dolor de cabeza
  const cuenta = {};
  dias.filter(d => d.cabeza > 0).forEach(d => (d.estados || []).forEach(e => { cuenta[e] = (cuenta[e] || 0) + 1; }));
  const top = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
  if(top && top[1] >= 3){
    frases.push(`En los días con dolor de cabeza, lo que más se repite es «${esc(top[0])}» (${top[1]} días).`);
  }

  if(dias.length < 7){
    frases.push(`Con ${dias.length} ${pl(dias.length, 'día registrado', 'días registrados')} todavía es pronto para ver patrones — sigue apuntando.`);
  }

  box.innerHTML = frases.map(f => `<div class="frase-card">${f}</div>`).join('');
}

/* ===== Ajustes: valores por defecto del informe ===== */
function leerNombreGuardado(){
  try { return localStorage.getItem('marea_nombre') || ''; } catch(e){ return ''; }
}
function guardarNombre(nombre){
  try { localStorage.setItem('marea_nombre', nombre); } catch(e){ /* sin almacenamiento local */ }
}

function cargarAjustes(){
  const hoy = hoyISO();
  document.getElementById('fechaEditar').max = hoy;
  const desde = document.getElementById('informeDesde');
  const hasta = document.getElementById('informeHasta');
  if(!desde.value) desde.value = sumarDias(hoy, -29);
  if(!hasta.value) hasta.value = hoy;
  const nombre = document.getElementById('nombreInforme');
  if(!nombre.value) nombre.value = leerNombreGuardado();
}

/* ===== Informe imprimible / PDF ===== */
function construirInforme(dias, desde, hasta, nombre){
  const tomas = dias.flatMap(tomasDeDia);
  const stat = (arr) => arr.length ? { med: Math.round(media(arr)), min: Math.min(...arr), max: Math.max(...arr) } : null;
  const sSis = stat(tomas.map(t => t.sis));
  const sDia = stat(tomas.map(t => t.dia));
  const sPul = stat(tomas.filter(t => t.pul).map(t => t.pul));
  const tm = tomas.filter(t => t.momento === 'm');
  const tn = tomas.filter(t => t.momento === 'n');
  const conDolor = dias.filter(d => d.cabeza > 0);
  const periodo = diasEntre(desde, hasta);

  const caja = (titulo, valor) => `<div class="caja">${titulo}<b>${valor}</b></div>`;
  const cajas = [
    caja('Días registrados', `${dias.length} de ${periodo}`),
    caja('Tomas de tensión', `${tomas.length}`),
    caja('Tensión media', sSis ? `${sSis.med}/${sDia.med}` : '—'),
    caja('Pulso medio', sPul ? `${sPul.med} ppm` : '—'),
    caja('Media de mañana', tm.length ? fmtTension(tm) : '—'),
    caja('Media de noche', tn.length ? fmtTension(tn) : '—'),
    caja('Rango sistólica / diastólica', sSis ? `${sSis.min}–${sSis.max} / ${sDia.min}–${sDia.max}` : '—'),
    caja('Días con dolor de cabeza', conDolor.length
      ? `${conDolor.length} de ${dias.length} · media ${dec(media(conDolor.map(d => d.cabeza)))}/10`
      : `0 de ${dias.length}`)
  ].join('');

  const celdaToma = (v) => {
    if(!v || !v.sis) return '—';
    return `${v.hora ? esc(v.hora) + ' · ' : ''}<b>${v.sis}/${v.dia}</b>${v.pul ? ' · ' + v.pul + ' ppm' : ''}`;
  };

  const filas = dias.map(d => {
    const t = d.tensiones || {};
    const cabeza = d.cabeza > 0
      ? `${d.cabeza}/10${(d.cabezaZonas || []).length ? ' · ' + esc(d.cabezaZonas.join(', ')) : ''}`
      : 'Sin dolor';
    return `<tr>
      <td class="num">${formatearFechaCorta(d.fecha)}</td>
      <td class="num">${celdaToma(t.m)}</td>
      <td class="num">${celdaToma(t.n)}</td>
      <td>${cabeza}</td>
      <td>${esc(d.encontrado || '—')}</td>
      <td>${esc((d.estados || []).join(', ') || '—')}</td>
      <td>${esc(d.nota || '')}</td>
    </tr>`;
  }).join('');

  return `
    <h1>Registro de tensión arterial y dolor de cabeza</h1>
    <div class="informe-sub">${nombre ? esc(nombre) + ' · ' : ''}Periodo: ${formatearFechaCorta(desde)} – ${formatearFechaCorta(hasta)} · Generado el ${formatearFechaCorta(hoyISO())}</div>

    <div class="pie">Valores de tensión (mmHg) y pulso (ppm) introducidos manualmente por el paciente. Dolor de cabeza en escala 0–10.</div>

    <h2>Resumen del periodo</h2>
    <div class="resumen-grid">${cajas}</div>

    <h2>Registro día a día</h2>
    <table>
      <thead><tr><th>Fecha</th><th>Tensión mañana</th><th>Tensión noche</th><th>Dolor de cabeza</th><th>Cómo se encontró</th><th>Estado</th><th>Notas</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
  `;
}

document.getElementById('btnExportarPDF').addEventListener('click', async () => {
  const hoy = hoyISO();
  const desde = document.getElementById('informeDesde').value || sumarDias(hoy, -29);
  const hasta = document.getElementById('informeHasta').value || hoy;
  if(desde > hasta){
    await modalAlert('La fecha «Desde» tiene que ser anterior o igual a «Hasta».');
    return;
  }
  const nombre = document.getElementById('nombreInforme').value.trim();
  guardarNombre(nombre);

  const dias = (await obtenerTodosDias())
    .filter(d => d.fecha >= desde && d.fecha <= hasta)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  if(dias.length === 0){
    await modalAlert('No hay registros entre esas fechas.');
    return;
  }

  document.getElementById('informePDF').innerHTML = construirInforme(dias, desde, hasta, nombre);

  // El título del documento sale como nombre de archivo sugerido al guardar el PDF
  const tituloOriginal = document.title;
  document.title = `Marea ${desde} a ${hasta}`;
  window.addEventListener('afterprint', () => { document.title = tituloOriginal; }, { once: true });
  window.print();
});

/* ===== Backup / restore ===== */
document.getElementById('btnExportar').addEventListener('click', async () => {
  const dias = await obtenerTodosDias();
  const backup = { app: 'marea-tension', version: 1, exportado: new Date().toISOString(), dias };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `marea-tension-backup-${hoyISO()}.json`;
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
    if(backup.app !== 'marea-tension' || !Array.isArray(backup.dias)) throw new Error('formato inválido');
    const validos = backup.dias.filter(d => d && typeof d.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha));
    for(const dia of validos) await guardarDia(dia);
    status.textContent = `Restaurado: ${validos.length} ${pl(validos.length, 'día', 'días')}.`;
    status.style.color = 'var(--bueno)';
    await cargarHoy(true);
  } catch(err){
    status.textContent = 'No se pudo leer el archivo. Comprueba que es un backup de esta versión de Marea (tensión y cabeza).';
    status.style.color = 'var(--dolor)';
  }
  e.target.value = '';
});

document.getElementById('btnBorrarTodo').addEventListener('click', async () => {
  const confirmado = await modalConfirm('Esto borra todos los registros de este dispositivo y no se puede deshacer.', '¿Borrar todos los datos?');
  if(!confirmado) return;
  await new Promise((resolve, reject) => { const r = tx('dias', 'readwrite').clear(); r.onsuccess = resolve; r.onerror = reject; });
  document.getElementById('diaDetalle').innerHTML = '';
  document.getElementById('fechaEditar').value = '';
  await cargarHoy(true);
  await modalAlert('Datos borrados.');
});

/* ===== Arranque ===== */
(async () => {
  await openDB();
  await cargarHoy(true);
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
