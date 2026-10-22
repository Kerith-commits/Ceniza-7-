# CENIZA 7 — Carrera por la Caldera

Juego original de **carrera sin fin** (*endless runner*) hecho como proyecto escolar
únicamente con **HTML, CSS y JavaScript nativos**. No usa frameworks, librerías,
motores, paquetes ni recursos externos.

Runa, mensajera de brasas, corre por **la Vena** sobre una caldera volcánica.
Esquiva la chatarra, las vigas colgantes y las columnas de basalto, recoge chispas
y núcleos, y aguanta todo lo que puedas mientras la velocidad aumenta.

---

## Cómo jugar en local

No hay nada que instalar. Solo necesitas un navegador moderno con Canvas 2D
(Chrome, Edge, Firefox, Safari…).

**Opción 1 — abrir el archivo directamente**

1. Descarga o copia la carpeta `ceniza-7` completa.
2. Abre `index.html` con doble clic (o arrástralo a una pestaña del navegador).

**Opción 2 — servidor local (recomendada)**

Algunos navegadores limitan `localStorage` o el audio cuando la página se abre con
`file://`. En ese caso sirve la carpeta con cualquier servidor estático:

```bash
# Dentro de la carpeta ceniza-7, con Python 3:
python -m http.server 8000
```

Luego abre <http://localhost:8000> en el navegador.

> El juego funciona **sin conexión a Internet** una vez guardados los archivos:
> todas las imágenes y sonidos se generan con CSS, Canvas 2D y Web Audio API.

---

## Controles

| Tecla | Acción |
| --- | --- |
| `←` / `→` | Cambiar de carril |
| `↑` | Saltar |
| `↓` | Deslizarse (en el aire, acelera la caída) |
| `Espacio` | Iniciar · pausar · reanudar |
| `R` | Reiniciar (en pausa o al terminar) |
| `Esc` | Pausar mientras corres; volver al menú en pausa o al terminar |
| `M` | Activar / silenciar el sonido |

El juego es **100 % de teclado**, también en pantallas pequeñas. Los botones de la
interfaz permiten lo mismo con ratón o pantalla táctil.

---

## Mecánicas

- **Tres carriles.** Runa corre automáticamente; el cambio de carril es suave y
  está limitado a los carriles laterales.
- **Obstáculos:**
  - **Chatarra** (baja): se supera **saltando** (`↑`).
  - **Viga colgante**: se supera **deslizándose** (`↓`).
  - **Columna de basalto**: se supera **cambiando de carril** (`←` / `→`).
  - Variantes de **ancho completo** (aparecen más adelante): barrera baja (saltar)
    y viga (deslizarse).
- **Coleccionables:**
  - **Chispa** amarilla: +1 chispa.
  - **Núcleo** azul: +5 chispas.
- **Puntuación:** `floor(distancia en metros) + chispas × 10`.
- **Dificultad progresiva:** la velocidad sube con la distancia (de 15 a un máximo
  de 34 m/s) y los grupos de obstáculos aparecen cada vez más seguidos. Las
  variantes de ancho completo se desbloquean a los 200 m y 300 m.
- **Colisión:** cualquier golpe termina la carrera y muestra la pantalla de
  resultados (puntos, distancia, chispas, núcleos y récord).
- **Récord local:** se guarda en `localStorage` (clave `ceniza7.record.v1`).
  La preferencia de sonido usa `ceniza7.sonido.v1`.
- **Sonido:** efectos sintetizados en tiempo real con **Web Audio API**; no hay
  archivos de audio.

---

## Organización del código

| Archivo | Contenido |
| --- | --- |
| `index.html` | Estructura de las pantallas (menú, HUD, pausa, fin de partida), botones y enlaces a `style.css` y `game.js`. |
| `style.css` | Tema visual (paleta volcánica), animaciones y diseño responsive. |
| `game.js` | Motor completo del juego. |

`game.js` es un **IIFE** con `'use strict'`, dividido en secciones comentadas:

1. **Constantes y estado** — carriles, velocidades, gravedad, duración del
   deslizamiento y estado de la partida.
2. **Utilidades, almacenamiento y sonido** — formato de números, lectura/escritura
   de `localStorage` y el módulo `Sound` (Web Audio).
