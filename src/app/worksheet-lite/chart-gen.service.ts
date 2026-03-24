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
  rField?: string;
  containerId?: string;
  // ── Optional label map: { fieldName: { '1': 'Male', '2': 'Female' } }
  labelMaps?: Record<string, Record<string, string>>;
  // ── Table chart
  tableRowCount?: number;
  tableSelectedColumns?: string[];
}

const FONT_FAMILY = "'Inter', 'Roboto', sans-serif";
const COLOR_TITLE = '#1a237e';
const COLOR_LABEL = '#546e7a';
const COLOR_GRID  = '#eceff1';
const COLOR_AXIS  = '#90a4ae';

const PALETTE = [
  '#1a73e8', '#34a853', '#fbbc05', '#ea4335',
  '#46bdc6', '#ff6d01', '#673ab7', '#9c27b0',
  '#0097a7', '#795548', '#607d8b',
  '#e91e63', '#00bcd4', '#8bc34a', '#ff5722',
  '#3f51b5', '#009688', '#ffc107', '#f44336',
  '#2196f3', '#4caf50', '#9c27b0'
];

const ZONE_COLORS = {
  critical:  '#ea4335',
  low:       '#ff6d01',
  moderate:  '#fbbc05',
  good:      '#34a853',
  excellent: '#1a73e8',
};

function zoneColor(pct: number): string {
  if (pct >= 0.90) return ZONE_COLORS.excellent;
  if (pct >= 0.75) return ZONE_COLORS.good;
  if (pct >= 0.50) return ZONE_COLORS.moderate;
  if (pct >= 0.25) return ZONE_COLORS.low;
  return ZONE_COLORS.critical;
}

function zoneLabel(pct: number): string {
  if (pct >= 0.90) return 'Excellent';
  if (pct >= 0.75) return 'Good';
  if (pct >= 0.50) return 'Moderate';
  if (pct >= 0.25) return 'Low';
  return 'Critical';
}

/* ── Shared builders ── */
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
      font: { family: FONT_FAMILY, size: 11 },
      color: COLOR_LABEL,
      boxWidth: 12,
      padding: 16,
      usePointStyle: true
    }
  };
}

function buildTitle(text: string) {
  return {
    display: true,
    text,
    color: COLOR_TITLE,
    font: { family: FONT_FAMILY, size: 14, weight: 'bold' as const },
    padding: { top: 8, bottom: 10 }
  };
}

function buildLinearAxis(label: string, stacked = false) {
  return {
    stacked,
    beginAtZero: true,
    border: { color: COLOR_AXIS },
    grid: { color: COLOR_GRID, lineWidth: 1 },
    ticks: {
      color: COLOR_LABEL,
      font: { family: FONT_FAMILY, size: 11 },
      maxTicksLimit: 8,
      padding: 4,
      callback: (v: any) => (Number.isInteger(v) ? v : +v.toFixed(2))
    },
    title: {
      display: !!label,
      text: label,
      color: COLOR_TITLE,
      font: { family: FONT_FAMILY, size: 12, weight: 'bold' as const },
      padding: { top: 4, bottom: 4 }
    }
  };
}

function buildCategoryAxis(label: string, stacked = false, totalItems = 0) {
  const fontSize = totalItems > 20 ? 9 : totalItems > 12 ? 10 : 11;
  const maxLen   = totalItems > 15 ? 10 : 16;
  return {
    stacked,
    border: { color: COLOR_AXIS },
    grid:   { display: false },
    ticks: {
      color: COLOR_LABEL,
      font: { family: FONT_FAMILY, size: fontSize },
      maxRotation: totalItems > 10 ? 45 : 30,
      minRotation: totalItems > 10 ? 30 : 0,
      autoSkip: false,
      padding: 4,
      callback: function (this: any, value: any, index: number) {
        const lbl = String((this as any).getLabelForValue ? (this as any).getLabelForValue(index) : value);
        return lbl.length > maxLen ? lbl.slice(0, maxLen - 1) + '…' : lbl;
      }
    },
    title: {
      display: !!label,
      text: label,
      color: COLOR_TITLE,
      font: { family: FONT_FAMILY, size: 12, weight: 'bold' as const },
      padding: { top: 4, bottom: 4 }
    }
  };
}

function baseOptions(itemName: string): any {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400, easing: 'easeOutQuart' },
    layout: { padding: { top: 4, right: 12, bottom: 4, left: 4 } },
    plugins: {
      title:   buildTitle(itemName),
      legend:  buildLegend(false),
      tooltip: buildTooltip()
    }
  };
}

/* ══════════════════════════════════════════════════════════════════════
   ChartGenService
══════════════════════════════════════════════════════════════════════ */
@Injectable({ providedIn: 'root' })
export class ChartGenService {

