# voxelgl

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

**EN:** a Minecraft-style voxel engine in raw WebGL with no libraries and no build step: chunked infinite terrain from seeded fractal noise, greedy meshing, per-chunk GPU buffers, Amanatides–Woo raycasting for block picking, AABB physics with gravity and flying. On top of it, a small game: press `G` to start a gem hunt (ten hidden gems, two minutes, a compass to the nearest one). Engine and game logic run headless in the Node test-suite. MIT.
