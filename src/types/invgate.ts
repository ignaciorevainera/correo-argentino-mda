export interface InvgateApiResponse<T> {
  data: T;
  status: number;
  ok: true;
}

export interface InvgateApiError {
  message: string;
  status: number;
  ok: false;
}

export type InvgateResult<T> = InvgateApiResponse<T> | InvgateApiError;

export interface InvgateIncident {
  id: number;
  number: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  urgency: string;
  category: string | null;
  subcategory: string | null;
  assigned_to: string | null;
  requester: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
}

export interface InvgatePagination {
  current_page: number;
  per_page: number;
  total_pages: number;
  total_entries: number;
}

export interface InvgateIncidentsResponse {
  data: InvgateIncident[];
  pagination: InvgatePagination;
}
