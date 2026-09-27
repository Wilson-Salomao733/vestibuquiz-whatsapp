const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

const ROOT = __dirname;
const CSV_PATH = path.join(ROOT, 'escolas.csv');
const MSG_PATH = path.join(ROOT, 'mensagem.txt');
const LOG_PATH = path.join(ROOT, 'resultado.csv');

// Intervalo entre envios (ms). Não reduza abaixo de 5s.
const DELAY_MS = 10000;
// Modo teste: envia só para os N primeiros com WhatsApp
const TESTE = process.argv.includes('--teste');
const TESTE_LIMITE = 1;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function apenasDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function normalizarTelefone(telefone) {
  let digits = apenasDigitos(telefone);
  if (!digits) return null;
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function pareceCelular(digits) {
  // BR: DDI 55 + DDD (2) + 9 + 8 dígitos = 13 dígitos, e o 3º dígito após DDD é 9
  if (!digits || digits.length < 12) return false;
  const local = digits.startsWith('55') ? digits.slice(2) : digits;
  if (local.length === 11) return local[2] === '9';
  return false;
}

function carregarEscolas() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  return rows
    .map((row) => {
      const telefone = normalizarTelefone(row.Telefone);
      return {
        cidade: row.Cidade || '',
        escola: row.Escola || '',
        telefoneOriginal: row.Telefone || '',
        telefone,
        celular: pareceCelular(telefone),
      };
    })
    .filter((r) => r.telefone);
}

function montarMensagem(template, escola) {
  // Personaliza a abertura com o nome da escola
  const abertura = `🎓 *Olá, ${escola}! Somos o VestibuQuiz!*`;
  if (template.startsWith('🎓')) {
    return template.replace(/^🎓 \*Olá! Somos o VestibuQuiz!\*/, abertura);
  }
  return `${abertura}\n\n${template}`;
}

function appendLog(linha) {
  const header = 'timestamp,escola,telefone,status,detalhe\n';
  if (!fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, header, 'utf8');
  fs.appendFileSync(LOG_PATH, linha + '\n', 'utf8');
}

async function main() {
  const template = fs.readFileSync(MSG_PATH, 'utf8').trim();
  let escolas = carregarEscolas();

  const fixos = escolas.filter((e) => !e.celular);
  const celulares = escolas.filter((e) => e.celular);

  console.log(`Total no CSV: ${escolas.length}`);
  console.log(`Prováveis celulares (WhatsApp): ${celulares.length}`);
  console.log(`Prováveis fixos (provavelmente sem WhatsApp): ${fixos.length}`);
  if (fixos.length) {
    console.log('\nFixos que serão tentados mesmo assim (muitos vão falhar):');
    for (const e of fixos) console.log(`  - ${e.escola} (${e.telefoneOriginal})`);
  }

  if (TESTE) {
    escolas = celulares.slice(0, TESTE_LIMITE);
    console.log(`\nMODO TESTE: enviando só para ${escolas.length} número(s) celular.`);
  } else {
    console.log('\nEnviando para TODOS os números do CSV (celular + fixo).');
    console.log('Dica: rode primeiro com npm run teste');
  }

  console.log('\nAguarde o QR Code...\n');

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(ROOT, '.wwebjs_auth') }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', (qr) => {
    console.log('Escaneie este QR no WhatsApp Business → Aparelhos conectados:\n');
    qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => console.log('Autenticado.'));
  client.on('auth_failure', (msg) => console.error('Falha na autenticação:', msg));

  client.on('ready', async () => {
    console.log('WhatsApp conectado. Iniciando envios...\n');

    for (const item of escolas) {
      const chatId = `${item.telefone}@c.us`;
      const mensagem = montarMensagem(template, item.escola);
      const agora = new Date().toISOString();

      try {
        const registrado = await client.isRegisteredUser(chatId);
        if (!registrado) {
          console.log(`⏭  Sem WhatsApp: ${item.escola} (${item.telefoneOriginal})`);
          appendLog(
            `${agora},"${item.escola.replace(/"/g, '""')}",${item.telefone},sem_whatsapp,`
          );
          continue;
        }

        await client.sendMessage(chatId, mensagem);
        console.log(`✅ Enviado: ${item.escola} (${item.telefoneOriginal})`);
        appendLog(
          `${agora},"${item.escola.replace(/"/g, '""')}",${item.telefone},enviado,`
        );
      } catch (err) {
        console.log(`❌ Erro: ${item.escola} — ${err.message}`);
        appendLog(
          `${agora},"${item.escola.replace(/"/g, '""')}",${item.telefone},erro,"${String(err.message).replace(/"/g, '""')}"`
        );
      }

      await sleep(DELAY_MS);
    }

    console.log(`\nFinalizado. Log em: ${LOG_PATH}`);
    await client.destroy();
    process.exit(0);
  });

  client.initialize();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
