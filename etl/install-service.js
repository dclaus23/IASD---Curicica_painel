// ============================================================
// Instala o vigia como um Serviço do Windows de verdade.
// Depois de rodar isso uma vez, ele liga sozinho quando o PC liga
// (mesmo antes de você fazer login), reinicia sozinho se travar,
// e roda em segundo plano sem precisar de terminal nem VS Code aberto.
//
// IMPORTANTE: rode este arquivo com o PowerShell/terminal aberto
// como ADMINISTRADOR (botão direito → "Executar como administrador").
// ============================================================
const path = require("path");
const { Service } = require("node-windows");

const svc = new Service({
  name: "IASD-Curicica",
  description: "Vigia a pasta de exportações do ACMS e sincroniza com o Supabase automaticamente.",
  script: path.join(__dirname, "watcher.js"),
  nodeOptions: [],
  // Se o processo cair por qualquer motivo, tenta de novo sozinho:
  maxRestarts: 60,
  wait: 10,       // espera 10s entre tentativas
  grow: 0.25,     // aumenta o tempo de espera a cada falha repetida
});

svc.on("install", () => {
  console.log("✓ Serviço instalado com sucesso: " + svc.name);
  console.log("  Iniciando o serviço agora...");
  svc.start();
});

svc.on("alreadyinstalled", () => {
  console.log("O serviço já estava instalado. Nada a fazer — pode iniciar/parar pelo services.msc.");
});

svc.on("start", () => {
  console.log("✓ Serviço iniciado! Ele já está rodando em segundo plano.");
  console.log("  Confira em services.msc, procurando por: " + svc.name);
  console.log("  Os logs ficam numa pasta 'daemon' aqui do lado (watcher.out.log / watcher.err.log).");
});

svc.on("error", (err) => {
  console.error("❌ Erro ao instalar/iniciar o serviço:", err);
  console.error("   Confirme que este terminal foi aberto como Administrador.");
});

console.log("Instalando o serviço \"" + svc.name + "\"...");
svc.install();
