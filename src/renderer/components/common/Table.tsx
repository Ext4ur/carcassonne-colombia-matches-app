import { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T, index?: number) => ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
  emptyMessage?: string;
  className?: string;
}

export default function Table<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'No hay datos disponibles',
  className = '',
}: TableProps<T>) {
  if (data.length === 0) {
    return (
      <div className={`card ${className}`}>
        <p className="text-center text-gray-500 dark:text-gray-400 py-8">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider ${column.className || ''}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
          {data.map((item, index) => (
            <tr 
              key={keyExtractor(item)} 
              className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-750'
              }`}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-6 py-4 text-sm text-gray-900 dark:text-gray-100 ${column.className || ''} ${
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
  );
}

