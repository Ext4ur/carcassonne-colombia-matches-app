/* eslint-disable @typescript-eslint/no-explicit-any */

import { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T, index?: number) => ReactNode;
  className?: string;
  /** Optional width (e.g. "8%"). Columns without width share the remaining space. */
  width?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
  emptyMessage?: string;
  className?: string;
  /** When true, header stays fixed and only the body scrolls (scrollbar appears only next to tbody). */
  scrollableBody?: boolean;
}

function getColWidthStyle<T>(columns: Column<T>[], column: Column<T>): string {
  if (column.width) return column.width;
  const withWidth = columns.filter((c) => c.width);
  const fixedTotal = withWidth.reduce(
    (s, c) => s + parseFloat(String(c.width).replace('%', '')),
    0
  );
  const autoCount = columns.length - withWidth.length;
  const autoPercent = autoCount > 0 ? (100 - fixedTotal) / autoCount : 0;
  return `${autoPercent}%`;
}

function TableHeader<T extends Record<string, any>>({ columns }: { columns: Column<T>[] }) {
  return (
    <table className="min-w-full table-fixed border-collapse">
      <colgroup>
        {columns.map((col) => (
          <col key={col.key} style={{ width: getColWidthStyle(columns, col) }} />
        ))}
      </colgroup>
      <thead className="bg-gray-50 dark:bg-gray-800">
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className={`px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 ${column.className || ''}`}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
    </table>
  );
}

export default function Table<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'No hay datos disponibles',
  className = '',
  scrollableBody = false,
}: TableProps<T>) {
  if (data.length === 0) {
    return (
      <div className={`card ${className}`}>
        <p className="text-center text-gray-500 dark:text-gray-400 py-8">{emptyMessage}</p>
      </div>
    );
  }

  const tableContent = (
    <>
      <table className="min-w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700 border-collapse">
        <colgroup>
          {columns.map((col) => (
            <col key={col.key} style={{ width: getColWidthStyle(columns, col) }} />
          ))}
        </colgroup>
        <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider ${column.className || ''}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
          {data.map((item, index) => (
            <tr
              key={keyExtractor(item)}
              className={`hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                index % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800'
              }`}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-3 py-2 text-sm text-gray-900 dark:text-gray-100 ${column.className || ''} ${
                    column.className?.includes('whitespace-nowrap') ? '' : 'whitespace-normal'
                  }`}
                >
                  {column.render ? column.render(item, index) : item[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );

  if (scrollableBody) {
    return (
      <div className={`flex flex-col min-h-0 flex-1 overflow-x-auto ${className}`}>
        <div className="flex-none">
          <TableHeader columns={columns} />
        </div>
        <div className="flex-1 min-h-0 overflow-auto overflow-x-auto">
          <table className="min-w-full table-fixed border-collapse">
            <colgroup>
              {columns.map((col) => (
                <col key={col.key} style={{ width: getColWidthStyle(columns, col) }} />
              ))}
            </colgroup>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {data.map((item, index) => (
                <tr
                  key={keyExtractor(item)}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                    index % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800'
                  }`}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-3 py-2 text-sm text-gray-900 dark:text-gray-100 ${column.className || ''} ${
                        column.className?.includes('whitespace-nowrap') ? '' : 'whitespace-normal'
                      }`}
                    >
                      {column.render ? column.render(item, index) : item[column.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return <div className={`overflow-x-auto ${className}`}>{tableContent}</div>;
}
