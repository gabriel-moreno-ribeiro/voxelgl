# voxelgl

> 🇺🇸 [English version below](#english)

Um motor de voxels estilo Minecraft em JavaScript e WebGL cru. Nenhuma biblioteca, nenhum build: terreno infinito em chunks, greedy meshing, câmera em primeira pessoa com colisão e gravidade, quebrar e colocar blocos. E um joguinho em cima: a **caça às gemas**.

```sh
npx serve .     # qualquer servidor estático
```

Clica pra capturar o mouse e:

| Tecla | Ação |
| --- | --- |
| `W A S D` | andar |
| `Space` / `Shift` | pular / descer voando |
| `F` | voar |
| clique esquerdo / direito | quebrar / colocar bloco |
| `1`-`7` | tipo de bloco |
| `G` | **começa uma caça às gemas** |

`?seed=42` na URL gera outro mundo.

## Caça às gemas

Aperta `G` e dez blocos brilhantes aparecem escondidos num raio de 40 blocos em volta de você. Você tem dois minutos pra achar e quebrar todos. A bússola no canto aponta pra gema mais perto (`↗ 23m`), o que deixa a coisa mais "quente ou frio" do que "procure no mapa". Ganhou? Aparece o tempo. Perdeu? `G` de novo, que o sorteio muda.

Toda a lógica está em `src/game.js` (posicionamento em cima do terreno, longe de água e árvores; pontuação; relógio; bússola relativa ao yaw da câmera) e é testada em Node, sem WebGL.

## O motor

- **Mundo** (`src/world.js`): mapa de chunks 16x64x16, cada um um `Uint8Array` de ids. O terreno vem de value noise fractal com seed (`src/noise.js`): heightmap dá pedra, terra e grama; áreas baixas enchem de água e areia; um hash decide onde nasce árvore. Chunks são gerados quando o jogador se aproxima.
- **Greedy meshing** (`src/mesher.js`): por eixo e fatia, uma máscara marca as faces visíveis (face entre dois blocos opacos não existe) e runs de faces iguais viram o maior retângulo possível. Um campo plano de 16x16 vira meia dúzia de quads em vez de centenas. As bordas olham o chunk vizinho, então não tem "costura".
- **Renderer** (`src/renderer.js`): um conjunto de buffers por chunk, reconstruído só quando o chunk fica sujo. Shaders com cor por face, luz direcional e névoa. Chunks longe são descarregados da GPU.
- **Raycast** (`src/raycast.js`): travessia de grade de Amanatides & Woo, acha o bloco que você está olhando e por qual face entrou, que é onde o bloco novo vai.
- **Física** (`src/physics.js`): o jogador é uma caixa; o movimento é resolvido eixo por eixo contra blocos sólidos, com gravidade, pulo e modo voo.

A parte que mais me ensinou foi o greedy meshing. Eu tinha uma versão ingênua desenhando um quad por face, e o mundo travava com três chunks. Reescrever isso foi a diferença entre "demo" e "dá pra jogar".

Testes: `npm test` (noise, geração, mesher, raycast, física, matrizes e o jogo).

---

## English

A Minecraft-style voxel engine in JavaScript and raw WebGL. No library, no build: infinite chunked terrain, greedy meshing, first-person camera with collision and gravity, breaking and placing blocks. And a little game on top: the **gem hunt**.

```sh
npx serve .     # any static server
```

Click to capture the mouse and:

| Key | Action |
| --- | --- |
| `W A S D` | walk |
| `Space` / `Shift` | jump / descend while flying |
| `F` | fly |
| left / right click | break / place block |
| `1`-`7` | block type |
| `G` | **starts a gem hunt** |

`?seed=42` in the URL generates another world.

## Gem hunt

Press `G` and ten shiny blocks appear hidden within a 40-block radius around you. You have two minutes to find and break all of them. The compass in the corner points to the nearest gem (`↗ 23m`), which makes the thing more "hot or cold" than "search the map". Won? Your time shows up. Lost? `G` again, the draw changes.

All the logic lives in `src/game.js` (placement on top of the terrain, away from water and trees; score; clock; compass relative to the camera yaw) and is tested in Node, without WebGL.

## The engine

- **World** (`src/world.js`): a map of 16x64x16 chunks, each a `Uint8Array` of ids. Terrain comes from seeded fractal value noise (`src/noise.js`): a heightmap gives stone, dirt and grass; low areas fill with water and sand; a hash decides where a tree is born. Chunks are generated as the player gets close.
- **Greedy meshing** (`src/mesher.js`): per axis and slice, a mask marks the visible faces (a face between two opaque blocks doesn't exist) and runs of equal faces become the largest rectangle possible. A flat 16x16 field becomes half a dozen quads instead of hundreds. Edges look at the neighbouring chunk, so there's no "seam".
- **Renderer** (`src/renderer.js`): one set of buffers per chunk, rebuilt only when the chunk gets dirty. Shaders with per-face color, directional light and fog. Far chunks are unloaded from the GPU.
- **Raycast** (`src/raycast.js`): Amanatides & Woo grid traversal, finds the block you're looking at and through which face it entered, which is where the new block goes.
- **Physics** (`src/physics.js`): the player is a box; movement is resolved axis by axis against solid blocks, with gravity, jumping and fly mode.

The part that taught me the most was greedy meshing. I had a naive version drawing one quad per face, and the world froze with three chunks. Rewriting that was the difference between "demo" and "playable".

Tests: `npm test` (noise, generation, mesher, raycast, physics, matrices and the game).

MIT.
