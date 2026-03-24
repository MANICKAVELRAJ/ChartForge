import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import * as XLSX from 'xlsx';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { BehaviorSubject, Subject, timer, switchMap, retry, shareReplay, debounceTime } from 'rxjs';
import { ChartItem } from './chart-gen.service';

// ── Merged from chart-container.model.ts ─────────────────────────────
export interface ChartContainer {
  id?: string;                        // c1, c2, c3 ... format
  project_id: number;
  chart_name: string;
  page: string;                       // table_name
  fields: {
    x: string;
    y: string;
    r?: string;
  };
  x_position: number;
  y_position: number;
  width: number;
  height: number;
  // ── Count chart: selected values saved here ──
  count_selected_values?: string[];
  // ── Normal chart: selected filter values ──
  selected_x_values?: string[];
  selected_y_values?: string[];
  // ── Table chart
  table_row_count?: number;
  table_selected_columns?: string[];
}

export interface ChartRequirements {
  selectableX: boolean;
  selectableY: boolean;
  selectableR: boolean;
  xLabel: string;
  yLabel: string;
  rLabel: string;
}

export interface PageItem {
  id: number;
  page_name: string;
  table_name: string;
}

@Injectable({ providedIn: 'root' })
export class WorksheetLiteService {

  // ── JSON Server API ───────────────────────────────────────────────────
  private readonly API = '/api/chart_containers';

  // Default project_id
  currentProjectId = 1;

  // ── c1, c2, c3 auto-increment counter ────────────────────────────────
  private containerCounter = 0;

  // ── Debounce subject — 400ms wait பண்ணி PATCH பண்ணும் ───────────────
  private updateSubject = new Subject<ChartItem>();

  chartTypes: ChartItem[] = [];
  canvasCharts: ChartItem[] = [];

  private workflowFieldsSubject = new BehaviorSubject<string[]>([]);
  workflowFields$ = this.workflowFieldsSubject.asObservable();

  // ── data.json: { tableName: rows[], ... } ────────────────────────────
  private dataSubject = new BehaviorSubject<Record<string, any[]>>({});
  data$ = this.dataSubject.asObservable();

  // ── Flat fields array — backward compat ──────────────────────────────
  private fieldsSubject = new BehaviorSubject<any[]>([]);
  fields$ = this.fieldsSubject.asObservable();

  // ── tableDataMap: table_name → rows[] (primary lookup) ───────────────
  tableDataMap = new Map<string, any[]>();

  // ── fieldsByPageIdMap: page_id → rows[] (backward compat) ────────────
  fieldsByPageIdMap = new Map<string, any[]>();

  get allFields(): any[] { return this.fieldsSubject.value; }

  nextId = 1000;
  zIndexCounter = 10;

  canvasEl!: HTMLElement;
  movingIndex: number | null = null;
  offsetX = 0;
  offsetY = 0;

  // ── Minimum gap between charts (px) ──────────────────────────────────
  readonly GAP = 16;

  private pagesSubject = new BehaviorSubject<PageItem[]>([]);
  pages$ = this.pagesSubject.asObservable();

  chartRequirementsMap: Record<string, ChartRequirements> = {
    bar: { selectableX: false, selectableY: true, selectableR: false, xLabel: 'Count', yLabel: 'Y Axis', rLabel: '' },
    column: { selectableX: true, selectableY: false, selectableR: false, xLabel: 'X Axis', yLabel: 'Count', rLabel: '' },
    stackedBar: { selectableX: true, selectableY: true, selectableR: false, xLabel: 'Group By', yLabel: 'Category', rLabel: '' },
    stackedColumn: { selectableX: true, selectableY: true, selectableR: false, xLabel: 'Category', yLabel: 'Group By', rLabel: '' },
    pie: { selectableX: true, selectableY: false, selectableR: false, xLabel: 'Category (Count by)', yLabel: '', rLabel: '' },
    doughnut: { selectableX: true, selectableY: true, selectableR: false, xLabel: 'Category', yLabel: 'Value', rLabel: '' },
    bubble: { selectableX: true, selectableY: true, selectableR: true, xLabel: 'X Axis', yLabel: 'Y Axis', rLabel: 'Radius (Size)' },
    gauge: { selectableX: true, selectableY: true, selectableR: false, xLabel: 'Progress Field', yLabel: 'Target Field', rLabel: '' },
    progressBar: { selectableX: true, selectableY: true, selectableR: false, xLabel: 'Label Field', yLabel: 'Value Field', rLabel: '' },
    timeline: { selectableX: true, selectableY: true, selectableR: true, xLabel: 'Event / Task Name', yLabel: 'Start Date', rLabel: 'End Date' },
    count: { selectableX: true, selectableY: false, selectableR: false, xLabel: 'Count Field', yLabel: '', rLabel: '' },
    table: { selectableX: false, selectableY: false, selectableR: false, xLabel: '', yLabel: '', rLabel: '' },
  };

