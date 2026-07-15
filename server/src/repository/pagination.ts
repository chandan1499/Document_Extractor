import { DocumentFilters, PaginatedResult } from "../types.js";

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export function parsePagination(filters: DocumentFilters): {
  page: number;
  limit: number;
} {
  const page = Math.max(
    1,
    parseInt(String(filters.page ?? DEFAULT_PAGE), 10) || DEFAULT_PAGE
  );
  let limit =
    parseInt(String(filters.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
  limit = Math.min(Math.max(1, limit), MAX_LIMIT);
  return { page, limit };
}

export function paginateArray<T>(
  items: T[],
  page: number,
  limit: number
): PaginatedResult<T> {
  const total = items.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    total,
    page,
    limit,
    totalPages,
  };
}

export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResult<T> {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return { items, total, page, limit, totalPages };
}
