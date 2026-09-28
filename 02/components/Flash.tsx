import type { ComponentChildren } from "preact";

interface FlashProps {
  message: string | null;
  error: string | null;
}

/** 操作結果提示。每個頁面的 message/error 欄位形狀都一樣，統一在這裡渲染。 */
export function Flash({ message, error }: FlashProps) {
  return (
    <>
      {message !== null && <div class="alert alert-ok">{message}</div>}
      {error !== null && <div class="alert alert-error">{error}</div>}
    </>
  );
}

interface PaginationProps {
  /** 不含 query 的路徑，例如 /students */
  path: string;
  page: number;
  pageCount: number;
  total: number;
  /** 目前生效的篩選條件，翻頁時要原樣帶著 */
  query: Record<string, string | number | boolean | null | undefined>;
  children?: ComponentChildren;
}

export function Pagination(
  { path, page, pageCount, total, query, children }: PaginationProps,
) {
  const link = (target: number) => {
    const params = new URLSearchParams(
      Object.entries(query)
        .filter(([, v]) =>
          v !== null && v !== undefined && v !== "" && v !== false
        )
        .map(([k, v]) => [k, String(v)]),
    );
    params.set("page", String(target));
    return `${path}?${params.toString()}`;
  };

  return (
    <div class="pagination">
      <span class="muted">
        共 {total} 筆，第 {page} / {pageCount} 頁
      </span>
      <span class="pagination-links">
        {page > 1 && <a class="btn btn-sm" href={link(page - 1)}>上一頁</a>}
        {page < pageCount && (
          <a class="btn btn-sm" href={link(page + 1)}>下一頁</a>
        )}
      </span>
      {children}
    </div>
  );
}
