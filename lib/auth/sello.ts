// Hash SHA-256 de la clave, en hexadecimal.
export async function sellar(clave: string): Promise<string> {
  const bytes = new TextEncoder().encode(clave);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
