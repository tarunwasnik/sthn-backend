//backend/src/utils/adminResponse.ts


type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
};

type AdminResponseOptions<T> = {
  data: T;
  pagination?: PaginationMeta;
};

export const adminResponse = <T>(options: AdminResponseOptions<T>) => {
  const meta: any = {
    generatedAt: new Date().toISOString()
  };

  if (options.pagination) {
    const { page, limit, total } = options.pagination;
    meta.page = page;
    meta.limit = limit;
    meta.total = total;
    meta.hasNextPage = page * limit < total;
  }

  return {
    data: options.data,
    meta
  };
};