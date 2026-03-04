import { Injectable } from '@angular/core';
import {
  Chart,
  registerables,
  ChartConfiguration,
  ChartDataset,
  TooltipItem
} from 'chart.js/auto';

Chart.register(...registerables);

export interface ChartItem {
  id: number;
  name: string;
  type: string;
  image?: string;
  x?: number;
  y?: number;
  zIndex?: number;
  width?: number;
  height?: number;
  isXYEnabled?: boolean;
  tableId?: number;
  tableName?: string;
  fields?: string[];
  data?: any[];
  valueField?: string;
  xField?: string;
  yField?: string;
  xFieldId?: number;
  yFieldId?: number;
  xFieldValue?: string;
  yFieldValue?: string;
  shortName?: string;
  rField?: string;  // ← Bubble chart radius field
}

const FONT_FAMILY = "'Inter', 'Roboto', sans-serif";
const COLOR_TITLE = '#1a237e';
const COLOR_LABEL = '#546e7a';
const COLOR_GRID  = '#eceff1';
const COLOR_AXIS  = '#90a4ae';

const PALETTE = [
  '#1a73e8', '#34a853', '#fbbc05', '#ea4335',
  '#46bdc6', '#ff6d01', '#673ab7', '#9c27b0',
  '#0097a7', '#795548', '#607d8b'
];

function buildTooltip() {
  return {
    enabled: true,
    backgroundColor: 'rgba(26,35,126,0.92)',
    titleColor: '#fff',
    bodyColor: '#e8eaf6',
    borderColor: '#3949ab',
    borderWidth: 1,
    padding: 10,
    cornerRadius: 8,
    titleFont: { family: FONT_FAMILY, size: 12, weight: 'bold' as const },
    bodyFont:  { family: FONT_FAMILY, size: 11 },
    callbacks: {
      label: (ctx: TooltipItem<any>) => {
        const v = ctx.parsed?.y ?? ctx.parsed?.r ?? ctx.formattedValue;
        return `  ${ctx.dataset.label ?? 'Value'}: ${v}`;
      }
    }
  };
}

function buildLegend(show = false) {
  return {
    display: show,
    position: 'top' as const,
    labels: {
      font:          { family: FONT_FAMILY, size: 11 },
      color:         COLOR_LABEL,
      boxWidth:      12,
      padding:       16,
      usePointStyle: true
    }
  };
}

function buildTitle(text: string) {
  return {
    display: true,
    text,
    color:   COLOR_TITLE,
    font:    { family: FONT_FAMILY, size: 14, weight: 'bold' as const },
    padding: { top: 8, bottom: 10 }
  };
}

function buildLinearAxis(label: string, stacked = false) {
  return {
    stacked,
    beginAtZero: true,
    border:  { color: COLOR_AXIS },
    grid:    { color: COLOR_GRID, lineWidth: 1 },
    ticks: {
      color:         COLOR_LABEL,
      font:          { family: FONT_FAMILY, size: 11 },
      maxTicksLimit: 8,
      padding:       4,
      callback:      (v: any) => (Number.isInteger(v) ? v : +v.toFixed(2))
    },
    title: {
      display: !!label,
      text:    label,
      color:   COLOR_TITLE,
      font:    { family: FONT_FAMILY, size: 12, weight: 'bold' as const },
      padding: { top: 4, bottom: 4 }
    }
  };
}

function buildCategoryAxis(label: string, stacked = false) {
  return {
    stacked,
    border: { color: COLOR_AXIS },
    grid:   { display: false },
    ticks: {
      color:         COLOR_LABEL,
      font:          { family: FONT_FAMILY, size: 11 },
      maxRotation:   35,
      minRotation:   0,
      autoSkip:      true,
      maxTicksLimit: 12,
      padding:       4
    },
    title: {
      display: !!label,
      text:    label,
      color:   COLOR_TITLE,
      font:    { family: FONT_FAMILY, size: 12, weight: 'bold' as const },
      padding: { top: 4, bottom: 4 }
    }
  };
}

function baseOptions(itemName: string): any {
  return {
    responsive:          true,
    maintainAspectRatio: false,
    animation:           { duration: 400, easing: 'easeOutQuart' },
    layout: { padding: { top: 4, right: 12, bottom: 4, left: 4 } },
    plugins: {
      title:   buildTitle(itemName),
      legend:  buildLegend(false),
      tooltip: buildTooltip()
    }
  };
}

@Injectable({ providedIn: 'root' })
export class ChartGenService {

  constructor() {}

