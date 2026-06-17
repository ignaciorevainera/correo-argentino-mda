export type BoxiconName = `boxicons:${string}`;

export type CategoryTone =
  | "primary"
  | "secondary"
  | "accent"
  | "neutral"
  | "success"
  | "info"
  | "warning"
  | "error";

export interface LinkAlternative {
  id: string;
  title: string;
  url: string;
  subtitle?: string;
  description?: string;
}

export interface ImportantLink {
  id: string;
  title: string;
  url: string;
  subtitle?: string;
  description?: string;
  alternatives?: LinkAlternative[];
  iconPath?: string;
  deprecated?: boolean;
}

export interface RawLinkCategory {
  id: string;
  title: string;
  iconName: BoxiconName;
  links: ImportantLink[];
}

export interface CategoryViewModel {
  id: string;
  category: string;
  icon: BoxiconName;
  tone: CategoryTone;
  links: ImportantLink[];
}
