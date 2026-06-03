import { db } from "@db/index";
import { supportGuides } from "@db/schema";
import { or, like, sql } from "drizzle-orm";

export interface GetSupportGuidesParams {
  page?: number;
  limit?: number;
  search?: string;
}

export async function getSupportGuides(params: GetSupportGuidesParams) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const offset = (page - 1) * limit;
  const searchFilter = params.search || "";

  const whereConditions = [];

  if (searchFilter) {
    const likeSearch = `%${searchFilter}%`;
    whereConditions.push(
      or(
        like(supportGuides.helpDeskName, likeSearch),
        like(supportGuides.invgateName, likeSearch),
        like(supportGuides.route, likeSearch),
        like(supportGuides.topics, likeSearch)
      )
    );
  }

  const whereClause =
    whereConditions.length > 0 ? whereConditions[0] : undefined; // Only one OR block

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(supportGuides)
    .where(whereClause);

  const data = await db.query.supportGuides.findMany({
    where: whereClause,
    limit: limit,
    offset: offset,
    orderBy: (guides, { asc }) => [asc(guides.helpDeskName)],
  });

  const hasMore = offset + data.length < count;

  return {
    data,
    count,
    hasMore,
  };
}
