# VestibuQuiz — envio WhatsApp

## Como usar

1. Abra o PowerShell nesta pasta:
   `cd c:\Users\wilso\Downloads\vestibuquiz-whatsapp`

2. **Teste com 1 celular** (recomendado):
   `npm run teste`

3. Escaneie o QR no celular (WhatsApp Business → Aparelhos conectados).

4. Se o teste ok, envie para todos:
   `npm start`

## Arquivos

- `escolas.csv` — lista de escolas/telefones
- `mensagem.txt` — texto (formatação WhatsApp com `*negrito*`)
- `resultado.csv` — log do que foi enviado / falhou
- `.wwebjs_auth` — sessão salva (não apague se quiser evitar novo QR)

## Aviso

A maioria dos números do CSV é **telefone fixo**. WhatsApp costuma existir só em **celular** (começando com 9 após o DDD). O script tenta todos e registra em `resultado.csv` os que não têm WhatsApp.
