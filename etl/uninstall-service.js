// ============================================================
// Remove o serviço do vigia do Windows (caso precise reinstalar,
// mudar alguma configuração, ou desligar de vez).
// Rode como Administrador, igual o install-service.js.
// ============================================================
const path = require("path");
const { Service } = require("node-windows");

const svc = new Service({
  name: "IASD-Curicica",
  script: path.join(__dirname, "watcher.js"),
});

svc.on("uninstall", () => {
  console.log("✓ Serviço removido com sucesso.");
  console.log("  Se quiser reinstalar depois, rode: node install-service.js");
});

svc.on("error", (err) => {
  console.error("❌ Erro ao remover o serviço:", err);
});

console.log("Removendo o serviço \"" + svc.name + "\"...");
svc.uninstall();
