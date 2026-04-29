export type BoxiconName = `boxicons:${string}`;

export interface ContactResourceLink {
  label: string;
  url: string;
}

export interface UsefulContact {
  id: string;
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
  tone: "primary" | "secondary" | "accent" | "info" | "success" | "warning";
  contacts: UsefulContact[];
}
