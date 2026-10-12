import { firebaseConfig } from "./firebase-config.js";
import { VERSION } from "./version.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
const DIAS_A_MOSTRAR = 90;
const TITULO_INICIAL = "Rutina Cielo";

const TIPOS = {
  inicio_sueno: { nombre: "Comienzo sueño", emoji: "😴" },
  fin_sueno:    { nombre: "Fin sueño",      emoji: "🌞" },
  teta:         { nombre: "Teta",           emoji: "🤱" },
  mamadera:     { nombre: "Mamadera",       emoji: "🍼" },
  pis:          { nombre: "Pis",            emoji: "💧" },
  caca:         { nombre: "Caca",           emoji: "💩" },
  bano:         { nombre: "Baño",           emoji: "🚿" },
  comida:       { nombre: "Comida",         emoji: "🥦" },
  medicacion:   { nombre: "Medicación",     emoji: "💊" },
};

const $ = (id) => document.getElementById(id);
let eventos = [];      // ordenados por ts ascendente
let almacen = null;    // { agregar, actualizar, borrar, guardarTitulo }
let titulo = TITULO_INICIAL;
let idEditando = null;

// ---------- Formato de fechas (siempre con la hora local del celular) ----------
const dos = (n) => String(n).padStart(2, "0");
const hora = (ts) => { const d = new Date(ts); return `${dos(d.getHours())}:${dos(d.getMinutes())}`; };
const fecha = (ts) => { const d = new Date(ts); return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}`; };
const claveDia = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`; };
const aInputLocal = (ts) => { const d = new Date(ts); return `${claveDia(ts)}T${dos(d.getHours())}:${dos(d.getMinutes())}`; };
const duracion = (ms) => {
  const min = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h ${dos(m)} min` : `${m} min`;
};
// "diego@controlsueno-dfe65.firebaseapp.com" -> "Diego"
const nombreUsuario = (correo) => {
  const u = (correo || "").split("@")[0];
  return u ? u[0].toUpperCase() + u.slice(1) : "";
};
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------- Almacenamiento local (modo prueba) ----------
function almacenLocal(alCambiar) {
  const CLAVE = "controlsueno_eventos";
  const CLAVE_TITULO = "controlsueno_titulo";
  try { alCambiarTitulo(localStorage.getItem(CLAVE_TITULO)); } catch {}
  const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE)) || []; } catch { return []; } };
  const escribir = (lista) => { try { localStorage.setItem(CLAVE, JSON.stringify(lista)); } catch {} alCambiar(lista); };
  alCambiar(leer());
  return {
    agregar: (ev) => escribir([...leer(), ev]),
    actualizar: (id, datos) => escribir(leer().map((e) => (e.id === id ? { ...e, ...datos } : e))),
    borrar: (id) => escribir(leer().filter((e) => e.id !== id)),
    guardarTitulo: (t) => { try { localStorage.setItem(CLAVE_TITULO, t); } catch {} alCambiarTitulo(t); },
  };
}

// ---------- Firebase (Firestore + login con usuario y contraseña) ----------
async function iniciarFirebase() {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const a = auth.getAuth(app);
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });
  const col = fs.collection(db, "eventos");
  const docConfig = fs.doc(db, "config", "app");
  let desuscribir = [];

  // El usuario se guarda en Firebase como un correo interno: "diego" -> "diego@<proyecto>.firebaseapp.com".
  const aCorreo = (u) => (u.includes("@") ? u : `${u}@${firebaseConfig.authDomain}`).trim().toLowerCase();
  $("formLogin").onsubmit = async (ev) => {
    ev.preventDefault();
    $("loginError").textContent = "";
    $("btnLogin").disabled = true;
    try {
      await auth.signInWithEmailAndPassword(a, aCorreo($("loginUsuario").value), $("loginPass").value);
      $("loginPass").value = "";
    } catch (e) {
      $("loginError").textContent = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"].includes(e.code)
        ? "Usuario o contraseña incorrectos."
        : "No se pudo ingresar: " + (e.code || e.message);
    } finally {
      $("btnLogin").disabled = false;
    }
  };
  $("btnSalir").onclick = () => auth.signOut(a);

  auth.onAuthStateChanged(a, (usuario) => {
    desuscribir.forEach((f) => f());
    desuscribir = [];
    $("btnSalir").hidden = !usuario;
    $("usuario").textContent = usuario ? nombreUsuario(usuario.email) : "";
    $("pantallaLogin").hidden = !!usuario;
    $("app").hidden = !usuario;
    if (!usuario) return;

    const desde = Date.now() - DIAS_A_MOSTRAR * 86400000;
    const q = fs.query(col, fs.where("ts", ">=", desde), fs.orderBy("ts", "asc"));
    desuscribir.push(fs.onSnapshot(q, (snap) => {
      alCambiarEventos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => mostrarToast("Error leyendo datos: " + err.code, false)));
    desuscribir.push(fs.onSnapshot(docConfig, (d) => alCambiarTitulo(d.data()?.titulo), () => {}));

    const fallo = (e) => mostrarToast("No se pudo guardar: " + (e.code || e.message), false);
    // No se espera la respuesta del servidor: la app funciona aunque no haya señal
    // y Firestore sincroniza cuando vuelve la conexión.
    almacen = {
      agregar: ({ id, ...datos }) => fs.setDoc(fs.doc(col, id), { ...datos, por: usuario.email }).catch(fallo),
      actualizar: (id, datos) => fs.updateDoc(fs.doc(col, id), datos).catch(fallo),
      borrar: (id) => fs.deleteDoc(fs.doc(col, id)).catch(fallo),
      guardarTitulo: (t) => fs.setDoc(docConfig, { titulo: t }, { merge: true }).catch(fallo),
    };
  });
}

function configurado() {
  return firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("PEGAR");
}

// ---------- Acciones ----------
function registrar(tipo) {
  const ev = { id: nuevoId(), tipo, ts: Date.now(), nota: "" };
  almacen.agregar(ev);
  if (navigator.vibrate) navigator.vibrate(30);
  mostrarToast(`${TIPOS[tipo].emoji} ${TIPOS[tipo].nombre} · ${hora(ev.ts)}`, true, () => almacen.borrar(ev.id));
}

let toastTimer = null;
function mostrarToast(texto, conDeshacer, deshacer) {
  $("toastTexto").textContent = texto;
  $("toastDeshacer").hidden = !conDeshacer;
  $("toastDeshacer").onclick = () => { deshacer && deshacer(); $("toast").hidden = true; };
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 5000);
}

function abrirEditor(ev) {
  idEditando = ev ? ev.id : null;
  $("dlgTitulo").textContent = ev ? "Editar registro" : "Agregar registro";
  $("edBorrar").hidden = !ev;
  $("edTipo").value = ev ? ev.tipo : "teta";
  $("edFecha").value = aInputLocal(ev ? ev.ts : Date.now());
  $("edNota").value = ev ? ev.nota || "" : "";
  $("dlgEditar").showModal();
}

function guardarEditor() {
  const ts = new Date($("edFecha").value).getTime();
  if (Number.isNaN(ts)) return;
  const datos = { tipo: $("edTipo").value, ts, nota: $("edNota").value.trim() };
  if (idEditando) almacen.actualizar(idEditando, datos);
  else almacen.agregar({ id: nuevoId(), ...datos });
}

// ---------- Cálculos ----------
// Empareja cada "Comienzo sueño" con el siguiente "Fin sueño".
function siestas(lista) {
  const res = [];
  let inicio = null;
  for (const e of lista) {
    if (e.tipo === "inicio_sueno") inicio = e;
    else if (e.tipo === "fin_sueno" && inicio) { res.push({ inicio: inicio.ts, fin: e.ts }); inicio = null; }
  }
  return res;
}

function agruparPorDia(lista) {
  const dias = new Map();
  for (const e of lista) {
    const k = claveDia(e.ts);
    if (!dias.has(k)) dias.set(k, []);
    dias.get(k).push(e);
  }
  return [...dias.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)); // día más reciente primero
}

function totalesDia(k) {
  const delDia = eventos.filter((e) => claveDia(e.ts) === k);
  const cuenta = (t) => delDia.filter((e) => e.tipo === t).length;
  const sueno = siestas(eventos)
    .filter((s) => claveDia(s.inicio) === k)
    .reduce((acc, s) => acc + (s.fin - s.inicio), 0);
  const partes = [];
  if (sueno) partes.push(`Sueño ${duracion(sueno)}`);
  if (cuenta("teta")) partes.push(`Teta ${cuenta("teta")}`);
  if (cuenta("mamadera")) partes.push(`Mamadera ${cuenta("mamadera")}`);
  if (cuenta("pis")) partes.push(`Pis ${cuenta("pis")}`);
  if (cuenta("caca")) partes.push(`Caca ${cuenta("caca")}`);
  if (cuenta("bano")) partes.push(`Baño ${cuenta("bano")}`);
  if (cuenta("comida")) partes.push(`Comida ${cuenta("comida")}`);
  if (cuenta("medicacion")) partes.push(`Medicación ${cuenta("medicacion")}`);
  return partes.join(" · ");
}

const lineaEvento = (e) => `${TIPOS[e.tipo]?.nombre || e.tipo} ${hora(e.ts)}${e.nota ? ` (${e.nota})` : ""}${e.por ? ` · ${nombreUsuario(e.por)}` : ""}`;

function textoResumen() {
  return agruparPorDia(eventos)
    .map(([k, lista]) => {
      const tot = totalesDia(k);
      return [fecha(lista[0].ts), ...lista.map(lineaEvento), ...(tot ? [`Total: ${tot}`] : [])].join("\n");
    })
    .join("\n\n");
}

// ---------- Pantalla ----------
function alCambiarEventos(lista) {
  eventos = [...lista].sort((a, b) => a.ts - b.ts);
  dibujar();
}

function dibujar() {
  dibujarEstado();
  dibujarHoy();
  dibujarResumen();
}

function dibujarEstado() {
  const ahora = Date.now();
  const ultimo = (tipos) => [...eventos].reverse().find((e) => tipos.includes(e.tipo));
  const sueno = ultimo(["inicio_sueno", "fin_sueno"]);
  const comida = ultimo(["teta", "mamadera", "comida"]);
  const partes = [];
  if (sueno?.tipo === "inicio_sueno") partes.push(`😴 <strong>Durmiendo</strong> desde las ${hora(sueno.ts)} (${duracion(ahora - sueno.ts)})`);
  else if (sueno) partes.push(`🌞 <strong>Despierto</strong> desde las ${hora(sueno.ts)} (${duracion(ahora - sueno.ts)})`);
  if (comida) partes.push(`${TIPOS[comida.tipo].emoji} Última comida: <strong>${TIPOS[comida.tipo].nombre}</strong> a las ${hora(comida.ts)}, hace ${duracion(ahora - comida.ts)}`);
  $("estadoSueno").innerHTML = partes.length ? partes.join("<br>") : "Tocá un botón para registrar con la hora actual.";
}

function dibujarHoy() {
  const hoy = claveDia(Date.now());
  const lista = eventos.filter((e) => claveDia(e.ts) === hoy).reverse();
  const ul = $("listaHoy");
  ul.innerHTML = "";
  if (!lista.length) { ul.innerHTML = `<li class="vacio">Todavía no hay registros hoy.</li>`; return; }
  for (const e of lista) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.className = "item";
    b.innerHTML = `<span class="hora">${hora(e.ts)}</span>
      <span class="tipo">${TIPOS[e.tipo]?.emoji || ""} ${TIPOS[e.tipo]?.nombre || e.tipo}<span class="nota"></span><span class="quien"></span></span>
      <span class="editar">Editar</span>`;
    b.querySelector(".nota").textContent = e.nota || "";
    b.querySelector(".quien").textContent = e.por ? `Registró ${nombreUsuario(e.por)}` : "";
    b.onclick = () => abrirEditor(e);
    li.appendChild(b);
    ul.appendChild(li);
  }
}

function dibujarResumen() {
  const cont = $("resumen");
  cont.innerHTML = "";
  const dias = agruparPorDia(eventos);
  if (!dias.length) { cont.innerHTML = `<p class="vacio">Sin registros todavía.</p>`; return; }
  for (const [k, lista] of dias) {
    const div = document.createElement("div");
    div.className = "dia";
    div.innerHTML = `<h3>${fecha(lista[0].ts)}</h3><p class="totales"></p><ul></ul>`;
    div.querySelector(".totales").textContent = totalesDia(k);
    const ul = div.querySelector("ul");
    for (const e of lista) {
      const li = document.createElement("li");
      li.textContent = `${TIPOS[e.tipo]?.emoji || ""} ${lineaEvento(e)}`;
      li.onclick = () => abrirEditor(e);
      ul.appendChild(li);
    }
    cont.appendChild(div);
  }
}

function alCambiarTitulo(t) {
  titulo = (t || "").trim() || TITULO_INICIAL;
  $("titulo").textContent = titulo;
  document.title = titulo;
}

function editarTitulo() {
  if (!almacen) return;
  const nuevo = prompt("Nombre de la app:", titulo);
  if (nuevo === null) return;
  const limpio = nuevo.trim().slice(0, 40);
  if (limpio && limpio !== titulo) almacen.guardarTitulo(limpio);
}

// ---------- Exportar PDF ----------
const JSPDF = "lib/jspdf.umd.min.js"; // jsPDF 2.5.1 (MIT), copiado en el repo para que funcione sin señal
let cargaJsPdf = null;
function cargarJsPdf() {
  cargaJsPdf ??= new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = JSPDF;
    s.onload = () => ok(window.jspdf.jsPDF);
    s.onerror = () => { cargaJsPdf = null; mal(new Error("sin conexión")); };
    document.head.appendChild(s);
  });
  return cargaJsPdf;
}

async function exportarPdf() {
  if (!eventos.length) { mostrarToast("No hay registros para exportar", false); return; }
  let jsPDF;
  try { jsPDF = await cargarJsPdf(); }
  catch (e) { mostrarToast("No se pudo crear el PDF: " + e.message, false); return; }
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margen = 15, ancho = 210 - 2 * margen, alto = 297;
  let y = margen;
  const linea = (texto, { tam = 10, negrita = false, color = 30, sep = 5 } = {}) => {
    doc.setFont("helvetica", negrita ? "bold" : "normal");
    doc.setFontSize(tam);
    doc.setTextColor(color);
    for (const l of doc.splitTextToSize(texto, ancho)) {
      if (y > alto - margen) { doc.addPage(); y = margen; }
      doc.text(l, margen, y);
      y += sep;
    }
  };
  linea(titulo, { tam: 18, negrita: true, sep: 8 });
  linea(`Resumen exportado el ${fecha(Date.now())} a las ${hora(Date.now())} · v${VERSION}`, { tam: 9, color: 110, sep: 8 });
  for (const [k, lista] of agruparPorDia(eventos)) {
    y += 2;
    linea(fecha(lista[0].ts), { tam: 13, negrita: true, sep: 6 });
    const tot = totalesDia(k);
    if (tot) linea(`Total: ${tot}`, { tam: 9, color: 110 });
    for (const e of lista) linea(lineaEvento(e));
  }
  doc.save(`${titulo} - resumen ${claveDia(Date.now())}.pdf`);
}

// ---------- Arranque ----------
function conectarUI() {
  $("version").textContent = `v${VERSION}`;
  $("titulo").onclick = editarTitulo;
  $("btnPdf").onclick = exportarPdf;
  for (const [k, t] of Object.entries(TIPOS)) $("edTipo").add(new Option(`${t.emoji} ${t.nombre}`, k));

  document.querySelectorAll(".evento").forEach((b) => (b.onclick = () => almacen && registrar(b.dataset.tipo)));

  document.querySelectorAll(".pestana").forEach((p) => (p.onclick = () => {
    document.querySelectorAll(".pestana").forEach((x) => x.classList.toggle("activa", x === p));
    $("vistaHoy").hidden = p.dataset.vista !== "hoy";
    $("vistaResumen").hidden = p.dataset.vista !== "resumen";
  }));

  $("btnManual").onclick = () => abrirEditor(null);
  $("edCancelar").onclick = () => $("dlgEditar").close();
  $("formEditar").onsubmit = () => guardarEditor();
  $("edBorrar").onclick = () => {
    if (idEditando && confirm("¿Borrar este registro?")) { almacen.borrar(idEditando); $("dlgEditar").close(); }
  };

  $("btnCopiar").onclick = async () => {
    const texto = textoResumen();
    try { await navigator.clipboard.writeText(texto); mostrarToast("Resumen copiado", false); }
    catch { prompt("Copiá el resumen:", texto); }
  };

  setInterval(dibujarEstado, 60000);
  document.addEventListener("visibilitychange", () => !document.hidden && dibujar());
}

conectarUI();
if (configurado()) {
  iniciarFirebase().catch((e) => {
    $("pantallaLogin").hidden = false;
    $("loginError").textContent = "No se pudo cargar Firebase: " + e.message;
  });
} else {
  $("avisoLocal").hidden = false;
  $("app").hidden = false;
  almacen = almacenLocal(alCambiarEventos);
}
