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
  title: string;
  description: string;
  pretty_id: string;
  category_id: number | null;
  priority_id: number;
  status_id: number;
  type_id: number;
  source_id: number;
  user_id: number;
  creator_id: number;
  assigned_id: number | null;
  assigned_group_id: number | null;
  location_id: number | null;
  process_id: number | null;
  date_ocurred: number | null;
  created_at: number;
  last_update: number;
  solved_at: number | null;
  closed_at: number | null;
  closed_reason: string | null;
  data_cleaned: string | null;
  rating: string | null;
  attachments: unknown[];
  sla_incident_resolution: string | null;
  sla_incident_first_reply: string | null;
  custom_fields: unknown[];
  request_customer_sentiment_initial: string;
  request_customer_sentiment_current: string;
}

export interface InvgateByStatusResponse {
  status: string;
  info: string;
  requestIds: number[];
  limit: number | null;
  offset: number;
  total: number;
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