  getChartRequirements(type: string): ChartRequirements {
    return this.chartRequirementsMap[type] || {
      selectableX: true, selectableY: true, selectableR: false,
      xLabel: 'X Axis', yLabel: 'Y Axis', rLabel: ''
    };
  }

  constructor(
    private http: HttpClient,
    private sanitizer: DomSanitizer
  ) {
    this.loadWorkflow();
    this.loadData();
    this.loadPages();

    // ── Debounce setup — 400ms idle ஆனதும் PATCH ──
    this.updateSubject.pipe(
      debounceTime(400)
    ).subscribe(chart => {
      this.updateContainer(chart);
    });
  }

  initCanvas(el: HTMLElement): void { this.canvasEl = el; }

  // ══════════════════════════════════════════════════════════════════════
  //  loadData
  // ══════════════════════════════════════════════════════════════════════

  loadData(): void {
    timer(0, 10000).pipe(
      switchMap(() => this.http.get<Record<string, any[]>>('assets/data.json')),
      retry(3),
      shareReplay(1)
    ).subscribe(res => {
      if (!res || typeof res !== 'object' || Array.isArray(res)) {
        console.warn('loadData: data.json unexpected format');
        return;
      }

      const newTableMap = new Map<string, any[]>();
      Object.entries(res).forEach(([tableName, rows]) => {
        if (Array.isArray(rows)) newTableMap.set(tableName, rows);
      });
      this.tableDataMap = newTableMap;
      this.dataSubject.next(res);

      const pages = this.pagesSubject.value;
      if (pages.length > 0) this.buildFieldsByPageId(pages, res);

      const flat: any[] = [];
      Object.values(res).forEach(rows => {
        if (Array.isArray(rows)) flat.push(...rows);
      });
      if (JSON.stringify(flat) !== JSON.stringify(this.fieldsSubject.value)) {
        this.fieldsSubject.next(flat);
      }

    }, err => console.error('loadData error:', err));
  }

  private buildFieldsByPageId(pages: PageItem[], data: Record<string, any[]>): void {
    const newMap = new Map<string, any[]>();
    pages.forEach(page => {
      const rows = data[page.table_name];
      if (Array.isArray(rows)) newMap.set(String(page.id), rows);
    });
    this.fieldsByPageIdMap = newMap;
  }

  getTableData(tableName: string): any[] {
    return this.tableDataMap.get(tableName) || [];
  }

  getFieldsByPageId(pageId: string): any[] {
    return this.fieldsByPageIdMap.get(pageId) || [];
  }

