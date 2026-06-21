export type BoxiconName = `boxicons:${string}`;

export interface ContactResourceLink {
  label: string;
  url: string;
}

export interface UsefulContact {
  id: number;
  provider: string;
  service: string;
  phones: string[];
  emails: string[];
  urls: ContactResourceLink[];
}

export interface UsefulContactCategory {
  id: string;
  title: string;
  icon: BoxiconName;
  tone: "primary" | "secondary" | "accent" | "info" | "success" | "warning" | "error" | "neutral";
  contacts: UsefulContact[];
}