  constructor() { }

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
      case 'bubble':        cfg = this.bubbleConfig(item);        break;
      case 'gauge':         return this.renderGauge(item, canvas);
      case 'progressBar':   cfg = this.progressBarConfig(item);   break;
      case 'timeline':      return this.renderTimeline(item, canvas);
      case 'count':         return this.renderCountCards(item, canvas);
      case 'table':         return this.renderTableChart(item, canvas);
      default:              return null;
    }

    return new Chart(ctx, cfg);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  filteredData — apply selectedXValues / selectedYValues filter
  // ══════════════════════════════════════════════════════════════════════

  private filteredData(item: ChartItem): any[] {
    if (!item.data?.length) return [];
    let rows = item.data;

    const selectedX: string[] = (item as any).filteredSelectedXValues || (item as any).selectedXValues || [];
    const selectedY: string[] = (item as any).filteredSelectedYValues || (item as any).selectedYValues || [];

    if (selectedX.length > 0 && item.xField) {
      rows = rows.filter(r => {
        const label = this.resolveLabel(r[item.xField!], item.xField!, item);
        return selectedX.includes(label);
      });
    }

    if (selectedY.length > 0 && item.yField) {
      rows = rows.filter(r => {
        const label = this.resolveLabel(r[item.yField!], item.yField!, item);
        return selectedY.includes(label);
      });
    }

    return rows;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  resolveLabel — numeric ID values → human label
  //  Auto-detects common fields (gender_id, salutation_id, citizen_id)
  //  OR uses item.labelMaps if provided
  // ══════════════════════════════════════════════════════════════════════

  private resolveLabel(value: any, fieldName: string, item: ChartItem): string {
    const raw = String(value ?? 'N/A');

    // 1. User-provided label map (highest priority)
    if (item.labelMaps?.[fieldName]) {
      return item.labelMaps[fieldName][raw] ?? raw;
    }

    // 2. Auto built-in maps for common _id fields
    const builtInMaps: Record<string, Record<string, string>> = {
      gender_id: {
        '1': 'Male',
        '2': 'Female',
        '3': 'Other'
      },
      salutation_id: {
        '1': 'Mr',
        '2': 'Mrs',
        '3': 'Ms',
        '4': 'Dr',
        '5': 'Prof'
      },
      citizen_id: {
        '1': 'Citizen',
        '2': 'PR',
        '3': 'Foreigner'
      },
      company_id: {
        '1': 'Company A',
        '2': 'Company B',
        '3': 'Company C'
      }
    };

    if (builtInMaps[fieldName]) {
      return builtInMaps[fieldName][raw] ?? raw;
    }

    return raw;
  }

  // ─── BAR ──────────────────────────────────────────────────────────────
  private barConfig(item: ChartItem): ChartConfiguration {
    const field = item.yField || '';
    const { labels, values, total } = this.countData(item, field);
    return {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: field || 'Count',
          data: values,
          backgroundColor: PALETTE[0] + 'cc',
          borderColor: PALETTE[0],
          borderWidth: 1,
          borderRadius: { topRight: 5, bottomRight: 5 },
          borderSkipped: 'start',
          barPercentage: 0.7,
          categoryPercentage: 0.8
        }]
      },
      options: {
        ...baseOptions(item.name),
        indexAxis: 'y',
        scales: {
          x: buildLinearAxis('Count'),
          y: buildCategoryAxis(field, false, total)
        },
        plugins: {
          ...baseOptions(item.name).plugins,
          tooltip: {
            ...buildTooltip(),
            callbacks: {
              title: (items: TooltipItem<any>[]) => labels[items[0].dataIndex] ?? '',
              label: (ctx: TooltipItem<any>) => `  Count: ${ctx.parsed.x}`
            }
          }
        }
      } as any
    };
  }

  // ─── COLUMN ───────────────────────────────────────────────────────────
  private columnConfig(item: ChartItem): ChartConfiguration {
    const field = item.xField || '';
    const { labels, values, total } = this.countData(item, field);
    return {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: field || 'Count',
          data: values,
          backgroundColor: PALETTE[0] + 'cc',
          borderColor: PALETTE[0],
          borderWidth: 1,
          borderRadius: { topLeft: 5, topRight: 5 },
          barPercentage: 0.7,
          categoryPercentage: 0.8
        }]
      },
      options: {
        ...baseOptions(item.name),
        scales: {
          x: buildCategoryAxis(field, false, total),
          y: buildLinearAxis('Count')
        },
        plugins: {
          ...baseOptions(item.name).plugins,
          tooltip: {
            ...buildTooltip(),
            callbacks: {
              title: (items: TooltipItem<any>[]) => labels[items[0].dataIndex] ?? '',
              label: (ctx: TooltipItem<any>) => `  Count: ${ctx.parsed.y}`
            }
          }
        }
      } as any
    };
  }

  // ─── PIE ──────────────────────────────────────────────────────────────
  private pieConfig(item: ChartItem): ChartConfiguration {
    // ── Count occurrences of xField values (same logic as bar chart) ──
    const field = item.xField || '';
    const { labels, values, total } = this.countData(item, field);

    const grandTotal = values.reduce((a, b) => a + b, 0);
    const maxLegendLen = 16;
    const truncLabel = (s: string) => s.length > maxLegendLen ? s.slice(0, maxLegendLen - 1) + '…' : s;
    const truncLabels = labels.map(truncLabel);

    // Rich colour set — cycle through full PALETTE
    const bgColors  = labels.map((_, i) => PALETTE[i % PALETTE.length] + 'e6');
    const bdrColors = labels.map((_, i) => PALETTE[i % PALETTE.length]);

    return {
      type: 'pie',
      data: {
        labels: truncLabels,
        datasets: [{
          data: values,
          backgroundColor: bgColors,
          borderColor: '#ffffff',
          borderWidth: 2.5,
          hoverOffset: 10,
          hoverBorderWidth: 3,
        }]
      },
      options: {
        ...baseOptions(item.name),
        plugins: {
          title: buildTitle(item.name),
          legend: {
            display: true,
            position: 'right' as const,
            labels: {
              font: { family: FONT_FAMILY, size: 11 },
              color: COLOR_LABEL,
              boxWidth: 13,
              padding: 12,
              usePointStyle: true,
              pointStyle: 'circle',
              // Show count next to label
              generateLabels: (chart: any) => {
                const ds = chart.data.datasets[0];
                return (chart.data.labels as string[]).map((lbl: string, i: number) => ({
                  text: `${lbl}  (${(ds.data[i] as number).toLocaleString()})`,
                  fillStyle: ds.backgroundColor[i],
                  strokeStyle: '#fff',
                  lineWidth: 1,
                  hidden: false,
                  index: i,
                  fontColor: COLOR_LABEL,
                  pointStyle: 'circle',
                }));
              }
            }
          },
          tooltip: {
            ...buildTooltip(),
            callbacks: {
              title: (items: TooltipItem<'pie'>[]) => labels[items[0].dataIndex] ?? '',
              label: (ctx: TooltipItem<'pie'>) => {
                const count = ctx.parsed as number;
                const pct   = grandTotal ? ((count / grandTotal) * 100).toFixed(1) : '0';
                return [
                  `  Count : ${count.toLocaleString()}`,
                  `  Share : ${pct}%`,
                  `  Field : ${field}`,
                ];
              }
            }
          }
        }
      } as any
    };
  }

  // ─── STACKED BAR ──────────────────────────────────────────────────────
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

  // ─── STACKED COLUMN ───────────────────────────────────────────────────
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

  // ─── DOUGHNUT ─────────────────────────────────────────────────────────
  private doughnutConfig(item: ChartItem): ChartConfiguration {
    const { labels, values } = this.xyData(item);
    const maxLegendLen = 14;
    const truncLabel = (s: string) => s.length > maxLegendLen ? s.slice(0, maxLegendLen - 1) + '…' : s;
    return {
      type: 'doughnut',
      data: {
        labels: labels.map(truncLabel),
        datasets: [{
          data: values,
          backgroundColor: PALETTE.map(c => c + 'dd'),
          borderColor: '#fff',
          borderWidth: 2,
          hoverOffset: 8
        }]
      },
      options: {
        ...baseOptions(item.name),
        cutout: '60%',
        plugins: {
          title: buildTitle(item.name),
          legend: {
            display: true, position: 'right' as const,
            labels: {
              font: { family: FONT_FAMILY, size: 11 }, color: COLOR_LABEL,
              boxWidth: 12, padding: 10, usePointStyle: true
            }
          },
          tooltip: {
            ...buildTooltip(), callbacks: {
              title: (items: TooltipItem<'doughnut'>[]) => labels[items[0].dataIndex] ?? '',
              label: (ctx: TooltipItem<'doughnut'>) => {
                const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
                const pct   = total ? ((ctx.parsed / total) * 100).toFixed(1) : '0';
                return `  ${labels[ctx.dataIndex]}: ${ctx.parsed} (${pct}%)`;
              }
            }
          }
        }
      } as any
    };
  }

  // ─── BUBBLE ───────────────────────────────────────────────────────────
  private bubbleConfig(item: ChartItem): ChartConfiguration {
    const xF = item.xField || '';
    const yF = item.yField || '';
    const rF = item.rField || '';
    if (!item.data?.length) {
      return { type: 'bubble', data: { datasets: [] }, options: baseOptions(item.name) };
    }
    const rows       = item.data.slice(0, 50);
    const bubbleData = rows.map(r => ({
      x: parseFloat(r[xF]) || 0,
      y: parseFloat(r[yF]) || 0,
      r: rF ? Math.min(Math.max(parseFloat(r[rF]) || 8, 4), 30) : 8
    }));
    return {
      type: 'bubble',
      data: {
        datasets: [{
          label: item.name,
          data: bubbleData,
          backgroundColor: PALETTE.map(c => c + '99'),
          borderColor: PALETTE,
          borderWidth: 1.5,
          hoverBorderWidth: 2.5
        }]
      },
      options: {
        ...baseOptions(item.name),
        plugins: {
          title: buildTitle(item.name),
          legend: buildLegend(false),
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

  // ─── GAUGE ────────────────────────────────────────────────────────────
  private renderGauge(item: ChartItem, canvas: HTMLCanvasElement): Chart | null {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const valueField  = item.xField || '';
    const targetField = item.yField || '';
    const rows = item.data ?? [];

    let progress = 0;
    let target   = 100;
    if (rows.length && valueField)
      progress = rows.reduce((s: number, r: any) => s + (parseFloat(r[valueField]) || 0), 0);
    if (rows.length && targetField)
      target = rows.reduce((s: number, r: any) => s + (parseFloat(r[targetField]) || 0), 0);
    if (target <= 0) target = 100;

    const pct = Math.min(Math.max(progress / target, 0), 1);

    const START_DEG = 210;
    const SWEEP_DEG = 210;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const startAngle = toRad(START_DEG);
    const endAngle   = toRad(START_DEG + SWEEP_DEG);

    const zones: Array<{ from: number; to: number; color: string; label: string }> = [
      { from: 0.00, to: 0.25, color: ZONE_COLORS.critical,  label: 'Critical'  },
      { from: 0.25, to: 0.50, color: ZONE_COLORS.low,       label: 'Low'       },
      { from: 0.50, to: 0.75, color: ZONE_COLORS.moderate,  label: 'Moderate'  },
      { from: 0.75, to: 0.90, color: ZONE_COLORS.good,      label: 'Good'      },
      { from: 0.90, to: 1.00, color: ZONE_COLORS.excellent, label: 'Excellent' },
    ];

    const fmt = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M'
      : n >= 1000 ? (n / 1000).toFixed(1) + 'k'
      : n % 1 === 0 ? String(n) : n.toFixed(1);

    let gaugeRafId: number | null = null;
    const GAUGE_ANIM_MS  = 1500;
    const easeOutCubic   = (t: number) => 1 - Math.pow(1 - t, 3);

    const drawGaugeFrame = (c: CanvasRenderingContext2D, width: number, height: number, ap: number) => {
      const cx     = width / 2;
      const cy     = height * 0.58;
      const outerR = Math.min(cx, cy) * 0.80;
      const trackW = outerR * 0.22;
      const innerR = outerR - trackW;
      const aNeedleColor = zoneColor(ap);
      const aStatusLabel = zoneLabel(ap);

      c.save();
      c.clearRect(0, 0, width, height);

      c.beginPath();
      c.arc(cx, cy, outerR, startAngle, endAngle);
      c.strokeStyle = '#e8eaf6';
      c.lineWidth   = trackW;
      c.lineCap     = 'round';
      c.stroke();

      zones.forEach(zone => {
        const a1 = startAngle + toRad(SWEEP_DEG * zone.from);
        const a2 = startAngle + toRad(SWEEP_DEG * zone.to);
        c.beginPath();
        c.arc(cx, cy, outerR - trackW / 2, a1, a2);
        c.strokeStyle = zone.color + 'aa';
        c.lineWidth   = trackW;
        c.lineCap     = 'butt';
        c.stroke();
      });

      const progressAngle = startAngle + toRad(SWEEP_DEG * ap);
      const grad = c.createLinearGradient(
        cx + Math.cos(startAngle) * outerR, cy + Math.sin(startAngle) * outerR,
        cx + Math.cos(progressAngle) * outerR, cy + Math.sin(progressAngle) * outerR
      );
      grad.addColorStop(0, ZONE_COLORS.critical  + 'ff');
      grad.addColorStop(0.5, ZONE_COLORS.moderate + 'ff');
      grad.addColorStop(1, aNeedleColor + 'ff');
      c.beginPath();
      c.arc(cx, cy, outerR - trackW / 2, startAngle, progressAngle);
      c.strokeStyle = grad;
      c.lineWidth   = trackW;
      c.lineCap     = 'round';
      c.stroke();

      const TOTAL_TICKS = 40;
      for (let i = 0; i <= TOTAL_TICKS; i++) {
        const t        = i / TOTAL_TICKS;
        const angle    = startAngle + toRad(SWEEP_DEG * t);
        const isMajor  = i % 10 === 0;
        const isMid    = i % 5 === 0;
        const tickOuter = outerR + (isMajor ? 10 : isMid ? 6 : 3);
        const tickInner = outerR + 1;
        const tc = Math.cos(angle), ts = Math.sin(angle);
        c.beginPath();
        c.moveTo(cx + tc * tickInner, cy + ts * tickInner);
        c.lineTo(cx + tc * tickOuter, cy + ts * tickOuter);
        c.strokeStyle = isMajor ? '#455a64' : '#b0bec5';
        c.lineWidth   = isMajor ? 2 : 1;
        c.stroke();
        if (isMajor) {
          const labelR = outerR + 22;
          c.font          = `bold 9px ${FONT_FAMILY}`;
          c.fillStyle     = '#546e7a';
          c.textAlign     = 'center';
          c.textBaseline  = 'middle';
          c.fillText(`${Math.round(t * 100)}%`, cx + tc * labelR, cy + ts * labelR);
        }
      }

      [0.25, 0.50, 0.75, 0.90].forEach(boundary => {
        const angle = startAngle + toRad(SWEEP_DEG * boundary);
        const sc = Math.cos(angle), ss = Math.sin(angle);
        c.beginPath();
        c.moveTo(cx + sc * (innerR - 2), cy + ss * (innerR - 2));
        c.lineTo(cx + sc * (outerR + 2), cy + ss * (outerR + 2));
        c.strokeStyle = '#ffffffcc';
        c.lineWidth   = 2;
        c.stroke();
      });

      const needleAngle  = startAngle + toRad(SWEEP_DEG * ap);
      const needleLength = innerR * 0.88;
      const needleBase   = 10;
      const nc = Math.cos(needleAngle), ns = Math.sin(needleAngle);
      const perpCos = Math.cos(needleAngle + Math.PI / 2);
      const perpSin = Math.sin(needleAngle + Math.PI / 2);
      c.shadowColor = 'rgba(0,0,0,0.25)';
      c.shadowBlur = 8; c.shadowOffsetX = 2; c.shadowOffsetY = 2;
      c.beginPath();
      c.moveTo(cx + nc * needleLength, cy + ns * needleLength);
      c.lineTo(cx + perpCos * needleBase - nc * 12, cy + perpSin * needleBase - ns * 12);
      c.lineTo(cx - nc * (needleBase * 0.6), cy - ns * (needleBase * 0.6));
      c.lineTo(cx - perpCos * needleBase - nc * 12, cy - perpSin * needleBase - ns * 12);
      c.closePath();
      const nGrad = c.createLinearGradient(cx - nc * 12, cy - ns * 12, cx + nc * needleLength, cy + ns * needleLength);
      nGrad.addColorStop(0, '#1a237e');
      nGrad.addColorStop(0.5, aNeedleColor);
      nGrad.addColorStop(1, '#ffffff88');
      c.fillStyle = nGrad; c.fill();
      c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0;

      c.beginPath(); c.arc(cx, cy, 16, 0, Math.PI * 2);
      const hubGrad = c.createRadialGradient(cx - 3, cy - 3, 2, cx, cy, 16);
      hubGrad.addColorStop(0, '#546e7a'); hubGrad.addColorStop(1, '#1a237e');
      c.fillStyle = hubGrad; c.fill();
      c.beginPath(); c.arc(cx, cy, 10, 0, Math.PI * 2); c.fillStyle = '#eceff1'; c.fill();
      c.beginPath(); c.arc(cx, cy, 4,  0, Math.PI * 2); c.fillStyle = aNeedleColor; c.fill();

      const labelY = cy + innerR * 0.38;
      c.font = `bold 28px ${FONT_FAMILY}`; c.fillStyle = aNeedleColor;
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillText(`${(ap * 100).toFixed(1)}%`, cx, labelY);

      c.font = `12px ${FONT_FAMILY}`; c.fillStyle = '#546e7a';
      c.fillText(`${fmt(progress)} / ${fmt(target)}`, cx, labelY + 18);

      const badgeY   = labelY + 40;
      const badgePad = { x: 14, y: 5 };
      c.font = `bold 11px ${FONT_FAMILY}`;
      const textW = c.measureText(aStatusLabel).width;
      const bx = cx - textW / 2 - badgePad.x;
      const by = badgeY - 14;
      const bw = textW + badgePad.x * 2;
      const bh = 22;
      c.beginPath(); c.roundRect(bx, by, bw, bh, 11);
      c.fillStyle = aNeedleColor + '22'; c.fill();
      c.strokeStyle = aNeedleColor + '88'; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = aNeedleColor; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(aStatusLabel, cx, by + bh / 2);

      c.font = `bold 13px ${FONT_FAMILY}`; c.fillStyle = COLOR_TITLE;
      c.textBaseline = 'top'; c.fillText(item.name, cx, 10);
      if (valueField || targetField) {
        c.font = `10px ${FONT_FAMILY}`; c.fillStyle = COLOR_LABEL;
        c.fillText(`${valueField || '—'} ÷ ${targetField || '—'}`, cx, 28);
      }
      c.restore();
    };

    const speedometerPlugin = {
      id: 'speedometerPlugin',
      afterDatasetsDraw(chart: any) {
        const { ctx: c, width, height } = chart;
        if (gaugeRafId !== null) { cancelAnimationFrame(gaugeRafId); gaugeRafId = null; }
        const startTime = performance.now();
        const animate = (now: number) => {
          const elapsed = now - startTime;
          const t  = Math.min(elapsed / GAUGE_ANIM_MS, 1);
          const ap = easeOutCubic(t) * pct;
          drawGaugeFrame(c, width, height, ap);
          if (t < 1) { gaugeRafId = requestAnimationFrame(animate); }
          else        { gaugeRafId = null; }
        };
        gaugeRafId = requestAnimationFrame(animate);
      }
    };

    return new Chart(ctx, {
      type: 'doughnut',
      data: { datasets: [] },
      options: { responsive: true, maintainAspectRatio: false } as any,
      plugins: [speedometerPlugin]
    } as any);
  }

  // ─── PROGRESS BAR ─────────────────────────────────────────────────────
  private progressBarConfig(item: ChartItem): ChartConfiguration {
    const labelField     = item.xField || '';
    const completedField = item.yField || '';
    const totalField     = item.rField || '';
    if (!item.data?.length) {
      return { type: 'bar', data: { labels: [], datasets: [] }, options: { ...baseOptions(item.name), indexAxis: 'y' } as any };
    }
    const rows      = item.data.slice(0, 20);
    const labels    = rows.map(r => String(r[labelField] ?? ''));
    const completed = rows.map(r => { const v = parseFloat(r[completedField]); return isNaN(v) ? 0 : v; });
    const totals    = rows.map(r => { const v = parseFloat(r[totalField]);     return isNaN(v) || v <= 0 ? 100 : v; });
    const pcts      = completed.map((c, i) => Math.min((c / totals[i]) * 100, 100));
    const remaining = pcts.map(p => Math.max(100 - p, 0));
    const barColors = pcts.map(p =>
      p >= 90 ? '#34a853ee' : p >= 75 ? '#fbbc05ee' : p >= 50 ? '#ff6d01ee' : '#ea4335ee'
    );
    const pctLabelPlugin = {
      id: 'progressBarLabels',
      afterDatasetsDraw(chart: any) {
        const { ctx } = chart;
        chart.getDatasetMeta(0).data.forEach((bar: any, i: number) => {
          const fmt = (n: number) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toFixed(0);
          ctx.save();
          ctx.font = `bold 11px ${FONT_FAMILY}`;
          ctx.fillStyle = '#1a237e'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(`${pcts[i].toFixed(1)}%  (${fmt(completed[i])} / ${fmt(totals[i])})`, bar.x + 6, bar.y);
          ctx.restore();
        });
      }
    };
    return {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Completed', data: pcts, backgroundColor: barColors, borderColor: barColors.map((c: string) => c.slice(0, 7)), borderWidth: 0, borderRadius: { topRight: 6, bottomRight: 6 }, borderSkipped: false, barPercentage: 0.65, categoryPercentage: 0.85 },
          { label: 'Remaining', data: remaining, backgroundColor: '#e0e0e055', borderColor: '#e0e0e0', borderWidth: 0, borderRadius: { topRight: 6, bottomRight: 6 }, borderSkipped: false, barPercentage: 0.65, categoryPercentage: 0.85 }
        ]
      },
      options: {
        ...baseOptions(item.name),
        indexAxis: 'y',
        layout: { padding: { top: 4, right: 120, bottom: 4, left: 4 } },
        plugins: {
          title: buildTitle(item.name),
          legend: { display: false },
          tooltip: {
            enabled: true, backgroundColor: 'rgba(26,35,126,0.92)', titleColor: '#fff',
            bodyColor: '#e8eaf6', borderColor: '#3949ab', borderWidth: 1, padding: 10, cornerRadius: 8,
            callbacks: {
              label: (ctx: TooltipItem<any>) => {
                const i = ctx.dataIndex;
                if (ctx.datasetIndex === 0) return `  Completed: ${pcts[i].toFixed(1)}%  (${completed[i]} / ${totals[i]})`;
                return `  Remaining: ${remaining[i].toFixed(1)}%`;
              }
            }
          }
        },
        scales: {
          x: { stacked: true, min: 0, max: 100, beginAtZero: true, border: { color: COLOR_AXIS }, grid: { color: COLOR_GRID, lineWidth: 1 }, ticks: { color: COLOR_LABEL, font: { family: FONT_FAMILY, size: 11 }, callback: (v: any) => v + '%' }, title: { display: true, text: 'Completion %', color: COLOR_TITLE, font: { family: FONT_FAMILY, size: 12, weight: 'bold' as const } } },
          y: { stacked: true, border: { color: COLOR_AXIS }, grid: { display: false }, ticks: { color: COLOR_LABEL, font: { family: FONT_FAMILY, size: 11 }, padding: 4 } }
        }
      } as any,
      plugins: [pctLabelPlugin]
    } as any;
  }

  // ─── TIMELINE ─────────────────────────────────────────────────────────
  private renderTimeline(item: ChartItem, canvas: HTMLCanvasElement): Chart | null {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const labelField = item.xField || '';
    const startField = item.yField || '';
    const endField   = item.rField || '';
    if (!item.data?.length) return null;
    const rows = item.data.slice(0, 20);
    const parseDate = (v: any): number => {
      if (!v) return Date.now();
      if (typeof v === 'number') return v;
      const d = new Date(v);
      return isNaN(d.getTime()) ? Date.now() : d.getTime();
    };
    const events = rows.map((r, i) => ({
      label: String(r[labelField] ?? `Event ${i + 1}`),
      start: parseDate(r[startField]),
      end:   parseDate(r[endField] || r[startField]),
      color: PALETTE[i % PALETTE.length]
    }));
    const allTimes = events.flatMap(e => [e.start, e.end]);
    const minTime  = Math.min(...allTimes);
    const maxTime  = Math.max(...allTimes);
    const padding  = Math.max((maxTime - minTime) * 0.05, 86_400_000);
    const fmtDate  = (ms: number) => {
      const d = new Date(ms);
      return `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
    };
    let tlRafId: number | null = null;
    const TL_ANIM_MS   = 1000;
    const TL_STAGGER   = 90;
    const easeOutCubicTL = (t: number) => 1 - Math.pow(1 - t, 3);
    const drawTimelineBars = (c: CanvasRenderingContext2D, chart: any, elapsed: number) => {
      const { chartArea, scales } = chart;
      if (!chartArea || !scales?.x || !scales?.y) return;
      events.forEach((ev, i) => {
        const rowElapsed = Math.max(0, elapsed - i * TL_STAGGER);
        const rowT       = Math.min(rowElapsed / (TL_ANIM_MS * 0.75), 1);
        const rowProg    = easeOutCubicTL(rowT);
        const x1   = scales.x.getPixelForValue(ev.start);
        const x2Max = scales.x.getPixelForValue(Math.max(ev.end, ev.start + padding * 0.2));
        const x2   = x1 + (x2Max - x1) * rowProg;
        if (x2 <= x1 + 1) return;
        const y    = scales.y.getPixelForValue(i);
        const barH = Math.max(14, (scales.y.height / Math.max(events.length, 1)) * 0.52);
        const r    = Math.min(barH / 2, 7);
        c.save();
        c.beginPath(); c.rect(x1, y - barH / 2 - 2, x2Max - x1 + 60, barH + 4); c.clip();
        c.shadowColor = 'rgba(0,0,0,0.14)'; c.shadowBlur = 5; c.shadowOffsetY = 2;
        c.beginPath();
        c.moveTo(x1 + r, y - barH / 2); c.lineTo(x2 - r, y - barH / 2);
        c.quadraticCurveTo(x2, y - barH / 2, x2, y - barH / 2 + r);
        c.lineTo(x2, y + barH / 2 - r); c.quadraticCurveTo(x2, y + barH / 2, x2 - r, y + barH / 2);
        c.lineTo(x1 + r, y + barH / 2); c.quadraticCurveTo(x1, y + barH / 2, x1, y + barH / 2 - r);
        c.lineTo(x1, y - barH / 2 + r); c.quadraticCurveTo(x1, y - barH / 2, x1 + r, y - barH / 2);
        c.closePath();
        const grad = c.createLinearGradient(x1, 0, x2Max, 0);
        grad.addColorStop(0, ev.color + 'ff'); grad.addColorStop(1, ev.color + '88');
        c.fillStyle = grad; c.fill(); c.shadowBlur = 0;
        c.font = `bold 11px ${FONT_FAMILY}`;
        const textW = c.measureText(ev.label).width;
        const barW  = x2 - x1;
        if (barW > textW + 14) {
          c.globalAlpha = Math.min((barW - textW - 14) / 30, 1);
          c.fillStyle = '#ffffff'; c.textAlign = 'left'; c.textBaseline = 'middle';
          c.fillText(ev.label, x1 + 8, y); c.globalAlpha = 1;
        }
        if (rowT >= 1) {
          const days = Math.round((ev.end - ev.start) / 86_400_000);
          if (days > 0) {
            c.font = `10px ${FONT_FAMILY}`; c.fillStyle = '#546e7a';
            c.textAlign = 'left'; c.textBaseline = 'middle';
            c.fillText(`${days}d`, x2Max + 5, y);
          }
        }
        c.beginPath(); c.arc(x1, y, 4, 0, Math.PI * 2);
        c.fillStyle = '#ffffff'; c.fill();
        c.strokeStyle = ev.color; c.lineWidth = 2; c.stroke();
        c.restore();
      });
    };
    const timelinePlugin = {
      id: 'timelinePlugin',
      afterDatasetsDraw(chart: any) {
        const { ctx: c, chartArea } = chart;
        if (!chartArea) return;
        if (tlRafId !== null) { cancelAnimationFrame(tlRafId); tlRafId = null; }
        const startTime   = performance.now();
        const lastRowEndMs = TL_STAGGER * (events.length - 1) + TL_ANIM_MS * 0.75;
        const animate = (now: number) => {
          const elapsed = now - startTime;
          c.save();
          c.clearRect(chartArea.left - 2, chartArea.top - 2, chartArea.right - chartArea.left + 70, chartArea.bottom - chartArea.top + 4);
          c.restore();
          drawTimelineBars(c, chart, elapsed);
          if (elapsed < lastRowEndMs) { tlRafId = requestAnimationFrame(animate); }
          else { tlRafId = null; }
        };
        tlRafId = requestAnimationFrame(animate);
      }
    };
    return new Chart(ctx, {
      type: 'scatter',
      data: { datasets: events.map(ev => ({ label: ev.label, data: [{ x: ev.start, y: events.indexOf(ev) }, { x: ev.end, y: events.indexOf(ev) }], pointRadius: 0, showLine: false, backgroundColor: 'transparent' })) },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 500, easing: 'easeOutQuart' },
        layout: { padding: { top: 8, right: 55, bottom: 8, left: 8 } },
        plugins: {
          title: buildTitle(item.name), legend: { display: false },
          tooltip: {
            enabled: true, backgroundColor: 'rgba(26,35,126,0.92)', titleColor: '#fff',
            bodyColor: '#e8eaf6', borderColor: '#3949ab', borderWidth: 1, padding: 10, cornerRadius: 8,
            callbacks: {
              title: (items: any[]) => events[items[0]?.datasetIndex]?.label ?? '',
              label: (ctx: any) => {
                const ev = events[ctx.datasetIndex];
                if (!ev) return '';
                const days = Math.round((ev.end - ev.start) / 86_400_000);
                return [`  Start    : ${fmtDate(ev.start)}`, `  End      : ${fmtDate(ev.end)}`, `  Duration : ${days} day${days !== 1 ? 's' : ''}`];
              }
            }
          }
        },
        scales: {
          x: { type: 'linear', min: minTime - padding, max: maxTime + padding, border: { color: COLOR_AXIS }, grid: { color: COLOR_GRID, lineWidth: 1 }, ticks: { color: COLOR_LABEL, font: { family: FONT_FAMILY, size: 10 }, maxTicksLimit: 8, callback: (v: any) => fmtDate(Number(v)) }, title: { display: true, text: 'Date', color: COLOR_TITLE, font: { family: FONT_FAMILY, size: 12, weight: 'bold' as const } } },
          y: { type: 'linear', min: -0.5, max: events.length - 0.5, reverse: true, border: { color: COLOR_AXIS }, grid: { display: false }, ticks: { color: COLOR_LABEL, font: { family: FONT_FAMILY, size: 11 }, stepSize: 1, callback: (v: any) => { const idx = Math.round(Number(v)); return events[idx]?.label ?? ''; } } }
        }
      } as any,
      plugins: [timelinePlugin]
    } as any);
  }

  // ─── COUNT CARDS RENDERER ─────────────────────────────────────────────
  private renderCountCards(item: ChartItem, canvas: HTMLCanvasElement): Chart | null {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const field          = item.xField || '';
    const selectedValues: string[] = (item as any).countSelectedValues || [];
    const tableName      = (item.tableName || '').toUpperCase();

    // Count card gradients — deliberately distinct from chart PALETTE
    const GRADIENTS: [string, string][] = [
      ['#f97316', '#fb923c'],   // warm orange
      ['#0ea5e9', '#38bdf8'],   // sky blue
      ['#10b981', '#34d399'],   // emerald
      ['#8b5cf6', '#a78bfa'],   // violet
      ['#ef4444', '#f87171'],   // red
      ['#ec4899', '#f472b6'],   // pink
      ['#f59e0b', '#fbbf24'],   // amber
      ['#06b6d4', '#22d3ee'],   // cyan
      ['#84cc16', '#a3e635'],   // lime
      ['#6366f1', '#818cf8'],   // indigo
      ['#14b8a6', '#2dd4bf'],   // teal
      ['#d946ef', '#e879f9'],   // fuchsia
    ];

    const drawCards = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (!field || !item.data?.length) {
        ctx.font = `13px ${FONT_FAMILY}`; ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Select a field to preview count cards', w / 2, h / 2);
        return;
      }

      // Use existing countData helper (handles resolveLabel internally)
      const { labels, values } = this.countData(item, field);

      const pairs: { label: string; count: number }[] = [];
      labels.forEach((lbl, i) => {
        if (selectedValues.length === 0 || selectedValues.includes(lbl))
          pairs.push({ label: lbl, count: values[i] });
      });

      if (pairs.length === 0) {
        ctx.font = `13px ${FONT_FAMILY}`; ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Check values in panel to show count cards', w / 2, h / 2);
        return;
      }

      const cols  = Math.min(pairs.length, 3);
      const rows  = Math.ceil(pairs.length / cols);
      const gap   = 14;
      const cardW = (w - gap * (cols + 1)) / cols;
      const cardH = (h - gap * (rows + 1)) / rows;
      const rad   = 14;

      pairs.forEach((pair, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x   = gap + col * (cardW + gap);
        const y   = gap + row * (cardH + gap);
        const [c1, c2] = GRADIENTS[i % GRADIENTS.length];

        const grad = ctx.createLinearGradient(x, y, x + cardW, y + cardH);
        grad.addColorStop(0, c1); grad.addColorStop(1, c2);

        // Rounded rect
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + rad, y); ctx.lineTo(x + cardW - rad, y);
        ctx.quadraticCurveTo(x + cardW, y, x + cardW, y + rad);
        ctx.lineTo(x + cardW, y + cardH - rad);
        ctx.quadraticCurveTo(x + cardW, y + cardH, x + cardW - rad, y + cardH);
        ctx.lineTo(x + rad, y + cardH);
        ctx.quadraticCurveTo(x, y + cardH, x, y + cardH - rad);
        ctx.lineTo(x, y + rad); ctx.quadraticCurveTo(x, y, x + rad, y);
        ctx.closePath();
        ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
        ctx.fillStyle = grad; ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

        // Decorative circles
        ctx.beginPath(); ctx.arc(x + cardW - 16, y + 16, cardW * 0.30, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.fill();
        ctx.beginPath(); ctx.arc(x + cardW + 4, y + cardH - 8, cardW * 0.20, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();

        // Value label top-left (e.g. "Female")
        const lblSize = Math.max(11, Math.min(15, cardH * 0.16));
        ctx.font = `600 ${lblSize}px ${FONT_FAMILY}`;
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(pair.label, x + 14, y + 13);

        // Count — big bold center
        const numSize = Math.max(24, Math.min(40, cardH * 0.44));
        ctx.font = `800 ${numSize}px ${FONT_FAMILY}`;
        ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle';
        ctx.fillText(pair.count.toLocaleString(), x + 14, y + cardH * 0.54);

        // Table name bottom-left
        const tblSize = Math.max(9, Math.min(11, cardH * 0.12));
        ctx.font = `500 ${tblSize}px ${FONT_FAMILY}`;
        ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.textBaseline = 'bottom';
        ctx.fillText(tableName, x + 14, y + cardH - 10);

        ctx.restore();
      });
    };

    drawCards();

    return new Chart(ctx, {
      type: 'bar',
      data: { datasets: [] },
      options: {
        responsive: false, maintainAspectRatio: false,
        animation: { duration: 0 },
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      } as any,
      plugins: [{
        id: 'countCardsPlugin',
        afterRender() { drawCards(); },
        resize()      { drawCards(); }
      }]
    } as any);
  }


  // ─── TABLE CHART ──────────────────────────────────────────────────────
  renderTableChart(item: ChartItem, canvas: HTMLCanvasElement): Chart | null {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const selectedCols: string[] = item.tableSelectedColumns || [];
    const rowCount: number = item.tableRowCount || 10;
    const rows = (item.data || []).slice(0, rowCount);
    const cols = selectedCols.length > 0
      ? selectedCols
      : (item.fields || (rows.length ? Object.keys(rows[0]) : []));

    // ── Table chart color tokens ──
    const TC_TITLE_BG    = '#0f4c75';   // deep ocean blue title bar
    const TC_TITLE_FG    = '#ffffff';
    const TC_TITLE_META  = 'rgba(255,255,255,0.58)';
    const TC_HEADER_BG   = '#1b6ca8';   // medium blue header
    const TC_HEADER_FG   = '#ffffff';
    const TC_HEADER_DIV  = 'rgba(255,255,255,0.20)';
    const TC_HEADER_LINE = 'rgba(255,255,255,0.35)';
    const TC_ROW_EVEN    = '#ffffff';
    const TC_ROW_ODD     = '#e8f4fd';   // light sky-blue stripe
    const TC_CELL_FG     = '#1e293b';   // dark slate text
    const TC_CELL_DIV    = '#d0e8f7';   // soft blue divider
    const TC_ROW_LINE    = '#cfe2f3';
    const TC_OUTER       = '#1b6ca8';

    const drawTable = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (!cols.length || !rows.length) {
        ctx.font = `13px ${FONT_FAMILY}`; ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Select table & columns to preview', w / 2, h / 2);
        return;
      }
      const TITLE_H = 34, HEADER_H = 30, ROW_H = 26, PAD_X = 10;
      const colW = Math.max(60, Math.floor((w - PAD_X * 2) / cols.length));

      // ── Title bar ──
      const titleGrad = ctx.createLinearGradient(0, 0, w, 0);
      titleGrad.addColorStop(0, '#0f4c75');
      titleGrad.addColorStop(1, '#1b6ca8');
      ctx.fillStyle = titleGrad; ctx.fillRect(0, 0, w, TITLE_H);
      ctx.font = `bold 13px ${FONT_FAMILY}`; ctx.fillStyle = TC_TITLE_FG;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(item.name, PAD_X, TITLE_H / 2);
      ctx.font = `11px ${FONT_FAMILY}`; ctx.fillStyle = TC_TITLE_META;
      ctx.textAlign = 'right';
      ctx.fillText(`${rows.length} of ${item.data?.length ?? 0} rows · ${cols.length} cols`, w - PAD_X, TITLE_H / 2);

      // ── Header row ──
      const headerGrad = ctx.createLinearGradient(0, TITLE_H, 0, TITLE_H + HEADER_H);
      headerGrad.addColorStop(0, '#1b6ca8');
      headerGrad.addColorStop(1, '#1565a0');
      ctx.fillStyle = headerGrad; ctx.fillRect(0, TITLE_H, w, HEADER_H);
      cols.forEach((col, ci) => {
        const x = PAD_X + ci * colW;
        if (ci > 0) { ctx.strokeStyle = TC_HEADER_DIV; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x, TITLE_H + 4); ctx.lineTo(x, TITLE_H + HEADER_H - 4); ctx.stroke(); }
        ctx.font = `bold 11px ${FONT_FAMILY}`; ctx.fillStyle = TC_HEADER_FG;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(col.length > 14 ? col.slice(0, 13) + '\u2026' : col, x + 6, TITLE_H + HEADER_H / 2);
      });
      ctx.strokeStyle = TC_HEADER_LINE; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, TITLE_H + HEADER_H); ctx.lineTo(w, TITLE_H + HEADER_H); ctx.stroke();

      // ── Data rows ──
      rows.forEach((row, ri) => {
        const rowY = TITLE_H + HEADER_H + ri * ROW_H;
        ctx.fillStyle = ri % 2 === 0 ? TC_ROW_EVEN : TC_ROW_ODD;
        ctx.fillRect(0, rowY, w, ROW_H);
        cols.forEach((col, ci) => {
          const x = PAD_X + ci * colW;
          if (ci > 0) { ctx.strokeStyle = TC_CELL_DIV; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(x, rowY + 3); ctx.lineTo(x, rowY + ROW_H - 3); ctx.stroke(); }
          const raw = String(row[col] ?? '');
          ctx.font = `11px ${FONT_FAMILY}`; ctx.fillStyle = TC_CELL_FG;
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(raw.length > 18 ? raw.slice(0, 17) + '\u2026' : raw, x + 6, rowY + ROW_H / 2);
        });
        ctx.strokeStyle = TC_ROW_LINE; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(0, rowY + ROW_H); ctx.lineTo(w, rowY + ROW_H); ctx.stroke();
      });
      // Outer border
      ctx.strokeStyle = TC_OUTER; ctx.lineWidth = 1.5;
      ctx.strokeRect(0.75, 0.75, w - 1.5, Math.min(TITLE_H + HEADER_H + rows.length * ROW_H, h) - 1.5);
    };

    drawTable();
    return new Chart(ctx, {
      type: 'bar', data: { datasets: [] },
      options: { responsive: false, maintainAspectRatio: false, animation: { duration: 0 },
        plugins: { legend: { display: false }, tooltip: { enabled: false } } } as any,
      plugins: [{ id: 'tablePlugin', afterRender() { drawTable(); }, resize() { drawTable(); } }]
    } as any);
  }

  /* ════════════════════════════════════════════════════════════════════
     HELPERS
  ════════════════════════════════════════════════════════════════════ */

  // ── countData — uses resolveLabel for numeric _id fields ─────────────
  private countData(item: ChartItem, dimField: string) {
    const rows = this.filteredData(item);
    if (!rows.length || !dimField) return { labels: [], values: [], total: 0 };
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const rawKey     = String(row[dimField] ?? 'N/A');
      const labelKey   = this.resolveLabel(rawKey, dimField, item);
      counts[labelKey] = (counts[labelKey] ?? 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return { labels: sorted.map(e => e[0]), values: sorted.map(e => e[1]), total: sorted.length };
  }

  // ── xyData — uses resolveLabel for x field ────────────────────────────
  private xyData(item: ChartItem) {
    const rows = this.filteredData(item);
    if (!rows.length) return { labels: [], values: [], total: 0 };
    const xF = item.xField || '';
    const yF = item.yField || '';
    if (xF && yF) {
      const agg: Record<string, number> = {};
      for (const r of rows) {
        const key = this.resolveLabel(r[xF], xF, item);
        const val = parseFloat(r[yF]);
        agg[key]  = (agg[key] ?? 0) + (isNaN(val) ? 0 : val);
      }
      const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]);
      return { labels: sorted.map(e => e[0]), values: sorted.map(e => e[1]), total: sorted.length };
    }
    const labels = rows.map(r => this.resolveLabel(r[xF], xF, item));
    const values = rows.map(r => { const v = parseFloat(r[yF]); return isNaN(v) ? 0 : v; });
    return { labels, values, total: rows.length };
  }

  // ── stackedData — uses resolveLabel for cat and group fields ──────────
  private stackedData(item: ChartItem, catField: string, groupField: string) {
    const rows = this.filteredData(item);
    if (!rows.length || !catField) return { labels: [], datasets: [] };
    const allCats = [...new Set(rows.map(r => this.resolveLabel(r[catField], catField, item)))].slice(0, 12);
    if (!groupField) {
      return {
        labels: allCats,
        datasets: [{
          label: 'Total',
          data: allCats.map(c => rows.filter(r => this.resolveLabel(r[catField], catField, item) === c).length),
          backgroundColor: PALETTE[0] + 'cc', borderColor: PALETTE[0], borderWidth: 1, borderRadius: 4, barPercentage: 0.75
        }]
      };
    }
    const allGroups = [...new Set(rows.map(r => this.resolveLabel(r[groupField], groupField, item)))].slice(0, 8);
    const datasets: ChartDataset[] = allGroups.map((g, i) => ({
      label: g,
      data: allCats.map(c =>
        rows.filter(r =>
          this.resolveLabel(r[catField], catField, item) === c &&
          this.resolveLabel(r[groupField], groupField, item) === g
        ).length
      ),
      backgroundColor: PALETTE[i % PALETTE.length] + 'cc',
      borderColor:     PALETTE[i % PALETTE.length],
      borderWidth: 1, borderRadius: 3, barPercentage: 0.8
    } as any));
    return { labels: allCats, datasets };
  }
}