  scheduleUpdate(chart: ChartItem): void {
    this.updateSubject.next(chart);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  c1, c2, c3 ID Generator
  // ══════════════════════════════════════════════════════════════════════

  private generateContainerId(): string {
    this.containerCounter++;
    return `c${this.containerCounter}`;
  }

  private syncCounterFromContainers(containers: ChartContainer[]): void {
    let max = 0;
    containers.forEach(c => {
      if (c.id && c.id.startsWith('c')) {
        const num = parseInt(c.id.substring(1), 10);
        if (!isNaN(num) && num > max) max = num;
      }
    });
    this.containerCounter = max;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  CRUD — chart_containers (JSON Server)
  // ══════════════════════════════════════════════════════════════════════

  loadContainers(): void {
    this.http
      .get<ChartContainer[]>(`${this.API}?project_id=${this.currentProjectId}`)
      .subscribe(containers => {
        if (!Array.isArray(containers)) return;
        this.syncCounterFromContainers(containers);
        this.canvasCharts = containers.map(c => this.containerToChartItem(c));
        this.expandCanvas();
      }, err => console.error('loadContainers error', err));
  }

  private postContainer(chart: ChartItem): void {
    const payload: ChartContainer = {
      ...this.chartItemToContainer(chart),
      id: this.generateContainerId()
    };
    this.http.post<ChartContainer>(this.API, payload).subscribe(saved => {
      chart.containerId = saved.id;
    }, err => console.error('postContainer error', err));
  }

  updateContainer(chart: ChartItem): void {
    if (!chart.containerId) return;
    const payload = this.chartItemToContainer(chart);
    this.http
      .patch<ChartContainer>(`${this.API}/${chart.containerId}`, payload)
      .subscribe(() => { }, err => console.error('updateContainer error', err));
  }

  deleteContainer(chart: ChartItem): void {
    if (!chart.containerId) return;
    this.http
      .delete(`${this.API}/${chart.containerId}`)
      .subscribe(() => { }, err => console.error('deleteContainer error', err));
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Mapper Helpers
  //  chartItemToContainer — ChartItem → JSON Server payload
  //  containerToChartItem — JSON Server response → ChartItem
  //
  //  COUNT CHART SAVE/LOAD:
  //  countSelectedValues[] → count_selected_values[] field-ஆ save ஆகும்
  //  Load ஆகும்போது count_selected_values → countSelectedValues restore
  // ══════════════════════════════════════════════════════════════════════

  private chartItemToContainer(chart: ChartItem): ChartContainer {
    // ── Only save non-empty field keys ──
    const fields: { x?: string; y?: string; r?: string } = {};
    if (chart.xField) fields.x = chart.xField;
    if (chart.yField) fields.y = chart.yField;
    if (chart.rField) fields.r = chart.rField;

    const container: ChartContainer = {
      project_id: this.currentProjectId,
      chart_name: chart.name,
      page: chart.tableName || '',
      fields: fields as { x: string; y: string; r?: string },
      x_position: Math.round(chart.x ?? 0),
      y_position: Math.round(chart.y ?? 0),
      width: Math.round(chart.width ?? 180),
      height: Math.round(chart.height ?? 140),
    };

    // Count chart: countSelectedValues save பண்ணு (only if non-empty)
    if (chart.type === 'count') {
      const selected: string[] = (chart as any).countSelectedValues || [];
      if (selected.length > 0) container.count_selected_values = [...selected];
    }

    // Normal chart: selected filter values save பண்ணு (only if non-empty)
    if (chart.type !== 'count') {
      const selX: string[] = (chart as any).selectedXValues || [];
      const selY: string[] = (chart as any).selectedYValues || [];
      if (selX.length > 0) container.selected_x_values = [...selX];
      if (selY.length > 0) container.selected_y_values = [...selY];
    }

    // Table chart: save row count + columns
    if (chart.type === 'table') {
      if (chart.tableRowCount) container.table_row_count = chart.tableRowCount;
      if (chart.tableSelectedColumns?.length)
        container.table_selected_columns = [...chart.tableSelectedColumns];
    }

    return container;
  }

  private containerToChartItem(c: ChartContainer): ChartItem {
    const matched = this.chartTypes.find(ct => ct.name === c.chart_name);
    const page = this.pagesSubject.value.find(p => p.table_name === c.page);
    const tableData = this.getTableData(c.page);
    const chartType = matched?.type || 'bar';

    const item: ChartItem = {
      id: this.nextId++,
      containerId: c.id,
      name: c.chart_name,
      type: chartType,
      tableName: c.page,
      tableId: page?.id,
      data: tableData,
      fields: tableData.length ? Object.keys(tableData[0]) : [],
      xField: c.fields?.x || '',
      yField: c.fields?.y || '',
      rField: c.fields?.r || '',
      x: c.x_position,
      y: c.y_position,
      width: c.width,
      height: c.height,
      zIndex: ++this.zIndexCounter,
    };

    // Count chart: count_selected_values restore பண்ணு
    if (chartType === 'count' && Array.isArray(c.count_selected_values)) {
      (item as any).countSelectedValues = [...c.count_selected_values];
    }

    // Normal chart: selected filter values restore பண்ணு
    if (chartType !== 'count' && chartType !== 'table') {
      if (Array.isArray(c.selected_x_values) && c.selected_x_values.length > 0) {
        (item as any).selectedXValues = [...c.selected_x_values];
        (item as any).filteredSelectedXValues = [...c.selected_x_values];
      }
      if (Array.isArray(c.selected_y_values) && c.selected_y_values.length > 0) {
        (item as any).selectedYValues = [...c.selected_y_values];
        (item as any).filteredSelectedYValues = [...c.selected_y_values];
      }
    }

    // Table chart: restore
    if (chartType === 'table') {
      item.tableRowCount = c.table_row_count || 10;
      item.tableSelectedColumns = Array.isArray(c.table_selected_columns) ? [...c.table_selected_columns] : [];
    }

    return item;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  findFreePosition — gap: 16px
  // ══════════════════════════════════════════════════════════════════════

  findFreePosition(
    x: number, y: number,
    width: number, height: number,
    ignoreIndex: number | null = null
  ): [number, number] {
    const gap = this.GAP;
    x = Math.max(0, x);
    y = Math.max(0, y);

    for (let attempt = 0; attempt < 200; attempt++) {
      let overlap = false;
      for (let j = 0; j < this.canvasCharts.length; j++) {
        if (ignoreIndex === j) continue;
        const c = this.canvasCharts[j];
        const hit = !(
          x + width + gap <= c.x! ||
          x >= c.x! + c.width! + gap ||
          y + height + gap <= c.y! ||
          y >= c.y! + c.height! + gap
        );
        if (hit) {
          overlap = true;
          x = c.x! + c.width! + gap;
          if (x + width > (this.canvasEl?.scrollWidth ?? 9999)) {
            x = 0;
            y = c.y! + c.height! + gap;
          }
          break;
        }
      }
      if (!overlap) break;
    }
    return [Math.max(0, x), Math.max(0, y)];
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Canvas Methods
  // ══════════════════════════════════════════════════════════════════════

  expandCanvas(): void {
    if (!this.canvasEl) return;
    const pad = 40;
    let maxRight = 0, maxBottom = 0;
    for (const c of this.canvasCharts) {
      const r = (c.x ?? 0) + (c.width ?? 0);
      const b = (c.y ?? 0) + (c.height ?? 0);
      if (r > maxRight) maxRight = r;
      if (b > maxBottom) maxBottom = b;
    }
    const newW = Math.max(maxRight + pad, this.canvasEl.parentElement?.clientWidth ?? 600);
    const newH = Math.max(maxBottom + pad, this.canvasEl.parentElement?.clientHeight ?? 400);
    this.canvasEl.style.width = newW + 'px';
    this.canvasEl.style.height = newH + 'px';
    this.canvasEl.style.minWidth = newW + 'px';
    this.canvasEl.style.minHeight = newH + 'px';
  }

  loadPages(): void {
    this.http.get<PageItem[]>('assets/pages.json').subscribe(res => {
      const pages = Array.isArray(res) && res.length > 0 ? res : [];
      this.pagesSubject.next(pages);
      const currentData = this.dataSubject.value;
      if (pages.length > 0 && Object.keys(currentData).length > 0) {
        this.buildFieldsByPageId(pages, currentData);
      }
    });
  }

  loadCharts(): Promise<ChartItem[]> {
    return this.http.get<ChartItem[]>('assets/chart.json').toPromise().then(res => {
      this.chartTypes = res || [];
      return this.chartTypes;
    });
  }

  loadWorkflow(): void {
    this.http.get<any[]>('assets/workflowprocess.json').subscribe(res => {
      if (!Array.isArray(res) || res.length === 0) { this.workflowFieldsSubject.next([]); return; }
      this.workflowFieldsSubject.next(Object.keys(res[0]));
    });
  }

  dropOnCanvas(event: CdkDragDrop<any>): void {
    if (event.previousContainer.id !== 'chartList') return;
    const draggedChart = event.item.data as ChartItem;
    const rect = this.canvasEl.getBoundingClientRect();
    const mouse = event.event as MouseEvent;
    const isTable = draggedChart.type === 'table';
    const width  = isTable ? 520 : 180;
    const height = isTable ? 300 : 140;
    let x = mouse.clientX - rect.left - width / 2;
    let y = mouse.clientY - rect.top - height / 2;
    [x, y] = this.findFreePosition(x, y, width, height);
    const newChart: ChartItem = {
      ...draggedChart,
      id: this.nextId++,
      x, y, width, height,
      zIndex: ++this.zIndexCounter,
      ...(isTable ? { tableRowCount: 10, tableSelectedColumns: [] } : {})
    };
    this.canvasCharts.push(newChart);
    this.expandCanvas();
    this.postContainer(newChart);
  }

  startMove(event: MouseEvent, index: number): void {
    this.movingIndex = index;
    const item = this.canvasCharts[index];
    item.zIndex = ++this.zIndexCounter;
    this.offsetX = event.offsetX;
    this.offsetY = event.offsetY;
  }

  moveItem(event: MouseEvent): void {
    if (this.movingIndex === null) return;
    const rect = this.canvasEl.getBoundingClientRect();
    const item = this.canvasCharts[this.movingIndex];
    item.x = Math.max(0, event.clientX - rect.left - this.offsetX);
    item.y = Math.max(0, event.clientY - rect.top - this.offsetY);
    this.expandCanvas();
  }

  stopMove(): void {
    if (this.movingIndex === null) return;
    const item = this.canvasCharts[this.movingIndex];
    const idx = this.movingIndex;
    const [x, y] = this.findFreePosition(
      item.x!, item.y!, item.width!, item.height!, idx
    );
    item.x = x; item.y = y;
    this.movingIndex = null;
    this.expandCanvas();
    this.scheduleUpdate(item);
  }

  removeChart(id: number): void {
    const chart = this.canvasCharts.find(c => c.id === id);
    if (chart) this.deleteContainer(chart);
    this.canvasCharts = this.canvasCharts.filter(c => c.id !== id);
  }

  uploadFile(file: File, progressCallback: (v: number) => void): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!file) return reject('No file selected');
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        progressCallback(progress);
        if (progress >= 100) { clearInterval(interval); this.readFile(file).then(resolve).catch(reject); }
      }, 300);
    });
  }

  readFile(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (file.name.toLowerCase().endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = e => { try { resolve(JSON.parse((e.target as any).result)); } catch { reject('Invalid JSON'); } };
        reader.readAsText(file);
      } else {
        const reader = new FileReader();
        reader.onload = e => {
          const wb = XLSX.read((e.target as any).result, { type: 'binary' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(sheet));
        };
        reader.readAsBinaryString(file);
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  //  resolveLabelPublic — numeric _id values → human label
  // ══════════════════════════════════════════════════════════════════════

  resolveLabelPublic(value: string, fieldName: string): string {
    const builtInMaps: Record<string, Record<string, string>> = {
      gender_id: { '1': 'Male', '2': 'Female', '3': 'Other' },
      salutation_id: { '1': 'Mr', '2': 'Mrs', '3': 'Ms', '4': 'Dr', '5': 'Prof' },
      citizen_id: { '1': 'Citizen', '2': 'PR', '3': 'Foreigner' },
      company_id: { '1': 'Company A', '2': 'Company B', '3': 'Company C' },
    };
    return builtInMaps[fieldName]?.[value] ?? value;
  }

  // ── SVG Map ───────────────────────────────────────────────────────────
  chartSvgMap: Record<string, string> = {
    bar: `<svg viewBox="0 0 24 24">
      <rect x="2" y="2" width="21" height="6" fill="#1e88e5"/>
      <rect x="2" y="10" width="15" height="6" fill="#1e88e5"/>
      <rect x="2" y="18" width="9" height="6" fill="#1e88e5"/>
    </svg>`,
    column: `<svg viewBox="0 0 24 24">
      <rect x="2" y="3" width="6" height="21" fill="#1e88e5"/>
      <rect x="10" y="9" width="6" height="15" fill="#1e88e5"/>
      <rect x="18" y="15" width="6" height="9" fill="#1e88e5"/>
    </svg>`,
    stackedBar: `<svg viewBox="0 0 24 24">
      <rect x="0" y="2" width="5" height="4" fill="#1565c0"/>
      <rect x="5" y="2" width="6" height="4" fill="#1e88e5"/>
      <rect x="11" y="2" width="7" height="4" fill="#42a5f5"/>
      <rect x="0" y="8" width="10" height="4" fill="#1565c0"/>
      <rect x="10" y="8" width="8" height="4" fill="#1e88e5"/>
      <rect x="18" y="8" width="6" height="4" fill="#42a5f5"/>
      <rect x="0" y="14" width="6" height="4" fill="#1565c0"/>
      <rect x="6" y="14" width="9" height="4" fill="#1e88e5"/>
      <rect x="15" y="14" width="6" height="4" fill="#42a5f5"/>
    </svg>`,
    stackedColumn: `<svg viewBox="0 0 24 24">
      <rect x="2" y="19" width="4" height="5" fill="#1565c0"/>
      <rect x="2" y="13" width="4" height="6" fill="#1e88e5"/>
      <rect x="2" y="6" width="4" height="7" fill="#42a5f5"/>
      <rect x="8" y="14" width="4" height="10" fill="#1565c0"/>
      <rect x="8" y="6" width="4" height="8" fill="#1e88e5"/>
      <rect x="8" y="0" width="4" height="6" fill="#42a5f5"/>
      <rect x="14" y="18" width="4" height="6" fill="#1565c0"/>
      <rect x="14" y="9" width="4" height="9" fill="#1e88e5"/>
      <rect x="14" y="3" width="4" height="6" fill="#42a5f5"/>
    </svg>`,
    pie: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="pg1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0d47a1"/><stop offset="100%" stop-color="#1976d2"/>
        </linearGradient>
        <linearGradient id="pg2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1565c0"/><stop offset="100%" stop-color="#42a5f5"/>
        </linearGradient>
        <linearGradient id="pg3" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1e88e5"/><stop offset="100%" stop-color="#90caf9"/>
        </linearGradient>
      </defs>
      <path d="M12 12 L12 2 A10 10 0 0 1 21.5 15 Z" fill="url(#pg1)"/>
      <path d="M12 12 L21.5 15 A10 10 0 0 1 7 21 Z" fill="url(#pg2)"/>
      <path d="M12 12 L7 21 A10 10 0 0 1 12 2 Z" fill="url(#pg3)"/>
    </svg>`,
    doughnut: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2 A10 10 0 0 1 21.5 15 L17 13.5 A5.5 5.5 0 0 0 12 6.5 Z" fill="#0D47A1"/>
      <path d="M21.5 15 A10 10 0 0 1 7 21 L9.5 17 A5.5 5.5 0 0 0 17 13.5 Z" fill="#1565C0"/>
      <path d="M7 21 A10 10 0 0 1 12 2 L12 6.5 A5.5 5.5 0 0 0 9.5 17 Z" fill="#1E88E5"/>
    </svg>`,
    bubble: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6"  cy="18" r="3"   fill="#1a73e8" opacity="0.90"/>
      <circle cx="14" cy="14" r="4.5" fill="#0d47a1" opacity="0.85"/>
      <circle cx="19" cy="7"  r="2.5" fill="#42a5f5" opacity="0.90"/>
      <circle cx="8"  cy="8"  r="2"   fill="#1565c0" opacity="0.85"/>
      <circle cx="17" cy="18" r="1.5" fill="#90caf9" opacity="0.95"/>
    </svg>`,
    gauge: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 15 A9 9 0 0 1 21 15" fill="none" stroke="#bbdefb" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M3 15 A9 9 0 0 1 12.5 6.1" fill="none" stroke="#1565c0" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M12.5 6.1 A9 9 0 0 1 18 8.8" fill="none" stroke="#1e88e5" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M18 8.8 A9 9 0 0 1 21 15" fill="none" stroke="#42a5f5" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="12" y1="15" x2="18.5" y2="9" stroke="#0d47a1" stroke-width="2" stroke-linecap="round"/>
      <circle cx="12" cy="15" r="2.2" fill="#0d47a1"/>
    </svg>`,
    progressBar: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="4"  width="22" height="4" rx="2" fill="#bbdefb"/>
      <rect x="2" y="4"  width="16" height="4" rx="2" fill="#1565c0"/>
      <rect x="2" y="10" width="22" height="4" rx="2" fill="#bbdefb"/>
      <rect x="2" y="10" width="11" height="4" rx="2" fill="#1e88e5"/>
      <rect x="2" y="16" width="22" height="4" rx="2" fill="#bbdefb"/>
      <rect x="2" y="16" width="7"  height="4" rx="2" fill="#42a5f5"/>
    </svg>`,
    timeline: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <line x1="2" y1="20" x2="22" y2="20" stroke="#bbdefb" stroke-width="1.2"/>
      <rect x="2"  y="4"  width="13" height="3.5" rx="1.8" fill="blue"/>
      <circle cx="2"  cy="5.75"  r="1.5" fill="#ffffff" stroke="blue" stroke-width="1.2"/>
      <rect x="6"  y="9.5" width="10" height="3.5" rx="1.8" fill="blue"/>
      <circle cx="6"  cy="11.25" r="1.5" fill="#ffffff" stroke="blue" stroke-width="1.2"/>
      <rect x="10" y="15" width="8"  height="3.5" rx="1.8" fill="blue"/>
      <circle cx="10" cy="16.75" r="1.5" fill="#ffffff" stroke="blue" stroke-width="1.2"/>
      <line x1="2"  y1="19" x2="2"  y2="21" stroke="#90caf9" stroke-width="1.2"/>
      <line x1="8"  y1="19" x2="8"  y2="21" stroke="#90caf9" stroke-width="1.2"/>
      <line x1="14" y1="19" x2="14" y2="21" stroke="#90caf9" stroke-width="1.2"/>
      <line x1="20" y1="19" x2="20" y2="21" stroke="#90caf9" stroke-width="1.2"/>
    </svg>`,
    count: `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#38bdf8"/>
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="22" height="22" rx="6" fill="url(#cg)"/>
    <circle cx="19" cy="5" r="4.5" fill="rgba(255,255,255,0.12)"/>
    <circle cx="20" cy="20" r="3" fill="rgba(255,255,255,0.08)"/>
    <rect x="3" y="3" width="6" height="6" rx="2" fill="rgba(255,255,255,0.25)"/>
    <polyline points="4.5,7 6,5.5 7.5,7" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="6" y1="5.5" x2="6" y2="8" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round"/>
    <rect x="3" y="10" width="6" height="1" rx="0.5" fill="rgba(255,255,255,0.6)"/>
    <rect x="3" y="12.5" width="9" height="1.8" rx="0.9" fill="#ffffff"/>
    <rect x="3" y="16" width="7" height="1" rx="0.5" fill="rgba(255,255,255,0.4)"/>
</svg>
    `,
    table: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="3" width="22" height="18" rx="2" fill="none" stroke="#1e88e5" stroke-width="1.5"/>
      <rect x="1" y="3" width="22" height="5" rx="2" fill="#1565c0"/>
      <rect x="1" y="6" width="22" height="2" fill="#1565c0"/>
      <line x1="8"  y1="3" x2="8"  y2="21" stroke="#bbdefb" stroke-width="0.8"/>
      <line x1="16" y1="3" x2="16" y2="21" stroke="#bbdefb" stroke-width="0.8"/>
      <line x1="1"  y1="11" x2="23" y2="11" stroke="#bbdefb" stroke-width="0.8"/>
      <line x1="1"  y1="15" x2="23" y2="15" stroke="#bbdefb" stroke-width="0.8"/>
      <line x1="1"  y1="19" x2="23" y2="19" stroke="#bbdefb" stroke-width="0.8"/>
      <rect x="2" y="12" width="5" height="2" rx="0.5" fill="#e3f2fd"/>
      <rect x="10" y="12" width="5" height="2" rx="0.5" fill="#e3f2fd"/>
      <rect x="17" y="16" width="5" height="2" rx="0.5" fill="#bbdefb"/>
    </svg>`,
  };

  getChartSvg(type?: string): SafeHtml {
    if (!type) return '';
    return this.sanitizer.bypassSecurityTrustHtml(this.chartSvgMap[type] || '');
  }
}