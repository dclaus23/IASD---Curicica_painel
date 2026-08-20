// ============================================================
// IASD Curicica — Vigia de Pasta
// Fica de olho na pasta de exportações do ACMS e manda os dados
// pro Supabase automaticamente, assim que um arquivo novo aparece.
// ============================================================
require("dotenv").config();
const path = require("path");
const chokidar = require("chokidar");
const { createClient } = require("@supabase/supabase-js");
const {
  detectFileType, parseDepartmentFile, parseTreasuryFile, parseDespesasFile, parseFidelidadeFile, suggestClassification, round2,
} = require("./parse");

const WATCH_FOLDER = process.env.WATCH_FOLDER;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!WATCH_FOLDER || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Faltam variáveis no arquivo .env — confira WATCH_FOLDER, SUPABASE_URL e SUPABASE_SERVICE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function log(msg) {
  const t = new Date().toLocaleString("pt-BR");
  console.log(`[${t}] ${msg}`);
}

// ---------- Helpers de leitura/escrita no Supabase ----------
async function getMonthRow(monthKey) {
  const { data, error } = await supabase.from("monthly_data").select("data").eq("month_key", monthKey).maybeSingle();
  if (error) throw error;
  return data ? data.data : {};
}
async function saveMonthRow(monthKey, dataObj) {
  const { error } = await supabase.from("monthly_data").upsert({
    month_key: monthKey, data: dataObj, updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
async function getSettings() {
  const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return {
    registry: data.category_registry || {},
    filters: data.category_filters || {},
    percentages: data.category_percentages || {},
  };
}
async function saveSettings(registry, filters) {
  const { error } = await supabase.from("app_settings").update({
    category_registry: registry, category_filters: filters, updated_at: new Date().toISOString(),
  }).eq("id", 1);
  if (error) throw error;
}

// "percentages" = quanto do valor da categoria realmente fica com a igreja local
// (ex.: Ofertas | Pacto pode ser 60% igreja / 40% Associação). Padrão 100% se não configurado.
function computeEntradaSaida(categoriaRows, filters, percentages) {
  let e = 0, s = 0;
  categoriaRows.forEach((r) => {
    const cls = filters[r.codigo] || suggestClassification(r.nome, r.grupo);
    const pct = percentages[r.codigo] ?? 100;
    if (cls === "entrada") e += r.valor * (pct / 100);
    else if (cls === "saida") s += r.valor;
  });
  return { entrada: round2(e), saida: round2(s) };
}

// ---------- Processamento de um arquivo ----------
async function processFile(filePath) {
  const filename = path.basename(filePath);
  if (!filename.toLowerCase().endsWith(".xlsx")) return;
  if (filename.startsWith("~$")) return; // arquivo temporário do Excel (aberto/editando)

  let type;
  try {
    type = detectFileType(filePath);
  } catch (err) {
    log(`⚠ Não consegui abrir "${filename}": ${err.message}`);
    return;
  }
  if (!type) {
    log(`? "${filename}" não parece ser nenhum dos formatos reconhecidos do ACMS (departamento, resumo financeiro, despesas, fidelidade, 7Me) — ignorado.`);
    return;
  }

  try {
    if (type === "department") {
      const parsed = parseDepartmentFile(filePath, filename);
      if (parsed?.error) { log(`⚠ ${parsed.error}`); return; }
      const existing = await getMonthRow(parsed.monthKey);
      existing.departments = parsed.departments;
      existing.deptSource = parsed.source;
      await saveMonthRow(parsed.monthKey, existing);
      log(`✓ Departamentos de ${parsed.monthKey} atualizados (${parsed.departments.length} departamentos) — de "${filename}"`);
    } else if (type === "treasury") {
      const parsed = parseTreasuryFile(filePath);
      if (!parsed?.monthKey) { log(`⚠ Não consegui identificar o mês em "${filename}".`); return; }

      const { registry, filters, percentages } = await getSettings();
      let changed = false;
      parsed.categoriaRows.forEach((r) => {
        if (!registry[r.codigo]) { registry[r.codigo] = { codigo: r.codigo, nome: r.nome, grupoOriginal: r.grupo }; changed = true; }
        if (filters[r.codigo] === undefined) { filters[r.codigo] = suggestClassification(r.nome, r.grupo); changed = true; }
      });
      if (changed) await saveSettings(registry, filters);

      const { entrada, saida } = computeEntradaSaida(parsed.categoriaRows, filters, percentages);
      const existing = await getMonthRow(parsed.monthKey);
      existing.categoriaRows = parsed.categoriaRows;
      existing.entrada = entrada;
      existing.saida = saida;
      existing.source = "ACMS (resumo tesouraria, categorias filtradas)";
      await saveMonthRow(parsed.monthKey, existing);
      log(`✓ Resumo financeiro de ${parsed.monthKey} atualizado — Entradas R$ ${entrada.toFixed(2)} · Saídas R$ ${saida.toFixed(2)} — de "${filename}"`);

      if (existing.despesasConferencia !== undefined) {
        const diff = round2(saida - existing.despesasConferencia);
        if (Math.abs(diff) < 0.05) log(`✓ Saídas de ${parsed.monthKey} conferem com o extrato de despesas.`);
        else log(`⚠ Saídas de ${parsed.monthKey}: resumo financeiro tem R$ ${saida.toFixed(2)}, mas o extrato de despesas soma R$ ${existing.despesasConferencia.toFixed(2)} — diferença de R$ ${diff.toFixed(2)}. Vale conferir.`);
      }
    } else if (type === "despesas") {
      const byMonth = parseDespesasFile(filePath);
      if (!byMonth || Object.keys(byMonth).length === 0) { log(`⚠ Não encontrei lançamentos com data válida em "${filename}".`); return; }

      for (const monthKey of Object.keys(byMonth)) {
        const { total, count, categorias, lancamentos } = byMonth[monthKey];
        const existing = await getMonthRow(monthKey);
        existing.despesasConferencia = total;
        existing.despesasConferenciaCount = count;
        existing.despesasCategorias = categorias;
        existing.despesasLancamentos = lancamentos;
        await saveMonthRow(monthKey, existing);

        if (existing.saida !== undefined) {
          const diff = round2(existing.saida - total);
          if (Math.abs(diff) < 0.05) {
            log(`✓ Despesas de ${monthKey} conferem com o resumo financeiro (R$ ${total.toFixed(2)}, ${count} lançamentos) — de "${filename}"`);
          } else {
            log(`⚠ Despesas de ${monthKey}: extrato soma R$ ${total.toFixed(2)} (${count} lançamentos), mas o resumo financeiro tem Saídas de R$ ${existing.saida.toFixed(2)} — diferença de R$ ${diff.toFixed(2)}. Vale conferir.`);
          }
        } else {
          log(`✓ Despesas de ${monthKey} registradas (R$ ${total.toFixed(2)}, ${count} lançamentos) — ainda sem resumo financeiro desse mês pra comparar — de "${filename}"`);
        }
      }
    } else if (type === "fidelidade") {
      const byMonth = parseFidelidadeFile(filePath);
      if (!byMonth || Object.keys(byMonth).length === 0) { log(`⚠ Não encontrei lançamentos com data válida em "${filename}".`); return; }

      for (const monthKey of Object.keys(byMonth)) {
        const stats = byMonth[monthKey];
        const existing = await getMonthRow(monthKey);
        existing.doadores = stats;
        await saveMonthRow(monthKey, existing);
        log(`✓ Doadores de ${monthKey} atualizados — ${stats.countDizimistas} dizimistas (média R$ ${stats.mediaDizimo.toFixed(2)}) · ${stats.countOfertantes} ofertantes (média R$ ${stats.mediaOferta.toFixed(2)}) — de "${filename}"`);
      }
    } else if (type === "7me") {
      log(`ℹ "${filename}" é o extrato de pagamentos digitais (7Me) — reconhecido, mas não processado separadamente, pois esses lançamentos já vêm inclusos no arquivo de Fidelidade.`);
    }
  } catch (err) {
    log(`❌ Erro ao processar "${filename}": ${err.message}`);
  }
}

// ---------- Início ----------
log(`👀 Vigiando a pasta: ${WATCH_FOLDER}`);
log("   (deixe esta janela aberta em segundo plano — ela roda sozinha quando você loga no Windows, se configurar a tarefa agendada)");

const watcher = chokidar.watch(WATCH_FOLDER, {
  ignoreInitial: false, // processa os arquivos que já estão na pasta ao iniciar
  awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 }, // espera o arquivo terminar de ser copiado/salvo
  depth: 2,
});

watcher.on("add", processFile);
watcher.on("change", processFile);
watcher.on("error", (err) => log(`❌ Erro no vigia: ${err.message}`));
