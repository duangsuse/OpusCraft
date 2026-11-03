# VoxelCraft

**▶ Juega ahora: [voxelcraft.arturo97xd.workers.dev](https://voxelcraft.arturo97xd.workers.dev)** — pon
el mismo nombre de mundo que tus amigos (o comparte el enlace de invitación) para jugar juntos.

Un juego de bloques estilo Minecraft que corre en el navegador, con gráficos tipo *shader pack*,
modo **supervivencia** completo y multijugador en tiempo real sobre Cloudflare (Workers + Durable
Objects). Pensado para PC (teclado y ratón).

- **Mundo infinito procedural** con los 53 biomas del mundo normal de Minecraft (salvo el jardín
  pálido): océanos de las cinco temperaturas (y los profundos), ríos (también helados), playas (nevadas)
  y costas pedregosas; llanuras (de girasoles, nevadas), praderas, bosques (de flores), abedulares (viejos),
  bosques oscuros, arboledas de cerezos, taigas (nevadas, de pinos y de abetos viejos con piceas
  gigantes), picos de hielo, desiertos, tierras baldías (erosionadas con chimeneas, boscosas), sabanas
  (mesetas, ventosas), junglas (dispersas, de bambú), pantanos y manglares, islas de champiñones,
  colinas ventosas (de grava, con bosque), arboledas y laderas nevadas y picos helados, escarpados y
  pedregosos; cuevas (frondosas con bayas luminosas, de goteo con estalactitas, inundadas, el Deep
  Dark), lagos de lava, geodas de amatista y las ocho menas de Minecraft (también en pizarra profunda
  por debajo de 0).
- **Cuevas de Java 26.3**: las de ruido (cavernas de «queso» con sus pilares, túneles de espagueti 2D y 3D,
  fideos finos que se cruzan y las entradas que abren a la superficie), el acuífero (lagos subterráneos con
  su propio nivel, barreras de roca entre niveles distintos, lagos de lava en lo hondo y lava por debajo de
  y = −54) y los excavadores (cuevas de gusano con salas y barrancos), con las fórmulas y parámetros de 26.3.
- **Dimensiones** (fase 8, en curso): el **Nether**, al que se llega por un portal de obsidiana
  encendido con fuego (4 s dentro; 1 bloque allí son 8 aquí). Su terreno, sus biomas y su decoración
  están portados de Java 26.3: cavernas enormes de rocanegra entre un suelo y un techo de lecho de roca,
  mar de lava, túneles, y los cinco biomas —desiertos del Nether, **bosque carmesí** y **bosque
  distorsionado** (hongos gigantes, necelio, raíces, brotes, enredaderas lloronas y retorcidas, luz de
  hongo), **valle de almas** (arena y tierra de alma, pilares de basalto, fuego de alma) y **deltas de
  basalto** (columnas de basalto, piedra negra, charcas de lava con borde de magma)—, cada uno con su
  niebla, sus partículas, su sonido y su música. La lava corre más rápido y más lejos, el agua se
  evapora, las camas explotan y la brújula y el reloj giran sin rumbo. Maderas carmesí y distorsionada,
  piedra negra, basalto y ladrillos del Nether con todas sus formas. Cada dimensión es un mundo aparte
  (su guardado, sus criaturas y sus sistemas); al morir allí se vuelve al mundo normal.
- **Criaturas del Nether**: **piglins** que admiran el oro y lo truecan (con la tabla de Java), se
  enfadan si no llevas nada de oro o si tocas sus cofres, cazan hoglins y bailan al ganar; **piglins
  brutos**; **piglins zombificados** neutrales que se enfadan en grupo; **ghasts** cuyas bolas de fuego
  se devuelven de un golpe; **blazes**; **cubos de magma** que se dividen; **hoglins** que embisten y
  lanzan por los aires (y se crían con hongos carmesíes) y **zoglins**; **striders** que caminan sobre
  la lava y se montan con silla y una caña con hongo distorsionado; y **esqueletos wither**. Los piglins
  y hoglins que salen del Nether se zombifican. Con ellos llegan la carga de fuego, la flecha espectral,
  la velocidad de alma, el disco «Tears», el cráneo de esqueleto wither y la cabeza de piglin.
- **Estructuras del Nether** (portadas de Java 26.3): **fortalezas** de ladrillo del Nether con sus
  puentes sobre el mar de lava, pasillos, tronos con generador de blazes, balcones y salas de cultivo
  con verruga del Nether (que ya se planta en arena de alma y crece); **bastiones en ruinas** de los
  cuatro tipos (viviendas, establos de hoglins, puente y sala del tesoro con sus cascadas de lava),
  montados pieza a pieza como en Java, con piglins, brutos y hoglins de guardia y los cofres del
  bastión (el disco «Pigstep» y el diseño de estandarte del hocico); **fósiles** de hueso en el valle
  de almas y **portales en ruinas** del Nether, a veces medio hundidos en la lava. El mar de lava tiene
  costras que se enfrían y derivan despacio en lugar de una baldosa repetida.
- **El End** (portado de Java 26.3): las **fortalezas** con su biblioteca y la sala del portal, el **ojo de
  ender** que vuela hacia la más cercana y el **portal del End** que se abre con los doce ojos; la isla del
  dragón con sus pilares de obsidiana y cristales, el **dragón de Ender** con todas sus fases, su barra de jefe,
  su muerte (portal de salida, huevo y puertas del End) y su **reaparición** con cuatro cristales (con
  `/jefes duros`, o en difícil, gana vida con cada jugador y se enfurece al final); las islas
  exteriores con sus **plantas de coro**, las **ciudades del End** con sus torres, puentes, cofres y
  **shulkers**, y el **barco** con la **cabeza de dragón** y los **élitros** (planeo con la física de Java,
  cohetes y el viento al volar); **cajas de shulker** de 17 colores que se llevan lo suyo y el **cofre de
  ender** de cada jugador.
- **El Wither** (portado de Java 26.3): se invoca con tres cráneos de esqueleto wither sobre una T de arena o tierra
  de alma (en cualquier orientación, también tumbada); nace invulnerable, crece y explota; sus tres cabezas eligen
  cada una su objetivo y lanzan calaveras que explotan y dan Marchitamiento (las azules rompen hasta la obsidiana);
  a media vida se blinda (las flechas rebotan) y rompe los bloques que le rodean al recibir daño. Barra morada que
  oscurece el cielo, estrella del Nether al morir y **rosa marchita** donde caen sus víctimas (con `/jefes duros`
  también gana vida con cada jugador y dispara el doble al final).
- **Lo que da el Nether**: **escombros ancestrales** y la **netherita** (herramientas, armadura y armadura
  para caballo que se mejoran desde el diamante en la **mesa de herrería**, que no arden y flotan en la lava),
  el **nexo de reaparición** (se carga con piedra luminosa y fija el punto de reaparición en el Nether), la
  **magnetita** y la brújula magnetizada, el **faro** con su pirámide, su haz de colores y sus poderes, la
  **fogata de almas**, las **columnas de burbujas** (que suben sobre arena de alma y tiran hacia abajo sobre
  magma, también a las barcas) y los bloques de **cuarzo**.
- **Estructuras con botín**: mazmorras con generador de monstruos, minas abandonadas por piezas como en Java
  (sala de tierra, pasillos con soportes, raíles, telarañas, cruces de dos pisos, escaleras, puentes con pilares o
  cadenas, vagonetas con cofre y el generador de arañas de cueva; de roble oscuro en las badlands),
  templos del desierto y de la jungla, naufragios, portales en ruinas, iglús, pozos del desierto,
  cabañas de bruja, fósiles, ruinas oceánicas y tesoros enterrados, monumentos oceánicos con sus
  guardianes, la mansión del bosque con sus illagers y alays presos, y la ciudad antigua en el Deep
  Dark. Sus cofres traen el botín de Minecraft; `/localizar` indica dónde está la más cercana y el
  cartógrafo vende mapas de explorador.
- **Deep Dark**: bajo las montañas, con sculk que se extiende al morir algo cerca, sensores que oyen
  las vibraciones (y dan señal de redstone), chilladores y el *warden*, que sale del suelo, huele,
  persigue lo que oye y lanza su estampido sónico.
- **Clima**: lluvia, nieve y tormentas con rayos (destello, trueno y daño). En las zonas frías la nieve
  se acumula en capas y el agua se congela; junto a la luz se derriten.
- **Mapas y brújula**: un mapa vacío se convierte en el mapa de la zona (128×128 bloques) y se ve al
  llevarlo en la mano; la brújula apunta al punto de aparición. Diez maderas (roble, abedul, abeto, jungla, acacia, roble oscuro, cerezo,
  mangle, roble pálido y bambú). 384 bloques
  de alto como en Minecraft actual: de y = −64 (lecho de roca) a 319.
- **Catálogo del mundo normal** (unos 920 bloques y 1160 objetos, ver [`docs/cobertura.md`](docs/cobertura.md)):
  los 16 colores (tintes, lana, alfombras, hormigón que se endurece en el agua, cristal tintado,
  terracota esmaltada, camas, velas y estandartes), todas las piedras con escaleras, losas y muros, el
  cobre que se oxida (el panal lo encera y el hacha lo raspa) con sus herramientas y armadura,
  arrecifes de coral, bosques de algas, prismarina y esponjas, flores altas, bayas dulces, azaleas y
  plantaformas; macetas, faroles, cadenas, campana, andamios, cuadros y marcos; carteles colgantes,
  estantería cincelada (se meten y sacan libros), soporte para armadura, etiquetas para poner nombre a
  las criaturas, correas (al jugador o a una valla) y sacos para llevar varios objetos en una ranura;
  nuevas comidas, 52 huevos generadores, catalejo y reloj. También fuego y mechero, ballesta, tridente,
  armaduras de caballo y de lobo, cohetes, conducto, cabezas de criaturas (con creepers cargados),
  tocadiscos con 16 discos de música propia, libros que se escriben y se leen en el atril, estandartes
  con dibujos (telar), calderos, nieve polvo, bloque de slime que rebota y los suelos que faltaban.
- **Supervivencia**: vida, hambre y saturación, aire bajo el agua, daño por caída, lava, fuego,
  ahogamiento, vacío y asfixia, regeneración, muerte con pérdida del inventario y reaparición.
  Minado con tiempos reales según la dureza del bloque y la herramienta (con grietas), desgaste de
  herramientas, comida, arco y flechas, cubos de agua y lava.
- **Inventario y fabricación**: inventario de 36 ranuras con fabricación 2×2, mesa de trabajo 3×3,
  cofres y hornos compartidos entre jugadores. Clic, clic derecho, mayúsculas + clic, teclas 1–9 y Q
  funcionan como en Minecraft.
- **62 criaturas** con IA, búsqueda de caminos (A*), animaciones y sonidos propios: animales de
  granja y salvajes (zorros, cabras, osos polares, conejos, lobos, pandas, loros, armadillos y abejas
  con sus nidos y su miel), criaturas acuáticas (peces, delfines, tortugas, ajolotes, ranas y calamar
  brillante, guardianes) y monstruos (zombis, esqueletos, creepers, arañas, endermen, ahogados, brujas,
  slimes, fantasmas, lepismas y aldeanos zombi). También murciélagos, ocelotes, champiñacas, alays,
  llamas de comerciante y caballos esqueleto (la trampa del rayo) y zombi. Los monstruos aparecen en la
  oscuridad y los no muertos arden al sol.
- **Aldeas y comercio**: aldeanos con 13 profesiones según su bloque de trabajo (clérigo incluido) y 7 tipos
  según su bioma (su ropa y algunas ofertas), que pasean de día y vuelven a casa de noche; clic derecho abre el
  comercio con las ofertas de Minecraft 26.3 (2 más por nivel, 5 niveles). Los precios suben con la demanda y
  cambian con tu reputación con cada aldeano (lo que se cuentan entre ellos) y el Héroe de la aldea; reponen
  trabajando en su bloque. Vendedor ambulante y gólem de hierro protector.
- **Saqueadores y asaltos**: puestos de saqueadores y patrullas con capitán. Su botella ominosa da Mal
  presagio y, al entrar en una aldea, llega un asalto por oleadas (saqueadores, vindicadores,
  evocadores con sus colmillos y vex, devastadores y brujas) con su barra arriba; ganarlo te hace
  Héroe de la aldea. El evocador suelta el tótem de inmortalidad.
- **Domesticar y montar**: lobos y gatos se domestican (se sientan, siguen y defienden a su dueño);
  gólems de hierro y de nieve se construyen con calabazas. Caballos, burros, mulas y camellos se doman
  y se montan con silla (salto cargado); las llamas escupen.
- **Agua y lava que fluyen** como en Minecraft: el agua avanza 7 bloques y la lava 3, caen, buscan
  el hueco más cercano, se secan al quitar la fuente, dos fuentes de agua crean una tercera y el
  contacto agua–lava forma obsidiana, roca o piedra. Las corrientes arrastran al jugador y la
  superficie se inclina y fluye en los shaders.
- **Construcción con formas**: losas (también dobles) y escaleras de madera, roca, piedra, ladrillos
  de piedra, ladrillos y arenisca; vallas y portillos que se unen solos; puertas de dos bloques con
  bisagra (y puertas dobles), trampillas, escaleras de mano para trepar, paneles de cristal y
  antorchas en la pared. Se colocan como en Minecraft (la mitad y la orientación dependen de dónde
  haces clic y hacia dónde miras), tienen colisiones reales y se suben losas y escalones sin saltar.
  También muros de 8 piedras (se unen como las vallas) y carteles de pie o en la pared: al ponerlos
  se escribe su texto (cuatro líneas) y lo ven todos los jugadores.
- **Camas** de 8 colores: dormir de noche salta al amanecer cuando todos los jugadores del mundo
  están acostados (no si hay monstruos cerca) y la cama pasa a ser tu punto de reaparición.
- **Bloques de trabajo**: cofres que se unen en cofres grandes de 54 huecos; ahumador (comida) y alto
  horno (minerales), el doble de rápidos que el horno; fogata que alumbra, echa humo, asa hasta
  cuatro alimentos y quema al pisarla; cortapiedras para sacar losas, escaleras, muros y ladrillos.
- **Granja**: azadas y tierra de cultivo (se hidrata con agua a 4 bloques o con la lluvia, se seca y
  se pisotea al saltar encima); semillas que salen de la hierba; trigo, zanahorias, patatas y
  remolachas que crecen con la velocidad de Minecraft; polvo de hueso; pan, patata asada, azúcar,
  fardos de heno y tarta (se come por porciones y devuelve los cubos). Calabazas y sandías: sus
  tallos maduran y dan el fruto al lado; las calabazas se tallan con tijeras (con una antorcha, farol)
  y salen en grupos por el mundo. El compostador convierte restos de cosecha en polvo de hueso.
- **Pesca**: caña con flotador y sedal; cuando pica un pez el flotador se hunde y hay que recoger a
  tiempo: bacalao, salmón, pez tropical, pez globo, algo de basura y a veces un tesoro.
- **Animales de granja**: los animales siguen a quien lleva su comida y se crían (corazones, crías que
  crecen en 20 minutos y más rápido si comen); las ovejas se esquilan y les vuelve a crecer la lana
  comiendo hierba; las vacas se ordeñan con un cubo y las gallinas ponen huevos, que se pueden lanzar
  (a veces nace un pollito).
- **Armaduras**: cuero, hierro, oro y diamante (casco, peto, grebas y botas) con la reducción de daño
  y el desgaste de Minecraft; se ponen con clic derecho o en las ranuras del inventario, se ven sobre
  los jugadores (también sobre los demás) y tienen su barra en el HUD.
- **Escudo**: se levanta con clic derecho mantenido, frena el paso y para los golpes, flechas y
  explosiones que llegan de frente (no por la espalda); se desgasta con cada golpe fuerte.
- **Efectos de estado**: 33 efectos de Minecraft (velocidad, fuerza, regeneración, veneno,
  invisibilidad, supersalto, caída lenta, prisa, náuseas, ceguera, brillo, levitación,
  marchitamiento…) con sus mecánicas, sus iconos y el tiempo restante en el HUD. Los dan las
  pociones, la comida (manzana dorada, pez globo, estofado sospechoso según la flor), la campana a
  los saqueadores y los delfines al nadar; la leche los quita.
- **Pociones**: soporte para pociones con polvo de blaze y 42 pociones con los ingredientes de
  Minecraft; se beben, se arrojan, dejan nubes persistentes y se ponen en las flechas.
- **Encantamientos**: mesa de encantamientos con librerías, los 37 encantamientos del mundo normal
  con sus efectos reales, libros encantados, yunque (combinar, reparar y renombrar) y afiladora; lo
  encantado brilla.
- **Redstone y mecanismos**: polvo, antorchas, repetidores, comparadores, palancas, botones, placas,
  lámparas, detector de luz solar, bloque musical, cuerda trampa, puertas de hierro y bombillas de
  cobre; pistones y adhesivos (con slime y miel), observadores, tolvas, dispensadores, soltadores y
  dinamita con la explosión de Minecraft. Ver [`docs/redstone.md`](docs/redstone.md) y
  [`docs/mecanismos.md`](docs/mecanismos.md).
- **Barcas y vagonetas**: barcas y balsas de las 10 maderas (también con cofre), con remos; raíles
  normales, propulsores, detectores y activadores; vagonetas con cofre, horno, tolva y dinamita.
- **Experiencia**: orbes al matar criaturas, criar animales, minar menas y sacar lo fundido del horno;
  niveles con las fórmulas de Minecraft, barra con el nivel y al morir se suelta parte.
- **Mundo vivo**: la arena y la grava caen, las plantas y antorchas necesitan apoyo, las hojas se
  caen al talar el árbol, los brotes crecen hasta ser árboles, la hierba se extiende y los cactus y
  la caña crecen.
- **Partículas propias** (hasta 16 000, dibujadas con un atlas procedural): humo que crece y se lo
  lleva el viento, llamas animadas, chispas, destellos, corazones, trozos de bloque que rebotan,
  explosiones con fogonazo, gotas que cuelgan de los techos y salpican, burbujas, brasas de la lava,
  esporas del micelio, luciérnagas en las noches despejadas, salpicaduras de lluvia y pétalos y hojas
  que caen meciéndose y se posan en el suelo. Se funden suavemente con la geometría.
- **Gráficos avanzados** (WebGL2, todo propio):
  - Cielo físico con dispersión atmosférica (modelo de Hillaire): amaneceres, atardeceres, noche con
    luna con fases y estrellas.
  - Sombras suaves del sol y de la luna (mapa de sombras distorsionado + PCF), también de criaturas
    y objetos.
  - Nubes volumétricas con dispersión múltiple y sombras de nubes sobre el terreno.
  - Rayos de luz volumétricos (*god rays*), también bajo el agua.
  - Agua con refracción, absorción física por profundidad, reflejos en espacio de pantalla (SSR),
    brillo del sol, espuma en la orilla, cáusticas y un océano infinito en el horizonte.
  - Materiales PBR (normales, rugosidad, metales, emisión), dispersión subsuperficial en hojas y
    plantas, viento en la vegetación, iluminación de antorchas y oclusión ambiental.
  - TAA, bloom, exposición automática (adaptación de la vista), tonemapping ACES y visión nocturna.
  - Texturas pixel art 16×16 originales generadas por código (más de 600 texturas de bloque, los
    objetos y todas las criaturas; sin recursos de Mojang).
- **Multijugador**: comparte el enlace del mundo. Cada mundo es un Durable Object que ejecuta el
  servidor de juego (20 ticks por segundo mientras haya alguien conectado) y guarda en SQLite los
  cambios, los cofres y hornos, el estado de cada jugador y los animales.
- **Chat de voz por proximidad**: la voz va directa de navegador a navegador (WebRTC; el servidor sólo
  presenta a los jugadores) y suena como un sonido más del mundo: sale de la cabeza de quien habla, se apaga
  con la distancia hasta los 48 bloques (24 susurrando), las paredes la amortiguan según el material (la lana
  casi del todo, el cristal y las hojas poco), retumba en cuevas y salas, suena ahogada bajo el agua y sólo se
  oye a los de la misma dimensión. Pulsar para hablar (V) o micrófono que se abre al hablar, volumen o silencio
  por jugador y **grupos** que se oyen a cualquier distancia (`/grupo`).
- **Un jugador sin conexión**: el mismo servidor de juego se ejecuta en un Web Worker y el mundo se
  guarda en el navegador (IndexedDB). Se activa con la casilla del menú o automáticamente si no se
  puede contactar con el servidor.
- **Sonido procedural** (Web Audio): pasos por material, romper/colocar y golpes de minado, voces de
  cada criatura, combate, comer, arco, explosiones, agua y lava cercanas, latido con poca vida,
  ambiente (viento, pájaros, grillos, cuevas, orilla, bajo el agua) y música generativa.

## Capturas

| | |
| --- | --- |
| ![Bosque a mediodía](docs/screenshots/forest.png) | ![Atardecer sobre la costa](docs/screenshots/sunset.png) |
| ![Criaturas](docs/screenshots/mobs.png) | ![Agua y lava que fluyen](docs/screenshots/fluids.png) |
| ![Horno e inventario](docs/screenshots/furnace.png) | ![Minando con un pico](docs/screenshots/mining.png) |
| ![Bloques PBR sobre el agua](docs/screenshots/build.png) | ![Bajo el agua](docs/screenshots/underwater.png) |
| ![Tormenta](docs/screenshots/rain.png) | ![Noche con antorchas](docs/screenshots/torches.png) |
| ![Losas, escaleras, vallas, puerta y cama](docs/screenshots/building.png) | ![Granja con trigo, zanahorias, patatas y remolachas](docs/screenshots/farm.png) |
| ![Armadura de diamante y barra de experiencia](docs/screenshots/armor.png) | ![Espada y escudo, efectos de estado y corazones dorados al atardecer](docs/screenshots/combat.png) |
| ![Huerto de calabazas y sandías con faroles y compostador](docs/screenshots/gourds.png) | ![Pescando en un estanque](docs/screenshots/fishing.png) |
| ![Taller con cartel, cofre doble, ahumador, alto horno, cortapiedras y fogata](docs/screenshots/workshop.png) | ![Inventario con la mano secundaria y la descripción de un arma](docs/screenshots/inventory.png) |
| ![Jungla con árboles gigantes y enredaderas](docs/screenshots/jungle.png) | ![Arboleda de cerezos al pie de una montaña](docs/screenshots/cherry.png) |
| ![Tierras baldías con mesetas de terracota](docs/screenshots/badlands.png) | ![Isla de champiñones gigantes](docs/screenshots/mushroom.png) |
| ![Pantano con nenúfares y orquídeas azules](docs/screenshots/swamp.png) | ![Picos de hielo compacto en la nieve](docs/screenshots/ice_spikes.png) |
| ![Cueva frondosa con musgo y enredaderas de bayas luminosas](docs/screenshots/lush.png) | ![Cueva de goteo con estalactitas](docs/screenshots/dripstone.png) |
| ![Geoda de amatista a oscuras](docs/screenshots/geode.png) | ![Pizarra profunda con menas](docs/screenshots/deepslate.png) |
| ![Templo del desierto](docs/screenshots/desert_temple.png) | ![Mazmorra con generador de monstruos y cofre](docs/screenshots/dungeon.png) |
| ![Naufragio en el fondo del mar](docs/screenshots/shipwreck.png) | ![Templo de la jungla entre cerezos](docs/screenshots/jungle_temple.png) |
| ![Mapa de la zona en la mano](docs/screenshots/map.png) | ![Rayo de tormenta sobre la costa, con la brújula](docs/screenshots/lightning.png) |
| ![Comercio con un cantero de la aldea](docs/screenshots/trade.png) | ![Gólems de hierro y de nieve, aldeanos, gato y lobo](docs/screenshots/golems.png) |
| ![Caballo, burro, mula, llama y camello](docs/screenshots/mounts.png) | ![Slime, bruja y otros monstruos nuevos; un fantasma al fondo](docs/screenshots/monsters.png) |
| ![Tortuga, ajolote, delfín y peces en la playa](docs/screenshots/aquatic.png) | ![Panda, oso polar, zorro, abeja y armadillo](docs/screenshots/fauna.png) |
| ![Capitán de una patrulla con el estandarte ominoso](docs/screenshots/pillagers.png) | ![Evocador y, detrás, una patrulla de saqueadores](docs/screenshots/evoker.png) |
| ![Puesto de saqueadores en la taiga](docs/screenshots/outpost.png) | ![Barra de un asalto sobre la aldea](docs/screenshots/raid.png) |
| ![Pétalos cayendo bajo las ramas de un cerezo](docs/screenshots/cherry_petals.png) | ![Asistente de comandos del chat con sugerencias e iconos](docs/screenshots/chat.png) |
| ![Muestrario de maderas, colores, piedras, cobre, prismarina y corales, con flores altas y decoración](docs/screenshots/catalog.png) | ![Macetas, faroles, campana, andamios, un cuadro y un marco de noche](docs/screenshots/decoration.png) |
| ![Arrecife de coral con pepinos de mar que brillan](docs/screenshots/coral_reef.png) | ![Bosque de algas en un océano templado](docs/screenshots/kelp_forest.png) |
| ![Carteles colgantes, estantería cincelada, soporte con armadura y un cerdo con nombre atado a una valla](docs/screenshots/finishing.png) | ![Saco con objetos dentro en el inventario](docs/screenshots/bundle.png) |
| ![Calderos con agua, lava y nieve polvo, cabezas de criaturas y bloques nuevos de noche](docs/screenshots/cauldrons.png) | ![Barcas en el agua y vagonetas sobre raíles, con una poción en la mano](docs/screenshots/transport.png) |
| ![Mesa de encantamientos rodeada de librerías, con una espada encantada](docs/screenshots/enchanting.png) | ![Palanca, polvo de redstone y repetidor que encienden una lámpara de noche](docs/screenshots/redstone.png) |
| ![Pistón extendido empujando una fila de piedra, con tolva, dispensador y observador](docs/screenshots/pistons.png) | ![Dinamita explotando en cadena junto a un pistón](docs/screenshots/tnt.png) |
| ![Monumento oceánico visto desde la superficie, con sus faroles marinos](docs/screenshots/monument.png) | ![Guardianes nadando junto al monumento](docs/screenshots/guardians.png) |
| ![Mansión del bosque entre los árboles del bosque oscuro](docs/screenshots/mansion.png) | ![Caballo esqueleto, champiñaca, llama de comerciante y caballo zombi](docs/screenshots/critters.png) |
| ![Ciudad antigua en el Deep Dark, con el sculk que brilla](docs/screenshots/ancient_city.png) | ![El warden en la ciudad antigua](docs/screenshots/warden.png) |
| ![Portal del Nether encendido entre cascadas de lava](docs/screenshots/nether_portal.png) | ![Un hoglin en el bosque carmesí](docs/screenshots/crimson_forest.png) |
| ![Bosque distorsionado con sus hongos gigantes y un enderman](docs/screenshots/warped_forest.png) | ![Un ghast sobre el valle de almas, con el mar de lava encendido abajo](docs/screenshots/soul_sand_valley.png) |
| ![Cubos de magma saltando en los deltas de basalto](docs/screenshots/basalt_deltas.png) | ![Strider con un piglin zombificado de jinete, por el mar de lava](docs/screenshots/strider.png) |
| ![Piglin admirando el lingote de oro del trueque](docs/screenshots/barter.png) | ![Blaze, esqueleto wither y piglin bruto peleando](docs/screenshots/nether_mobs.png) |
| ![Puentes de una fortaleza del Nether sobre los deltas de basalto](docs/screenshots/nether_fortress.png) | ![Muros de un bastión en ruinas con sus cascadas de lava](docs/screenshots/bastion.png) |
| ![Fósil de hueso en el valle de almas](docs/screenshots/nether_fossil.png) | ![Portal en ruinas del Nether con su cofre, oro y la mancha de rocanegra](docs/screenshots/nether_ruined_portal.png) |
| ![Dos faros de noche, uno con el haz teñido por cristales de color](docs/screenshots/beacon.png) | ![Faro sobre su pirámide, nexo de reaparición cargado, magnetita, cuarzo, escombros ancestrales y netherita](docs/screenshots/nether_goods.png) |
| ![La isla del dragón con sus pilares de obsidiana y la barra del dragón de Ender](docs/screenshots/end_island.png) | ![El portal de salida con el huevo de dragón sobre el podio](docs/screenshots/end_portal.png) |
| ![Ciudad del End con sus torres y puentes, y el barco flotando bajo el destello del cielo](docs/screenshots/end_city.png) | ![Planeando con élitros sobre una ciudad del End](docs/screenshots/elytra.png) |
| ![Cajas de shulker de colores, un cofre de ender y una cabeza de dragón](docs/screenshots/shulker_boxes.png) | ![El Wither en vuelo, con los ojos de sus tres cabezas encendidos](docs/screenshots/wither.png) |

## Controles

Todas las teclas se pueden cambiar en **Ajustes → Teclas** (también agacharse y correr con una sola
pulsación). Estas son las de por defecto:

| Tecla | Acción |
| --- | --- |
| WASD | Moverse |
| Espacio | Saltar · en creativo, doble pulsación para volar |
| Shift | Agacharse (no caes por los bordes; permite colocar bloques sobre cofres, mesas y puertas; quieto en una escalera de mano; levantarse de la cama; bajarse de la montura) |
| Ctrl o doble W | Correr (en supervivencia hace falta tener algo de hambre saciada). En una ventana normal, Ctrl + W es el atajo de cerrar la pestaña: el juego pide confirmación antes de cerrar, y en **Pantalla completa** (botón de la pausa) Ctrl + W ya no cierra nada |
| Clic izquierdo | Romper bloque (mantener) · atacar criaturas (cada arma tiene su ritmo: la barra bajo la mira indica cuándo el golpe hace todo su daño) |
| Clic derecho | Colocar · abrir cofres, hornos, mesas, puertas, trampillas y portillos · dormir · comer o beber (mantener) · tensar el arco · usar cubos · labrar con la azada · polvo de hueso · dar de comer, esquilar u ordeñar animales · domesticar, sentar y montar · comerciar con aldeanos |
| Clic central | Coger el bloque apuntado: lo selecciona en la barra, lo trae de la mochila o, en creativo, lo crea |
| 1–9, rueda | Elegir ranura |
| Q · Ctrl + Q | Tirar un objeto · tirar la pila |
| F | Pasar lo que llevas a la mano secundaria (escudo, antorcha, comida…); el clic derecho la usa si la principal no hace nada |
| Ctrl corriendo bajo el agua | Bucear en postura horizontal; en huecos de un bloque se gatea |
| E | Inventario (en creativo, selector de bloques y objetos) |
| T, Enter, / | Chat y comandos: al escribir «/» se abre una ventanita con los comandos y sus argumentos (objetos con icono, criaturas, efectos, estructuras, jugadores…); ↑↓ eligen, Tab o → completan, Enter acepta lo elegido y Esc la cierra. Sin la ventanita, ↑↓ recorren lo enviado antes |
| Tab | Lista de jugadores |
| V · B | Chat de voz: hablar · susurrar (mantener; la primera vez pide el micrófono) |
| F1 · F2 · F3 · F5 | Ocultar HUD · captura de pantalla · información de depuración · tercera persona |
| Esc | Pausa / ajustes |

### Comandos

| Comando | Qué hace |
| --- | --- |
| `/modo supervivencia` · `/modo creativo` | Cambia tu modo de juego |
| `/dificultad pacifico\|facil\|normal\|dificil` | Dificultad del mundo (en pacífico no hay monstruos) |
| `/time set dia\|mediodia\|atardecer\|noche\|medianoche\|amanecer` | Cambia la hora |
| `/invocar <criatura>` | Hace aparecer una criatura delante (`cerdo`, `zombi`, `creeper`…) |
| `/dar <objeto> [cantidad]` | Deja objetos a tus pies (`/dar diamond 5`, `/dar iron_pickaxe`) |
| `/efecto <efecto> [segundos] [nivel]` | Da un efecto (`/efecto velocidad 60 2`); `/efecto quitar` los quita todos |
| `/voz [on\|off]` · `/voz silenciar\|activar <jugador>` · `/voz volumen <jugador> <0-200>` | Chat de voz: estado, activarlo, silenciar o subir a alguien |
| `/grupo <nombre>` · `/grupo salir` | Grupo de voz: los del mismo grupo os oís a cualquier distancia en la dimensión |
| `/matar` | Muerte instantánea (por si te quedas atascado) |
| `/localizar <estructura>` | Dónde está la estructura más cercana (`templo_del_desierto`, `templo_de_la_jungla`, `naufragio`, `portal_en_ruinas`, `iglu`, `pozo`, `mina`, `aldea`, `puesto`, `monumento`, `ruinas`, `tesoro`, `fortaleza`; en el End, `ciudad_del_end`) |
| `/asalto` · `/patrulla` | Desatar un asalto en la aldea más cercana · hacer aparecer una patrulla de saqueadores |
| `/dimension overworld\|nether\|end [x y z]` | Ir a otra dimensión (a su punto de aparición o a unas coordenadas) |
| `/setblock <x> <y> <z> <bloque>` · `/fill <x1> <y1> <z1> <x2> <y2> <z2> <bloque>` | Poner un bloque o llenar una caja (hasta 32768; `~` = relativo a ti) |
| `/tp <jugador>` · `/lista` · `/seed` · `/ayuda` | Teletransporte, jugadores, semilla y ayuda |

### Primeros pasos en supervivencia

1. Rompe troncos con la mano y conviértelos en tablones (inventario, cuadrícula 2×2).
2. Con 4 tablones haz una mesa de trabajo; en ella fabrica palos, un pico y una espada de madera.
3. Consigue roca con el pico, haz herramientas de piedra y un horno (8 de roca).
4. Funde menas de hierro con carbón para conseguir lingotes (herramientas de hierro, cubos,
   tijeras). Los diamantes necesitan pico de hierro.
5. Antes de la noche, fabrica antorchas (carbón + palo) y un refugio: los monstruos no aparecen en
   lugares iluminados.

Recetas incluidas: tablones, palos, mesa de trabajo, antorchas, cofre, horno, librería, ladrillos
de piedra, arenisca, ladrillos, arcilla, las 20 herramientas (madera, piedra, hierro, oro y
diamante × pico, hacha, pala y espada), cubo, tijeras, arco, flechas, papel, libro, bloques de
hierro/oro/diamante (y de vuelta a lingotes), lana y lana teñida con flores o lapislázuli, losas,
escaleras, vallas, portillos, puertas, trampillas, escalera de mano, paneles de cristal, cama, azadas,
pan, fardo de heno, polvo de hueso, azúcar y tarta. En el horno: vidrio, piedra, lingotes, carbón
vegetal, ladrillos, terracota, carne cocinada y patata asada.

## Desarrollo local

Requisitos: Node.js 20 o superior.

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. El servidor de desarrollo de Vite ejecuta también el Worker y el
Durable Object (con `workerd`), así que el multijugador funciona en local: abre dos pestañas con el
mismo mundo para probarlo.

Otros comandos:

```bash
npm run typecheck   # comprobación de tipos (cliente, servidor y pruebas)
npm test            # pruebas del servidor de juego (fluidos, criaturas, colocación, camas, granja, ids...)
npm run build       # compila cliente + Worker en dist/
npm run preview     # compila y sirve la versión de producción en local
```

## Desplegar en Cloudflare

1. Crea una cuenta gratuita en [Cloudflare](https://dash.cloudflare.com/sign-up).
2. Inicia sesión desde la terminal:

   ```bash
   npx wrangler login
   ```

3. Despliega:

   ```bash
   npm run deploy
   ```

   Wrangler te mostrará la URL pública (por ejemplo `https://voxelcraft.<tu-subdominio>.workers.dev`).
   La primera vez crea el Durable Object `GameWorld` con almacenamiento SQLite (incluido en el plan
   gratuito). Los mundos creados con la versión anterior siguen funcionando: sus construcciones se
   conservan.

4. Comparte el enlace de invitación desde el juego (**Copiar invitación** en el menú o en la pausa).
   Tiene la forma `https://…/?mundo=nombre-del-mundo`: todos los que entren con el mismo nombre de
   mundo juegan juntos. El modo de juego elegido en el menú se aplica al crear un mundo nuevo; los
   jugadores que se unen después empiezan en el modo del mundo.

### Límites del plan gratuito

El juego está pensado para grupos de amigos dentro del plan gratuito de Workers:

- **Tiempo de servidor**: mientras haya alguien conectado, el Durable Object del mundo simula a 20
  ticks por segundo (1–2 ms de CPU por tick con 4 jugadores y un centenar de criaturas). El plan
  gratuito incluye 13.000 GB·s al día, unas **28 horas de mundo activo al día** (sumando todos los
  mundos). Cuando se va el último jugador la simulación se detiene y deja de consumir.
- **Peticiones**: los mensajes entrantes se facturan a razón de 20:1; con la posición a ~8 Hz (solo
  cuando te mueves) y un ping cada 5 s, cada hora-jugador consume unas 1.500–2.500 de las 100.000
  peticiones diarias.
- **Escrituras**: el mundo se guarda cada 30 segundos (una fila por chunk modificado, por cofre y
  por jugador) y al salir el último jugador, así que el agua que fluye o la hierba que crece no
  agotan las 100.000 filas diarias.
- El servidor es quien ordena las ediciones: si dos jugadores tocan el mismo bloque a la vez, todos
  ven el mismo resultado; lo que construyas durante un corte de conexión se envía al reconectar.
- Hasta 16 jugadores por mundo.

Si el grupo es grande o juega muchas horas, el plan Workers Paid (5 USD/mes) elimina estas
preocupaciones.

### Qué no incluye (todavía)

VoxelCraft reproduce el bucle principal de supervivencia de Minecraft, pero no todo el juego:

- 73 de las 86 criaturas de Minecraft: faltan el Wither y las de 2024–2026 (sniffer, breeze, creaking…).
- Sin Wither (la estrella del Nether sólo se consigue en creativo) ni el Poema del End al salir del End.
- El inventario y la vida de cada jugador los gestiona su navegador (confianza entre amigos): los
  bloques, los cofres, los hornos, las criaturas y los objetos del suelo sí los controla el servidor.
- Los fluidos, las criaturas y el crecimiento de plantas solo se simulan cerca de los jugadores
  (unos 64 bloques), como las "distancias de simulación" de Minecraft.
- Los objetos del suelo y los monstruos no se guardan si el servidor se reinicia sin nadie
  conectado (los animales, los cofres y lo construido sí).

## Desplegar en un VPS propio (open-compute)

También se puede levantar todo (web, multijugador y mundos guardados) en un VPS con
[open-compute](https://open-compute.dev), una plataforma compatible con Cloudflare Workers que corre en una sola
máquina. La guía paso a paso (instalación, dominio con HTTPS, actualizaciones y copias) está en
[docs/despliegue-vps.md](docs/despliegue-vps.md); en corto:

```bash
curl -fsSL https://open-compute.dev/install.sh | sudo sh && sudo ocd setup --system --yes
git clone https://github.com/EijunnN/minecraft-clone.git voxelcraft && cd voxelcraft && npm ci
npm run deploy:vps
```

## Calidad gráfica

En **Ajustes** hay cuatro perfiles (Bajo, Medio, Alto, Ultra) y control individual de distancia de
visión, escala de resolución, sombras, nubes, reflejos, luz volumétrica, TAA y bloom. El juego elige
un perfil inicial según la GPU detectada. Si va lento en un portátil, prueba **Bajo** o reduce la
escala de resolución.

## Estructura

```
src/
  shared/          Bloques, objetos, criaturas, recetas, contenedores, protocolo y generación del mundo
    sim/           Servidor de juego: fluidos, criaturas (IA, A*), física, objetos, hornos, guardado
      server/      Sistemas del servidor (systems.ts los crea y conecta; messageRouter.ts reparte los mensajes)
  server/          Worker + Durable Object (GameWorld) con almacenamiento SQLite
  client/
    world/         Iluminación y mallado (Web Workers), gestión de chunks
    render/        Pipeline WebGL2 y shaders (cielo, terreno, agua, nubes, criaturas, objetos, post)
    textures/      Texturas procedurales (bloques, objetos y criaturas)
    audio/         Motor de sonido procedural
    game/          Bucle de juego, jugador, supervivencia, inventario, entidades, entrada
    net/           Cliente de red y servidor local (Web Worker + IndexedDB)
    ui/            Menús, HUD, pantallas de inventario, fabricación, cofre y horno
```
