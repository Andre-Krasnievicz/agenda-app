/**
 * Stub de autenticação. Fora do MVP (ver seção 11.2 do plano), mas todo
 * service já lê o "dono" dos dados por aqui — quando o better-auth entrar,
 * troca-se só o corpo desta função para ler a sessão real.
 */
export async function getCurrentOwnerId(): Promise<string> {
  return "owner-default";
}