  renderChart(item: ChartItem, canvas: HTMLCanvasElement): Chart | null {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    let cfg: ChartConfiguration;

    switch (item.type) {
      case 'bar':           cfg = this.barConfig(item);           break;
      case 'column':        cfg = this.columnConfig(item);        break;
      case 'pie':           cfg = this.pieConfig(item);           break;
      case 'stackedBar':    cfg = this.stackedBarConfig(item);    break;
      case 'stackedColumn': cfg = this.stackedColumnConfig(item); break;
      case 'doughnut':      cfg = this.doughnutConfig(item);      break;
      case 'bubble':        cfg = this.bubbleConfig(item);        break;  // ← NEW
      default: return null;
    }

    return new Chart(ctx, cfg);
  }

  // ─── BAR ────────────────────────────────────────────────────────────
  private barConfig(item: ChartItem): ChartConfiguration {
    const field = item.yField || '';
    const { labels, values } = this.countData(item, field);
    return {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label:              field || 'Count',
          data:               values,
          backgroundColor:    PALETTE[0] + 'cc',
          borderColor:        PALETTE[0],
          borderWidth:        1,
          borderRadius:       { topRight: 5, bottomRight: 5 },
          borderSkipped:      'start',
          barPercentage:      0.7,
          categoryPercentage: 0.8
        }]
      },
      options: {
        ...baseOptions(item.name),
        indexAxis: 'y',
        scales: { x: buildLinearAxis('Count'), y: buildCategoryAxis(field) }
      } as any
    };
  }

  // ─── COLUMN ─────────────────────────────────────────────────────────
  private columnConfig(item: ChartItem): ChartConfiguration {
    const field = item.xField || '';
    const { labels, values } = this.countData(item, field);
    return {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label:              field || 'Count',
          data:               values,
          backgroundColor:    PALETTE[0] + 'cc',
          borderColor:        PALETTE[0],
          borderWidth:        1,
          borderRadius:       { topLeft: 5, topRight: 5 },
          barPercentage:      0.7,
          categoryPercentage: 0.8
        }]
      },
      options: {
        ...baseOptions(item.name),
        scales: { x: buildCategoryAxis(field), y: buildLinearAxis('Count') }
      } as any
    };
  }

  // ─── PIE ────────────────────────────────────────────────────────────
  private pieConfig(item: ChartItem): ChartConfiguration {
    const { labels, values } = this.xyData(item);
    return {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data:            values,
          backgroundColor: PALETTE.map(c => c + 'dd'),
          borderColor:     '#fff',
          borderWidth:     2,
          hoverOffset:     6
        }]
      },
      options: {
        ...baseOptions(item.name),
        plugins: {
          title:  buildTitle(item.name),
          legend: { display: true, position: 'right' as const,
            labels: { font: { family: FONT_FAMILY, size: 11 }, color: COLOR_LABEL,
              boxWidth: 12, padding: 10, usePointStyle: true } },
          tooltip: { ...buildTooltip(), callbacks: {
            label: (ctx: TooltipItem<'pie'>) => {
              const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
              const pct   = total ? ((ctx.parsed / total) * 100).toFixed(1) : '0';
              return `  ${ctx.label}: ${ctx.parsed} (${pct}%)`;
            }
          }}
        }
      } as any
    };
  }

  // ─── STACKED BAR ────────────────────────────────────────────────────
  private stackedBarConfig(item: ChartItem): ChartConfiguration {
    const catField   = item.yField || '';
    const groupField = item.xField || '';
    const { labels, datasets } = this.stackedData(item, catField, groupField);
    return {
      type: 'bar',
      data: { labels, datasets },
      options: {
        ...baseOptions(item.name),
        indexAxis: 'y',
        plugins: { ...baseOptions(item.name).plugins, legend: buildLegend(datasets.length > 1) },
        scales: {
          x: { ...buildLinearAxis('Count'), stacked: true },
          y: { ...buildCategoryAxis(catField), stacked: true }
        }
      } as any
    };
  }

  // ─── STACKED COLUMN ─────────────────────────────────────────────────
  private stackedColumnConfig(item: ChartItem): ChartConfiguration {
    const catField   = item.xField || '';
    const groupField = item.yField || '';
    const { labels, datasets } = this.stackedData(item, catField, groupField);
    return {
      type: 'bar',
      data: { labels, datasets },
      options: {
        ...baseOptions(item.name),
        indexAxis: 'x',
        plugins: { ...baseOptions(item.name).plugins, legend: buildLegend(datasets.length > 1) },
        scales: {
          x: { ...buildCategoryAxis(catField), stacked: true },
          y: { ...buildLinearAxis('Count'),    stacked: true }
        }
      } as any
    };
  }

  // ─── DOUGHNUT ───────────────────────────────────────────────────────
  private doughnutConfig(item: ChartItem): ChartConfiguration {
    const { labels, values } = this.xyData(item);
    return {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data:            values,
          backgroundColor: PALETTE.map(c => c + 'dd'),
          borderColor:     '#fff',
          borderWidth:     2,
          hoverOffset:     8
        }]
      },
      options: {
        ...baseOptions(item.name),
        cutout: '60%',
        plugins: {
          title:  buildTitle(item.name),
          legend: { display: true, position: 'right' as const,
            labels: { font: { family: FONT_FAMILY, size: 11 }, color: COLOR_LABEL,
              boxWidth: 12, padding: 10, usePointStyle: true } },
          tooltip: { ...buildTooltip(), callbacks: {
            label: (ctx: TooltipItem<'doughnut'>) => {
              const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
              const pct   = total ? ((ctx.parsed / total) * 100).toFixed(1) : '0';
              return `  ${ctx.label}: ${ctx.parsed} (${pct}%)`;
            }
          }}
        }
      } as any
    };
  }

  // ─── BUBBLE ─────────────────────────────────────────────────────── NEW
  private bubbleConfig(item: ChartItem): ChartConfiguration {
    const xF = item.xField || '';
    const yF = item.yField || '';
    const rF = item.rField || '';   // radius field

    if (!item.data?.length) {
      return { type: 'bubble', data: { datasets: [] }, options: baseOptions(item.name) };
    }

    const rows = item.data.slice(0, 50);

    // If rField is set use it, else default radius = 8
    const bubbleData = rows.map(r => ({
      x: parseFloat(r[xF]) || 0,
      y: parseFloat(r[yF]) || 0,
      r: rF ? Math.min(Math.max(parseFloat(r[rF]) || 8, 4), 30) : 8
    }));

    return {
      type: 'bubble',
      data: {
        datasets: [{
          label:           item.name,
          data:            bubbleData,
          backgroundColor: PALETTE.map(c => c + '99'),   // semi-transparent
          borderColor:     PALETTE,
          borderWidth:     1.5,
          hoverBorderWidth: 2.5
        }]
      },
      options: {
        ...baseOptions(item.name),
        plugins: {
          title:   buildTitle(item.name),
          legend:  buildLegend(false),
          tooltip: {
            ...buildTooltip(),
            callbacks: {
              label: (ctx: TooltipItem<'bubble'>) => {
                const d = ctx.raw as { x: number; y: number; r: number };
                return [
                  `  X (${xF}): ${d.x}`,
                  `  Y (${yF}): ${d.y}`,
                  rF ? `  R (${rF}): ${d.r}` : `  Radius: ${d.r}`
                ];
              }
            }
          }
        },
        scales: {
          x: buildLinearAxis(xF || 'X'),
          y: buildLinearAxis(yF || 'Y')
        }
      } as any
    };
  }

  // ─── HELPERS ────────────────────────────────────────────────────────
  private countData(item: ChartItem, dimField: string) {
    if (!item.data?.length || !dimField) return { labels: [], values: [] };
    const counts: Record<string, number> = {};
    for (const row of item.data) {
      const k = String(row[dimField] ?? 'N/A');
      counts[k] = (counts[k] ?? 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);
    return { labels: sorted.map(e => e[0]), values: sorted.map(e => e[1]) };
  }

  private xyData(item: ChartItem) {
    if (!item.data?.length) return { labels: [], values: [] };
    const xF = item.xField || '';
    const yF = item.yField || '';
    const rows   = item.data.slice(0, 20);
    const labels = rows.map(r => String(r[xF] ?? ''));
    const values = rows.map(r => { const v = parseFloat(r[yF]); return isNaN(v) ? 0 : v; });
    return { labels, values };
  }

  private stackedData(item: ChartItem, catField: string, groupField: string) {
    if (!item.data?.length || !catField) return { labels: [], datasets: [] };
    const allCats = [...new Set(item.data.map(r => String(r[catField] ?? 'N/A')))].slice(0, 12);
    if (!groupField) {
      return {
        labels: allCats,
        datasets: [{
          label:           'Total',
          data:            allCats.map(c => item.data!.filter(r => String(r[catField]) === c).length),
          backgroundColor: PALETTE[0] + 'cc',
          borderColor:     PALETTE[0],
          borderWidth:     1,
          borderRadius:    4,
          barPercentage:   0.75
        }]
      };
    }
    const allGroups = [...new Set(item.data.map(r => String(r[groupField] ?? 'N/A')))].slice(0, 8);
    const datasets: ChartDataset[] = allGroups.map((g, i) => ({
      label:           g,
      data:            allCats.map(c =>
        item.data!.filter(r => String(r[catField]) === c && String(r[groupField]) === g).length
      ),
      backgroundColor: PALETTE[i % PALETTE.length] + 'cc',
      borderColor:     PALETTE[i % PALETTE.length],
      borderWidth:     1,
      borderRadius:    3,
      barPercentage:   0.8
    } as any));
    return { labels: allCats, datasets };
  }
}
