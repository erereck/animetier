# AnimeTier 6

Tier lists de anime, mangá e personagens, alimentadas pelo AniList. Puxe sua lista em segundos, arraste (ou ranqueie no teclado) e compartilhe com um link.

## O que tem

- **Importação do AniList** — sua lista de anime ou mangá (com nota, status, progresso e datas), uma temporada inteira, ou seus personagens favoritos. Busca com arrastar direto do resultado pra uma tier.
- **Board + pool lado a lado** — o pool fica num painel lateral redimensionável (no celular, numa gaveta embaixo), então nunca é preciso rolar até o fim da página pra arrastar.
- **Drag-and-drop de verdade** — mouse, toque (segure pra arrastar) e teclado; arrastar vários de uma vez; reordenar tiers pela alça.
- **Rank rápido (R)** — um item por vez em tela cheia; aperte 1–9 pra mandar pra tier. Sugere a tier a partir da sua nota e do que já está em cada tier.
- **Duelo** — ordena uma tier comparando dois itens por vez (inserção binária: ~n·log n escolhas).
- **Paleta de comandos (Ctrl+K)** — todas as ações, temas e itens num lugar só.
- **Insights** — perfil de gosto gerado ("Curador místico"), concordância com a comunidade, gêneros e estúdios a favor/contra, "você ama, o mundo nem tanto", tempo assistido.
- **Compartilhar por link** — o link guarda só IDs do AniList (comprimidos), sem upload nem conta. Quem abre pode salvar uma cópia.
- **Imagem em alta** — PNG gerado num canvas próprio, com prévia ao vivo, copiar pra área de transferência e várias opções.
- **8 temas, 8 fontes de rótulo**, títulos em inglês/romaji/japonês, capas que escolhem o tamanho certo pra economizar banda.
- **Desfazer/refazer com histórico nomeado**, salvamento automático no IndexedDB, imagens locais guardadas como blob (não somem mais), backup/restauração em JSON e exportação CSV/Markdown.
- **Migração da versão antiga** — importa os `.json` do AnimeTier v5 (inclusive a ordem visível das tiers que estavam em A→Z) e detecta saves antigos no mesmo domínio.

## Rodando

```bash
npm install
npm run dev
```

Build de produção (sai em `dist/`, funciona em qualquer subpasta):

```bash
npm run build
```

## Publicando no GitHub Pages

O workflow em `.github/workflows/deploy.yml` faz o build e publica a cada push na `main`. No repositório, vá em **Settings → Pages → Source: GitHub Actions**.

## Atalhos

| Tecla | Ação |
| --- | --- |
| `Ctrl K` | Paleta de comandos |
| `1`–`9` | Manda o item sob o mouse (ou a seleção) pra tier N |
| `0` | Devolve pro pool |
| `Enter` | Detalhes do item |
| `Del` | Exclui |
| `S` | Spoiler (borra a capa) |
| `X` / `Ctrl`+clique / `Shift`+clique | Seleção múltipla |
| `R` | Rank rápido |
| `I` | Insights |
| `/` | Buscar |
| `P` | Mostrar/esconder o pool |
| `Ctrl Z` / `Ctrl Y` | Desfazer / refazer |

## Estrutura

```
src/
  lib/        dados e lógica pura (AniList, IndexedDB, operações, share, render da imagem, insights, migração)
  store/      estado (zustand + immer): editor com histórico, configurações, UI
  components/ peças do editor (cards, tiers, pool, menus, overlays)
  features/   telas maiores carregadas sob demanda (rank rápido, duelo, paleta, insights, diálogos)
  views/      Home (biblioteca), Editor, link compartilhado
  styles/     tokens de tema e CSS por área
```

Dados e capas: [AniList](https://anilist.co) (API GraphQL pública). Tudo fica salvo só no navegador de quem usa.
