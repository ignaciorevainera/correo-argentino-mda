import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * Cifra texto utilizando AES-256-GCM.
 * Retorna el string con el formato: iv_hex:tag_hex:encrypted_hex
 */
export function encryptData(text: string): string {
  if (!text) return "";
  const masterKey = process.env.ENCRYPTION_MASTER_KEY || "dev_key_must_be_configured_in_env";
  
  // Deriva una clave de 32 bytes usando SHA-256
  const key = crypto.createHash("sha256").update(masterKey).digest();
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag().toString("hex");
  
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Descifra un texto cifrado con el formato iv_hex:tag_hex:encrypted_hex usando AES-256-GCM.
 */
export function decryptData(encryptedText: string): string {
  if (!encryptedText) return "";
  
  const parts = encryptedText.split(":");
  if (parts.length !== 3) {
    // Si no tiene el formato iv:tag:data, asumimos que es texto plano (graceful degradation)
    return encryptedText;
  }
  
  const [ivHex, tagHex, encryptedHex] = parts;
  if (!ivHex || !tagHex || !encryptedHex) {
    return encryptedText;
  }
  
  try {
    const masterKey = process.env.ENCRYPTION_MASTER_KEY || "dev_key_must_be_configured_in_env";
    const key = crypto.createHash("sha256").update(masterKey).digest();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(tagHex, "hex");
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(Buffer.from(encryptedHex, "hex"), undefined, "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch (error: any) {
    console.error(`[Decryption Error] No se pudo descifrar el texto: ${error.message}`);
    return encryptedText; // Retorna el texto original en caso de error
  }
}

// Alias para compatibilidad con código existente
export const encrypt = encryptData;
export const decrypt = decryptData;
