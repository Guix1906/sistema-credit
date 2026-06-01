import type { DashboardChartPoint, DashboardPeriod } from '../../services/dashboard-service'

const filters: Array<{ label: string; value: DashboardPeriod }> = [
  { label: '12 meses', value: '12m' },
  { label: 'Mes atual', value: 'month' },
  { label: '30 dias', value: '30d' },
]

export function DashboardMainChart({ data, period, onPeriodChange }: { data: DashboardChartPoint[]; period: DashboardPeriod; onPeriodChange: (period: DashboardPeriod) => void }) {
  const paths = buildChartPaths(data)
  return (
    <section className="dashboard-panel dashboard-chart-card">
      <header className="dashboard-panel-header">
        <div><span className="dashboard-eyebrow">Evolucao</span><h2>Fluxo de recebimentos</h2></div>
        <div className="dashboard-chart-filters">
          {filters.map((filter) => <button className={period === filter.value ? 'active' : ''} key={filter.value} onClick={() => onPeriodChange(filter.value)} type="button">{filter.label}</button>)}
        </div>
      </header>
      <div className="dashboard-chart-legend"><span><i className="legend-received" />Recebido</span><span><i className="legend-expected" />Previsto</span></div>
      {paths.hasData ? (
        <div className="dashboard-chart">
          <svg aria-label="Grafico de recebimentos recebidos e previstos" preserveAspectRatio="none" role="img" viewBox="0 0 720 260">
            {[40, 95, 150, 205].map((y) => <line className="chart-grid-line" key={y} x1="0" x2="720" y1={y} y2={y} />)}
            <polyline className="chart-expected-line" fill="none" points={paths.expected} />
            <polyline className="chart-received-line" fill="none" points={paths.received} />
          </svg>
          <div className="dashboard-chart-labels" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>{data.map((point, index) => <span key={`${point.label}-${index}`}>{index % Math.max(1, Math.ceil(data.length / 8)) === 0 ? point.label : ''}</span>)}</div>
        </div>
      ) : <DashboardEmpty message="Os valores aparecerao aqui assim que houver parcelas ou pagamentos." />}
    </section>
  )
}

function buildChartPaths(data: DashboardChartPoint[]) {
  const maximum = Math.max(0, ...data.flatMap((point) => [point.expected, point.received]))
  const width = 720
  const height = 230
  const toPoints = (selector: (point: DashboardChartPoint) => number) => data.map((point, index) => {
    const x = data.length === 1 ? width / 2 : (index / (data.length - 1)) * width
    const y = height - (selector(point) / maximum) * 190
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return { hasData: maximum > 0, expected: maximum ? toPoints((point) => point.expected) : '', received: maximum ? toPoints((point) => point.received) : '' }
}

export function DashboardEmpty({ message }: { message: string }) {
  return <div className="dashboard-empty"><strong>Nenhum dado no periodo</strong><span>{message}</span></div>
}
