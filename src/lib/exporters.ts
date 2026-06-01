export function downloadCsv(filename: string, rows: Record<string, unknown>[]): void {
  if (!rows.length) {
    return
  }

  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  const csv = [
    columns.join(','),
    ...rows.map((row) =>
      columns
        .map((column) => {
          const value = String(row[column] ?? '')
          return `"${value.replaceAll('"', '""')}"`
        })
        .join(','),
    ),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
