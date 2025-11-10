
# ESP.EE · Painel Professor (r5 consolidado)

## Conteúdo
- index.html — inclui dependências (MSAL, SweetAlert2, XLSX, jsPDF) via CDN
- style.css — UI compacta (Admin e Professor) + pílulas de cor por tipo
- app.js — MSAL login; Graph OneDrive; Importar/Gerar; Backup; Editor de Horário com preview + conflito; Grelha Professor com legenda

## Passos para publicar
1) Colocar `index.html`, `style.css`, `app.js` na **raiz** do repositório GitHub Pages (branch ativa no Pages).
2) No **Azure AD > App registrations > Authentication > SPA**, garantir **Redirect URIs**:
   - https://<utilizador>.github.io/<repo>/
   - https://<utilizador>.github.io/<repo>/index.html
3) Abrir o site → **Entrar**.
4) Em **Diagnóstico**: (se necessário)
   - **Criar pastas**
   - **Inicializar ficheiros (vazios)**
   - **Limpar cache local**
5) Em **Administração** (topo):
   - **Fonte**: carregar Excel `.xlsx/.xlsm`
   - Usar **Importar** (Professores → Disciplinas → Alunos → Aulas) **ou** preencher a sheet `Horarios` e clicar **Gerar Aulas**.

## Observações
- Admin é concedido por allowlist (biblioteca@esparedes.pt) ou por `role:"admin"` em Professores.
- `aulaId` gerado: `<prof>-<dia>-<HHMM>-<Disc>-<Tag>`; Tag = `ALn`, `FUNC-...` ou `MIX-n-...`.
- Tokens “aluno/serviço”: CJ, Boccia, Natacao, SNZ (têm nº lição). Serviços puros: CA, PM, PEI, TP, APEE, DT, AP, BE, Desporto, GestPr.
