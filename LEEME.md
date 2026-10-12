# Control Sueño: cómo ponerla en marcha

La app ya funciona sin configurar nada, en **modo prueba**: guarda los registros solo en ese celular. Para que los datos queden en la nube y se vean desde más de un teléfono, seguí estos pasos. Todo es gratis (plan Spark de Firebase y GitHub Pages).

## 1. Crear el proyecto de Firebase

1. Entrá a https://console.firebase.google.com con tu cuenta de Google y tocá **Crear un proyecto**. Ponele un nombre (por ejemplo `control-sueno`). Google Analytics no hace falta.
2. En el menú, **Compilación > Firestore Database > Crear base de datos**. Elegí una ubicación cercana (por ejemplo `southamerica-east1`) y arrancá en **modo de producción**.
3. En la pestaña **Reglas** de Firestore, borrá lo que hay, pegá el contenido de `firestore.rules`, tocá **Publicar**. Así solo esas cuentas pueden ver y cargar datos.
4. En **Compilación > Authentication > Comenzar**, pestaña **Método de acceso**, activá **Correo electrónico/contraseña**. En la pestaña **Usuarios**, agregá el usuario `diego@controlsueno-dfe65.firebaseapp.com` con la contraseña que quieras. En la app ingresás solo con `diego` y esa contraseña.
5. En el engranaje ⚙️ **Configuración del proyecto**, bajo **Tus apps**, tocá el ícono **Web (`</>`)**, registrá la app (sin Hosting) y copiá el bloque `firebaseConfig`.
6. Abrí `firebase-config.js` y reemplazá cada `PEGAR_AQUI` por los valores que copiaste. Estos datos no son secretos: lo que protege la información son las reglas del paso 3.

## 2. Publicarla en GitHub Pages

1. En https://github.com creá un repositorio nuevo, por ejemplo `controlsueno` (público, que es lo que permite Pages gratis).
2. Tocá **Add file > Upload files** y subí todos los archivos de esta carpeta (`index.html`, `app.js`, `styles.css`, `firebase-config.js`, `manifest.json`, `icono.svg`). `LEEME.md` y `firestore.rules` son opcionales.
3. En el repositorio, **Settings > Pages**, en **Branch** elegí `main` y carpeta `/ (root)`, y guardá. En uno o dos minutos aparece la dirección, del estilo `https://TU_USUARIO.github.io/controlsueno/`.

## 3. Usarla en el celular

1. Abrí la dirección en Chrome del celular e ingresá con tu usuario y contraseña.
2. En el menú ⋮ de Chrome tocá **Agregar a la pantalla principal** para tenerla como una app.
3. Tocá un botón y se registra con la hora del celular. Si te equivocaste, tocá **Deshacer** en el aviso de abajo, o tocá el registro en la lista para cambiarle la hora, el tipo o borrarlo.
4. La pestaña **Resumen por día** muestra cada fecha con sus registros y totales, y el botón **Copiar resumen** lo deja listo para pegar en WhatsApp o donde quieras.

Si no hay señal, la app sigue registrando y sincroniza sola cuando vuelve la conexión.
