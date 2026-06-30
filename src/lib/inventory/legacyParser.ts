export interface TerminalRecord {
  hostname: string;
  macAddress: string | null;
  ipAddress: string | null;
  operatingSystem: string | null;
  osArchitecture: string | null;
  ram: string | null;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  nis: string | null;
  nis2: string | null;
  lastContact: string | null;
}

export function mapRecord(raw: Record<string, unknown>, validNisSet: Set<string>): TerminalRecord | null {
  const rawHostname =
    typeof raw.hostname === "string" ? raw.hostname : String(raw.hostname ?? "");
  
  const hostname = rawHostname.replace(/<[^>]+>/g, "").trim();

  if (!hostname) return null;

  const str = (key: string, altKey?: string): string | null => {
    let val = raw[key];
    if (val === undefined && altKey) {
      val = raw[altKey];
    }
    if (typeof val === "number") return String(val).trim();
    if (typeof val !== "string") return null;
    const trimmed = val.trim();
    return trimmed === "" ? null : trimmed;
  };

  let mappedNis = str("nis");
  if (mappedNis && !validNisSet.has(mappedNis)) {
    mappedNis = null;
  }

  return {
    hostname,
    macAddress: str("mac", "macAddress"),
    ipAddress: str("IP", "ipAddress"),
    operatingSystem: str("os_details", "operatingSystem"),
    osArchitecture: str("os_arch", "osArchitecture"),
    ram: str("capacity", "ram"),
    serialNumber: str("serial", "serialNumber"),
    manufacturer: str("manufacturer"),
    model: str("model"),
    nis: mappedNis,
    nis2: str("nis2"),
    lastContact: str("TimeStamp", "lastContact"),
  };
}

export function parseJsonPayload(data: unknown, validNisSet: Set<string>): TerminalRecord[] {
  let payload = data;

  if (data && typeof data === "object" && "data" in data) {
    payload = (data as Record<string, unknown>).data;
  }

  if (!Array.isArray(payload)) {
    throw new Error("El JSON no contiene un array de registros.");
  }

  const records: TerminalRecord[] = [];

  for (const entry of payload) {
    if (entry && typeof entry === "object") {
      const record = mapRecord(entry as Record<string, unknown>, validNisSet);
      if (record) {
        records.push(record);
      }
    }
  }

  return records;
}
