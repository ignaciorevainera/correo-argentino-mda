import { db } from "@db/index";
import { supportGuides } from "@db/schema";
import { sql } from "drizzle-orm";

export type SupportGuideSortKey = "legacy" | "invgate";
export type SortOrder = "asc" | "desc";

const guideSortColumns: Record<SupportGuideSortKey, any> = {
  legacy: supportGuides.legacyName,
  invgate: supportGuides.invgateName,
};

export interface GetSupportGuidesParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: SupportGuideSortKey;
  sortOrder?: SortOrder;
}

export async function getSupportGuides(params: GetSupportGuidesParams) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const offset = (page - 1) * limit;
  const searchFilter = params.search || "";

  const whereConditions = [];

  if (searchFilter) {
    const normalizedSearch = searchFilter.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const ftsSearch = `"${normalizedSearch}"`;
    whereConditions.push(
      sql`${supportGuides.id} IN (SELECT rowid FROM support_guides_fts WHERE searchable_text MATCH ${ftsSearch})`
    );
  }

  const whereClause =
    whereConditions.length > 0 ? whereConditions[0] : undefined; // Only one OR block

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(supportGuides)
    .where(whereClause);

  const sortKey = params.sortBy;
  const sortOrderVal = params.sortOrder ?? "asc";

  const data = await db.query.supportGuides.findMany({
    where: whereClause,
    limit: limit,
    offset: offset,
    orderBy: (guides, { asc: ascFn, desc: descFn }) => {
      const orderFn = sortOrderVal === "desc" ? descFn : ascFn;
      if (sortKey && guideSortColumns[sortKey]) {
        return [orderFn(guideSortColumns[sortKey])];
      }
      return [ascFn(guides.helpDeskName)];
    },
  });

  const hasMore = offset + data.length < count;

  return {
    data,
    count,
    hasMore,
  };
}
