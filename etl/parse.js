// Mesma lógica de leitura já validada no painel HTML, portada para Node
// (para ser usada pelo vigia de pasta, fora do navegador).
const XLSX = require("xlsx");

function round2(n) { return Math.round(n * 100) / 100; }

function isDepartmentSheet(header) {
  return header.includes("DEPARTMENT CODE") && header.includes("Nome");
}
function isTreasurySheet(header) {
  return header.includes("Dados de Grupo") && header.includes("Nome da Categoria");
}
function isDespesasSheet(header) {
  return header.includes("Tipo de Despesa") && header.includes("Conferidas");
}
function isFidelidadeSheet(header) {
  return header.includes("DONOR PERSON ID") && header.includes("IS FAMILY GIVING");
}
function is7MeSheet(header) {
  return header.includes("Nome dizimista e ofertante") && header.includes("PAYMENT TYPE NAME");
}
function monthKeyFromFilename(name) {
  const m = name.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

function detectFileType(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const header = XLSX.utils.sheet_to_json(ws, { header: 1 })[0] || [];
  if (isDepartmentSheet(header)) return "department";
  if (isTreasurySheet(header)) return "treasury";
  if (isDespesasSheet(header)) return "despesas";
  if (isFidelidadeSheet(header)) return "fidelidade";
  if (is7MeSheet(header)) return "7me";
  return null;
}

function parseDepartmentFile(filePath, filename) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: 0 });
  const header = rows[0];
  if (!isDepartmentSheet(header)) return null;
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const monthKey = monthKeyFromFilename(filename);
  if (!monthKey) return { error: `Não consegui identificar o mês pelo nome "${filename}" (esperado AAAA-MM no início).` };

  const departments = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const nome = row[idx["Nome"]];
    if (!nome) continue;
    departments.push({
      nome,
      orcamento: Number(row[idx["Orçamento"]]) || 0,
      ofertaDireta: Number(row[idx["Oferta Direta"]]) || 0,
      ofertaDistribuida: Number(row[idx["Oferta Distribuída"]]) || 0,
      despesas: Number(row[idx["Despesas"]]) || 0,
      adiantamento: Number(row[idx["Adiantamento"]]) || 0,
      // Transferências entre departamentos (colunas novas do ACMS) — só exibição,
      // não entram no cálculo: o Saldo Final abaixo já vem pronto do ACMS.
      transfSaida: Number(row[idx["Transf. Saída"]]) || 0,
      transfEntrada: Number(row[idx["Transf. Entrada"]]) || 0,
      estorno: Number(row[idx["Estorno"]]) || 0,
      depositosIdentificados: Number(row[idx["Depósitos Identificados"]]) || 0,
      saldoInicial: Number(row[idx["Saldo Inicial"]]) || 0,
      saldoFinal: Number(row[idx["Saldo Final"]]) || 0,
    });
  }
  return { monthKey, departments, source: "ACMS (departamento)" };
}

function parseTreasuryFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: 0 });
  const header = rows[0];
  if (!isTreasurySheet(header)) return null;
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  let monthKey = null;
  const categoriaRows = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const periodo = row[idx["Período"]];
    if (periodo === "Total" || !periodo) continue;
    if (!monthKey) {
      const m = String(periodo).match(/(\d{4})\s*\/\s*(\d{2})/);
      if (m) monthKey = `${m[1]}-${m[2]}`;
    }
    categoriaRows.push({
      codigo: String(row[idx["Código de Categoria"]]),
      nome: row[idx["Nome da Categoria"]],
      grupo: row[idx["Dados de Grupo"]],
      valor: round2(Number(row[idx["Valor Total"]]) || 0),
      igrejaLocal: round2(Number(row[idx["Igreja Local"]]) || 0),
      sete7me: round2(Number(row[idx["ONLINE VALUE"]]) || 0),
    });
  }
  return { monthKey, categoriaRows };
}

function suggestClassification(nome, grupo) {
  if (grupo === 1) {
    const n = (nome || "").toLowerCase();
    if (n.includes("dízimo") || n.includes("dizimo")) return "excluir";
    if (n.includes("missão") || n.includes("missao") || n.includes("missionári")) return "excluir";
    if (n.includes("empréstimo") || n.includes("emprestimo")) return "excluir";
    return "entrada";
  }
  return grupo === 2 ? "saida" : "excluir";
}

function parseDespesasFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: 0 });
  const header = rows[0];
  if (!isDespesasSheet(header)) return null;
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  // Uma linha por lançamento de despesa; a data de cada linha é que diz o mês
  // (o arquivo pode ter vários meses juntos, ex.: um export acumulado do ano todo).
  // Também agrupamos por categoria (código próprio do extrato de despesas --
  // sistema de códigos diferente do resumo financeiro, não misturar os dois).
  const byMonth = {}; // monthKey -> { total, count, categorias: {...}, lancamentos: [...] }
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const dataStr = row[idx["Data"]];
    if (!dataStr) continue;
    const m = String(dataStr).match(/^(\d{2})\/(\d{2})\/(\d{4})/); // DD/MM/AAAA
    if (!m) continue;
    const monthKey = `${m[3]}-${m[2]}`;
    const valor = Number(row[idx["Valor"]]) || 0;
    const codigo = String(row[idx["Código de Categoria"]]);
    const nome = row[idx["Nome da Categoria"]];

    if (!byMonth[monthKey]) byMonth[monthKey] = { total: 0, count: 0, categorias: {}, lancamentos: [] };
    byMonth[monthKey].total += valor;
    byMonth[monthKey].count += 1;
    if (!byMonth[monthKey].categorias[codigo]) byMonth[monthKey].categorias[codigo] = { codigo, nome, valor: 0, count: 0 };
    byMonth[monthKey].categorias[codigo].valor += valor;
    byMonth[monthKey].categorias[codigo].count += 1;
    byMonth[monthKey].lancamentos.push({
      data: dataStr,
      dataDoEvento: row[idx["Data do Evento"]] || "",
      departamento: row[idx["Departamento da Igreja"]] || "",
      codigoCategoria: codigo,
      categoria: nome,
      descricao: row[idx["Descrição"]] || "",
      tipoDespesa: row[idx["Tipo de Despesa"]] || "",
      empresa: row[idx["Empresa"]] || "",
      nomeUsuario: row[idx["Nome do usuário"]] || "",
      valor: round2(valor),
    });
  }
  Object.keys(byMonth).forEach((k) => {
    byMonth[k].total = round2(byMonth[k].total);
    byMonth[k].categorias = Object.values(byMonth[k].categorias).map((c) => ({ ...c, valor: round2(c.valor) }));
  });
  return byMonth;
}

function parseFidelidadeFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: 0 });
  const header = rows[0];
  if (!isFidelidadeSheet(header)) return null;
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  // Por mês: quem deu Dízimo entra em dizimistas; quem deu qualquer outra
  // categoria (oferta) entra em ofertantes. Uma pessoa pode contar nos dois
  // grupos no mesmo mês. Usamos Set de "Código Pessoa" para nunca contar a
  // mesma pessoa duas vezes, mesmo com vários lançamentos no mês.
  const byMonth = {}; // monthKey -> { dizimistas:Set, ofertantes:Set, totalDizimo, totalOferta, categorias:{codigo:{codigo,nome,valor}} }
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const dataStr = row[idx["Data"]];
    if (!dataStr) continue;
    const m = String(dataStr).match(/^(\d{2})\/(\d{2})\/(\d{4})/); // DD/MM/AAAA
    if (!m) continue;
    const monthKey = `${m[3]}-${m[2]}`;
    const pessoa = row[idx["Código Pessoa"]];
    const codigo = String(row[idx["Código de Categoria"]]);
    const categoria = row[idx["Nome da Categoria"]];
    const valor = Number(row[idx["Valor"]]) || 0;

    if (!byMonth[monthKey]) byMonth[monthKey] = { dizimistas: new Set(), ofertantes: new Set(), totalDizimo: 0, totalOferta: 0, categorias: {} };
    const m2 = byMonth[monthKey];
    if (categoria === "Dízimo") { m2.dizimistas.add(pessoa); m2.totalDizimo += valor; }
    else { m2.ofertantes.add(pessoa); m2.totalOferta += valor; }
    if (!m2.categorias[codigo]) m2.categorias[codigo] = { codigo, nome: categoria, valor: 0 };
    m2.categorias[codigo].valor += valor;
  }

  const result = {};
  Object.keys(byMonth).forEach((k) => {
    const m2 = byMonth[k];
    const countDizimistas = m2.dizimistas.size;
    const countOfertantes = m2.ofertantes.size;
    result[k] = {
      countDizimistas,
      countOfertantes,
      totalDizimo: round2(m2.totalDizimo),
      totalOferta: round2(m2.totalOferta),
      mediaDizimo: countDizimistas ? round2(m2.totalDizimo / countDizimistas) : 0,
      mediaOferta: countOfertantes ? round2(m2.totalOferta / countOfertantes) : 0,
      categorias: Object.values(m2.categorias).map((c) => ({ ...c, valor: round2(c.valor) })),
    };
  });
  return result;
}

module.exports = {
  round2, isDepartmentSheet, isTreasurySheet, isDespesasSheet, isFidelidadeSheet, is7MeSheet, monthKeyFromFilename,
  detectFileType, parseDepartmentFile, parseTreasuryFile, parseDespesasFile, parseFidelidadeFile, suggestClassification,
};
