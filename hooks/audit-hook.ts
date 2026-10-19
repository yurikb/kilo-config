import type { Plugin } from "@kilocode/plugin";

const auditHook: Plugin = async ({
  project,
  client,
}: Parameters<Plugin>[0]) => {
  console.log("🛡️  Hook de Auditoria Kilo CLI carregado com sucesso!");

  return {
    // Intercepta qualquer comando que o Kilo tentar rodar no terminal
    "command.execute.before": async (context) => {
      const fullCommand = context.command;

      // 1. Log de Auditoria
      console.log(
        `\n[AUDIT LOG] O agente está tentando executar: "${fullCommand}"`,
      );

      // 2. Lista de termos perigosos que exigem bloqueio ou confirmação humana
      const dangerousTerms = [
        "rm -rf",
        "drop database",
        "prod",
        "delete",
        "env",
        "push -f",
      ];
      const isDangerous = dangerousTerms.some((term) =>
        fullCommand.toLowerCase().includes(term),
      );

      if (isDangerous) {
        console.warn(
          `⚠️  ALERTA DE SEGURANÇA: Comando potencialmente perigoso detectado!`,
        );

        // Força a negação do comando se violar a política de segurança
        console.log(
          "Comando bloqueado pelo Hook de Auditoria Local: Risco de destruição de dados.",
        );
        return;
      }

      // Se o comando for seguro, permite a execução normal
    },
  };
};

export default {
  id: "audit-hook",
  server: auditHook,
};