3. **Flujo de la partida** — menú, inicio, pausa, reanudación, fin y récord.
4. **Lógica** — generación de patrones, física del salto, colisiones, recogida de
   coleccionables y progresión de dificultad.
5. **Dibujo** — escenario, pista, obstáculos, coleccionables y personaje sobre
   Canvas 2D.
6. **Bucle principal y controles** — `requestAnimationFrame` y eventos de teclado.

El escenario usa una **proyección en perspectiva** sencilla: el mundo se mide en
metros, la cámara está fija y cada punto se proyecta con `escala = focal / z`.
El personaje se mantiene a una distancia fija de la cámara y el mundo avanza hacia
ella, lo que da la sensación de correr sin fin.

---

## Fuentes consultadas

Para entender las **mecánicas generales del género** (no se copió contenido) se
consultaron:

- Wikipedia — *Temple Run*: <https://en.wikipedia.org/wiki/Temple_Run>
- TechCrunch — *Temple Run: A Ridiculously Addictive Game You Can Play With One
  Thumb* (2012): <https://techcrunch.com/2012/01/15/temple-run/>

De ellas se tomaron ideas generales del género: carrera automática, tres carriles,
cambios laterales, salto, deslizamiento, monedas y partidas sin fin que terminan al
chocar. El resto del diseño es propio.

---

## Originalidad

**CENIZA 7 — Carrera por la Caldera** es un proyecto escolar **original** inspirado
en mecánicas generales del género *endless runner*. **No** es un producto oficial de
Temple Run ni está afiliado a Imangi Studios.

No se copiaron personajes, nombres, logotipos, mapas, imágenes, sonidos ni textos de
Temple Run. El título, la protagonista (**Runa**), el escenario (**la Vena / la
Caldera 7**) y todos los gráficos son originales y se generan con CSS, HTML y
Canvas 2D.

---

## Verificación realizada

Pruebas hechas en un navegador Chromium de escritorio, sirviendo la carpeta con un
servidor local:

- ✅ La página carga **sin errores ni advertencias en la consola**.
- ✅ Solo se solicitan tres archivos locales (`/`, `style.css`, `game.js`): **sin
  peticiones externas ni dependencias de red**.
- ✅ Enlaces de HTML/CSS/JS correctos y canvas inicializado.
- ✅ Menú visible; inicio con `Espacio` y con el botón **Comenzar carrera**.
- ✅ Cambio de carril con `←` / `→`, incluido el límite en los carriles extremos.
- ✅ Salto con `↑` (el personaje sube y vuelve al suelo) y caída rápida con `↓` en
  el aire.
- ✅ Deslizamiento con `↓` en el suelo y su finalización automática.
- ✅ Recogida de chispas (el contador aumentó y la puntuación lo reflejó).
- ✅ Colisiones: la columna de basalto termina la partida; saltar supera la chatarra;
  deslizarse supera la viga; de pie se choca con la viga; deslizándose se choca con
  la chatarra.
- ✅ Pausa y reanudación con `Espacio` y `Esc`; botones **Reanudar** y **Menú**.
- ✅ Reinicio con `R` y con el botón **Correr otra vez**.
- ✅ Dificultad progresiva: la velocidad pasó de 15 m/s a ~19,76 m/s a los 500 m.
- ✅ Récord guardado en `localStorage` y conservado tras recargar y abrir una pestaña
  nueva; aviso de **nuevo récord** al superarlo.
- ✅ Silencio/activación con `M`, con la preferencia guardada.
- ✅ Diseño responsive probado a ~376 px de ancho: el menú pasa a una columna y los
  botones ocupan todo el ancho.

**No verificado / limitaciones:**

- No se probó en un dispositivo móvil físico ni con lector de pantalla.
- Los obstáculos de **ancho completo** dependen de la generación aleatoria a partir
  de 200 m / 300 m; se revisaron en el código, pero no se forzaron en una prueba
  visual concreta.
- La recogida de **núcleos** se revisó en el código (suma 5 chispas y cuenta como
  núcleo), pero no se aisló en una prueba determinista.
- No se hicieron mediciones de rendimiento con herramientas de *profiling*.
