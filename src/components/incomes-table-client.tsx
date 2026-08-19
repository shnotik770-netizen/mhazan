"use client";

import { DeleteIncomeButton } from "@/components/delete-income-button";
import { IncomeDepartmentEditor } from "@/components/income-department-editor";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;

export type StandingOrderRow = {
  orderRef: string;
  donorName: string | null;
  categoryName: string | null;
  amount: number;
  date: string;
  current: number | null;
  total: number | null;
};

export function StandingOrdersTable({ orders }: { orders: StandingOrderRow[] }) {
  const columns: ColumnDef<StandingOrderRow>[] = [
    { key: "orderRef", label: "מס׳ הוראה", sortValue: (o) => o.orderRef, filterValue: (o) => o.orderRef },
    { key: "donor", label: "שם תורם", sortValue: (o) => o.donorName ?? "", filterValue: (o) => o.donorName ?? "—" },
    { key: "category", label: "קטגוריה", sortValue: (o) => o.categoryName ?? "", filterValue: (o) => o.categoryName ?? "—" },
    { key: "amount", label: "סכום אחרון", sortValue: (o) => o.amount },
    { key: "date", label: "תשלום אחרון", sortValue: (o) => o.date },
    {
      key: "remaining",
      label: "תשלומים שנותרו",
      sortValue: (o) => (o.current != null && o.total != null ? o.total - o.current : null),
    },
  ];
  const { rows: sorted, sort, toggleSort, filters, setColumnFilter } = useSortFilter(orders, columns);

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <SortFilterTh
              key={col.key}
              col={col}
              allRows={orders}
              sort={sort}
              toggleSort={toggleSort}
              activeFilter={filters[col.key]}
              setColumnFilter={setColumnFilter}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((o) => {
          const remaining = o.current != null && o.total != null ? o.total - o.current : null;
          return (
            <tr key={o.orderRef}>
              <td>{o.orderRef}</td>
              <td>{o.donorName ?? "—"}</td>
              <td>{o.categoryName ?? "—"}</td>
              <td>{formatCurrency(o.amount)}</td>
              <td>
                {formatDate(o.date)}
                {o.current != null && o.total != null ? ` (${o.current}/${o.total})` : ""}
              </td>
              <td>
                {remaining == null ? (
                  <span className="text-muted">לא ידוע</span>
                ) : remaining <= 1 ? (
                  <span className="badge bg-warning-bg text-warning">{remaining} — עומדת להסתיים</span>
                ) : (
                  remaining
                )}
              </td>
            </tr>
          );
        })}
        {sorted.length === 0 && (
          <tr>
            <td colSpan={6} className="text-center text-muted py-4">
              אין תוצאות
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export type IncomeRow = {
  id: string;
  date: string;
  amount: number;
  donor_name: string | null;
  receipt_number: string | null;
  order_ref: string | null;
  payment_method: string | null;
  installment_current: number | null;
  installment_total: number | null;
  requires_inter_settlement: boolean;
  owner_department_id: string | null;
  categoryName: string | null;
  bankLabel: string | null;
  ownerName: string | null;
  issuerName: string | null;
};

export function IncomesTable({
  rows,
  isAdmin,
  departments,
}: {
  rows: IncomeRow[];
  isAdmin: boolean;
  departments: Department[];
}) {
  const columns: ColumnDef<IncomeRow>[] = [
    { key: "date", label: "תאריך", sortValue: (r) => r.date },
    { key: "category", label: "קטגוריה", sortValue: (r) => r.categoryName ?? "", filterValue: (r) => r.categoryName ?? "—" },
    { key: "donor", label: "שם תורם", sortValue: (r) => r.donor_name ?? "", filterValue: (r) => r.donor_name ?? "—" },
    { key: "amount", label: "סכום", sortValue: (r) => r.amount },
    { key: "payment_method", label: "מקור", sortValue: (r) => r.payment_method ?? "", filterValue: (r) => r.payment_method ?? "—" },
    {
      key: "installments",
      label: "סוג",
      sortValue: (r) => (r.installment_current && r.installment_total ? r.installment_current : null),
    },
    { key: "bank", label: "חשבון בנק", sortValue: (r) => r.bankLabel ?? "" },
    { key: "owner", label: "מחלקה בעלים", sortValue: (r) => r.ownerName ?? "", filterValue: (r) => r.ownerName ?? "—" },
    { key: "issuer", label: "מחלקה מנפיקה", sortValue: (r) => r.issuerName ?? "", filterValue: (r) => r.issuerName ?? "—" },
    {
      key: "settlement",
      label: "התחשבנות",
      sortValue: (r) => (r.requires_inter_settlement ? 1 : 0),
      filterValue: (r) => (r.requires_inter_settlement ? "חוב פנימי" : "ישיר"),
    },
    { key: "receipt", label: "מס׳ קבלה", sortValue: (r) => r.receipt_number ?? "" },
    { key: "order_ref", label: "מס׳ הוראה", sortValue: (r) => r.order_ref ?? "" },
  ];
  const { rows: sorted, sort, toggleSort, filters, setColumnFilter } = useSortFilter(rows, columns);

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <SortFilterTh
              key={col.key}
              col={col}
              allRows={rows}
              sort={sort}
              toggleSort={toggleSort}
              activeFilter={filters[col.key]}
              setColumnFilter={setColumnFilter}
            />
          ))}
          {isAdmin && <th></th>}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={row.id}>
            <td>{formatDate(row.date)}</td>
            <td>{row.categoryName}</td>
            <td>{row.donor_name ?? "—"}</td>
            <td>{formatCurrency(Number(row.amount))}</td>
            <td>{row.payment_method ?? "—"}</td>
            <td>
              {row.installment_current && row.installment_total ? `${row.installment_current}/${row.installment_total}` : "—"}
            </td>
            <td>{row.bankLabel}</td>
            <td>
              {row.ownerName}
              {isAdmin && (
                <div>
                  <IncomeDepartmentEditor
                    incomeId={row.id}
                    amount={Number(row.amount)}
                    currentDepartmentId={row.owner_department_id}
                    departments={departments}
                  />
                </div>
              )}
            </td>
            <td>{row.issuerName}</td>
            <td>
              {row.requires_inter_settlement ? (
                <span className="badge bg-warning-bg text-warning">חוב פנימי</span>
              ) : (
                <span className="badge bg-success-bg text-success">ישיר</span>
              )}
            </td>
            <td>{row.receipt_number ?? "—"}</td>
            <td>{row.order_ref ?? "—"}</td>
            {isAdmin && (
              <td>
                <DeleteIncomeButton incomeId={row.id} label={row.donor_name ?? row.categoryName ?? ""} />
              </td>
            )}
          </tr>
        ))}
        {sorted.length === 0 && (
          <tr>
            <td colSpan={isAdmin ? 13 : 12} className="text-center text-muted py-6">
              {rows.length === 0 ? "אין הכנסות רשומות עדיין" : "אין תוצאות"}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
