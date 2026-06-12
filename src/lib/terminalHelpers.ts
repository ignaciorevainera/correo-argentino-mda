export type OsFamily = "windows" | "linux" | "legacy";

export const toOsFamily = (osName: string): OsFamily => {
  const normalized = osName.toLowerCase();
  if (
    normalized.includes("ubuntu") ||
    normalized.includes("linux") ||
    normalized.includes("debian")
  )
    return "linux";
  if (normalized.includes("windows")) return "windows";
  return "legacy";
};

export const getTerminalColorClass = (
  osName: string,
  isTelegrafia: boolean,
): string => {
  const osLower = (osName || "").toLowerCase().trim();

  if (
    osLower.includes("ubuntu") ||
    osLower.includes("debian") ||
    osLower === "ubuntu" ||
    osLower === "debian"
  ) {
    if (isTelegrafia) {
      return "border-success/30 bg-success/15 text-success";
    }
    return "border-error/30 bg-error/15 text-error";
  }

  if (osLower.includes("windows 10") || osLower === "win10") {
    return "border-sky-500/30 bg-sky-500/15 text-sky-500 dark:text-sky-400";
  }

  if (osLower.includes("windows 11") || osLower === "win11") {
    return "border-blue-500/30 bg-blue-500/15 text-blue-600 dark:text-blue-400";
  }

  if (
    osLower.includes("windows server") ||
    osLower === "winserver"
  ) {
    return "border-blue-900/30 bg-blue-900/15 text-blue-900 dark:text-blue-300";
  }

  const osFamily = toOsFamily(osName);
  const tones: Record<OsFamily, string> = {
    windows: "border-info/30 bg-info/15 text-info",
    linux: "border-success/30 bg-success/15 text-success",
    legacy: "border-warning/30 bg-warning/15 text-warning",
  };

  return tones[osFamily];
};

export const getTerminalTypeLabel = (osName: string): string => {
  const normalized = (osName || "").toLowerCase().trim();
  if (normalized.includes("windows 11") || normalized === "win11") return "Windows 11";
  if (normalized.includes("windows 10") || normalized === "win10") return "Windows 10";
  if (normalized.includes("windows 7") || normalized === "win7") return "Windows 7";
  if (normalized.includes("windows xp") || normalized === "winxp") return "Windows XP";
  if (normalized.includes("windows server") || normalized === "winserver") return "Windows Server";
  if (normalized.includes("ubuntu") || normalized === "ubuntu") return "Ubuntu";
  if (normalized.includes("debian") || normalized === "debian") return "Debian";

  if (normalized.includes("windows")) return "Windows";
  if (normalized.includes("linux")) return "Linux";
  return osName || "Terminal";
};
