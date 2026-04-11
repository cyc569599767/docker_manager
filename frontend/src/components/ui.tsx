import type { ReactNode } from "react";
import type { SortDirection } from "../view-utils";

const controlClassName = "rounded border border-slate-300 px-3 py-2 text-sm";

export function Input(props: { value: string; onChange: (value: string) => void; placeholder: string; className?: string }) {
  return (
    <input
      className={`${controlClassName} ${props.className || ""}`.trim()}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={props.placeholder}
    />
  );
}

export function TextAreaField(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
  className?: string;
}) {
  return (
    <textarea
      className={`${controlClassName} ${props.className || ""}`.trim()}
      value={props.value}
      rows={props.rows ?? 3}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={props.placeholder}
    />
  );
}

export function SelectField(props: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <select
      className={`${controlClassName} bg-white ${props.className || ""}`.trim()}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Th(props: { children: string }) {
  return <th className="px-3 py-2 text-left font-semibold text-slate-700">{props.children}</th>;
}

export function SortableTh(props: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onToggle: () => void;
}) {
  const arrow = props.active ? (props.direction === "asc" ? "↑" : "↓") : "↕";

  return (
    <th className="px-3 py-2 text-left font-semibold text-slate-700">
      <button type="button" className="inline-flex items-center gap-1 hover:text-blue-600" onClick={props.onToggle}>
        <span>{props.label}</span>
        <span className="text-xs">{arrow}</span>
      </button>
    </th>
  );
}

export function Td(props: { children: ReactNode }) {
  return <td className="px-3 py-2 align-top text-slate-700">{props.children}</td>;
}

export function EmptyRow(props: { colSpan: number; text: string }) {
  return (
    <tr className="border-t">
      <td colSpan={props.colSpan} className="px-3 py-6 text-center text-sm text-slate-500">
        {props.text}
      </td>
    </tr>
  );
}

export function ActionButton(props: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className={`rounded px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60 ${
        props.danger ? "bg-red-600 text-white" : "border border-slate-300 bg-white text-slate-700"
      }`}
    >
      {props.label}
    </button>
  );
}

export function PaginationBar(props: {
  page: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const canPrev = props.page > 1;
  const canNext = props.page < props.totalPages;
  const pageSizes = [10, 20, 50, 100];

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded border bg-white p-3 text-sm text-slate-700">
      <button
        type="button"
        onClick={() => canPrev && props.onPageChange(props.page - 1)}
        disabled={!canPrev}
        className="rounded border border-slate-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
      >
        上一页
      </button>
      <span>
        第 {props.page} / {props.totalPages} 页
      </span>
      <button
        type="button"
        onClick={() => canNext && props.onPageChange(props.page + 1)}
        disabled={!canNext}
        className="rounded border border-slate-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
      >
        下一页
      </button>
      <span className="ml-2 text-xs text-slate-500">共 {props.totalItems} 条</span>
      <div className="ml-auto flex items-center gap-2">
        <span>每页</span>
        <select
          className="rounded border border-slate-300 px-2 py-1"
          value={props.pageSize}
          onChange={(event) => props.onPageSizeChange(Number(event.target.value))}
        >
          {pageSizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function HighlightText(props: { text: string; query: string; fallback?: string }) {
  const raw = props.text || props.fallback || "";
  const keyword = props.query.trim();

  if (!keyword) return <>{raw}</>;

  const regex = new RegExp(`(${escapeRegExp(keyword)})`, "ig");
  const parts = raw.split(regex);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={`${part}-${index}`} className="rounded bg-yellow-200 px-0.5 text-slate-900">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  );
}
