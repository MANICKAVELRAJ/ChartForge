import {
  Component,
  OnInit,
  AfterViewInit,
  HostListener
} from '@angular/core';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { filter, take } from 'rxjs/operators';
import { WorksheetLiteService, PageItem } from './worksheet-lite.service';
import { ChartItem } from './chart-gen.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-worksheet-lite',
  templateUrl: './worksheet-lite.component.html',
  styleUrls: ['./worksheet-lite.component.css']
})
export class WorksheetLiteComponent implements OnInit, AfterViewInit {

  isSidebarCollapsed = false;
  uploadProgress = 0;
  uploadedData: any[] = [];
  defaultWorkflowFields: string[] = [];
  isCustomDataUploaded = false;
  propertyPanelOpen = false;
  selectedItem: ChartItem | null = null;
  editableItem: ChartItem | null = null;
  originalSnapshot: ChartItem | null = null;
  pages: PageItem[] = [];
  pageTableFields: string[] = [];
  filteredFields: any[] = [];
  xFieldDisplayValue = '';
  yFieldDisplayValue = '';
  rFieldDisplayValue = '';
  isXYEnabled = false;
  chartRequirements: any = null;
  isLivePreview = false;
  posSectionOpen = false;

  // ── Value preview ─────────────────────────────────────────────────────
  fieldValueCounts: { label: string; count: number; pct: number }[] = [];
  previewField = '';

  // ── Normal chart X/Y value previews ───────────────────────────────────
  xFieldValueCounts: { label: string; count: number; pct: number }[] = [];
  yFieldValueCounts: { label: string; count: number; pct: number }[] = [];
  selectedXValues: string[] = [];
  selectedYValues: string[] = [];

  // ── Count Chart: tracks which values are checked ───────────────────────
  countSelectedValues: string[] = [];

  // ── Table Chart state ──────────────────────────────────────────────────
  tableColumnKeys: string[] = [];
  tableSelectedColumns: string[] = [];
  tableRowCount: number = 10;
  readonly TABLE_MIN_W = 320;
  readonly TABLE_MIN_H = 200;

  private readonly countCardIcons = [
    'trending_up', 'people', 'bar_chart', 'insights', 'star', 'bolt',
    'groups', 'analytics', 'leaderboard', 'tag', 'workspace_premium', 'flag'
  ];

  private _wasDragged = false;
  private _moveStartX = 0;
  private _moveStartY = 0;
  private readonly _DRAG_THRESHOLD = 4;

  private resizingIndex: number | null = null;
  private resizeDirection = '';
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartW = 0;
  private resizeStartH = 0;
  private resizeStartLeft = 0;
  private resizeStartTop = 0;

  readonly MIN_W = 180;
  readonly MIN_H = 140;

  constructor(
    public service: WorksheetLiteService,
    private snackBar: MatSnackBar
  ) { }

  // ══════════════════════════════════════════════════════════════════════
  //  Lifecycle
  // ══════════════════════════════════════════════════════════════════════

  ngOnInit(): void {
    this.service.loadWorkflow();

    this.service.pages$.subscribe(pages => {
      this.pages = pages || [];
      this.pageTableFields = (pages || [])
        .map(p => p.table_name)
        .filter((v, i, a) => a.indexOf(v) === i);
    });

    this.service.data$.subscribe(data => {
      if (Object.keys(data).length > 0) this.updateChartsWithNewData();
    });

    this.service.loadCharts().then(() => {
      this.service.pages$.pipe(
        filter(pages => pages.length > 0), take(1)
      ).subscribe(() => {
        this.service.data$.pipe(
          filter(data => Object.keys(data).length > 0), take(1)
        ).subscribe(() => {
          this.service.loadContainers();
        });
      });
    });
  }

  ngAfterViewInit(): void {
    const canvas = document.querySelector('.worksheet') as HTMLElement;
    if (canvas) this.service.initCanvas(canvas);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Count Chart — Canvas Helpers (used in HTML template)
  // ══════════════════════════════════════════════════════════════════════

  /** chart oda countSelectedValues array return பண்ணும் */
  getCountSelectedValues(chart: ChartItem): string[] {
    return (chart as any).countSelectedValues || [];
  }

  /**
   * chart oda selected values → { label, count }[] return பண்ணும்
   * data-ல இருந்து live count calculate பண்ணும்
   */
  getCountCardData(chart: ChartItem): { label: string; count: number }[] {
    const selected: string[] = (chart as any).countSelectedValues || [];
    if (!selected.length || !chart.data?.length || !chart.xField) return [];

    const field = chart.xField;
    const counts: Record<string, number> = {};

    for (const row of chart.data) {
      const raw = String(row[field] ?? 'N/A');
      const label = this.service.resolveLabelPublic(raw, field);
      counts[label] = (counts[label] ?? 0) + 1;
    }

    return selected
      .filter(label => label in counts)
      .map(label => ({ label, count: counts[label] }));
  }

  /** index-க்கு matching icon return பண்ணும் */
  getCountCardIcon(index: number): string {
    return this.countCardIcons[index % this.countCardIcons.length];
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Canvas Drop
  // ══════════════════════════════════════════════════════════════════════

  dropOnCanvas(event: CdkDragDrop<any>): void {
    this.service.dropOnCanvas(event);
    const last = this.service.canvasCharts[this.service.canvasCharts.length - 1];
    if (last) this.refreshGraph(last);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Drag / Move
  // ══════════════════════════════════════════════════════════════════════

  startMove(event: MouseEvent, index: number): void {
    if ((event.target as HTMLElement).classList.contains('resize-handle')) return;
    this._wasDragged = false;
    this._moveStartX = event.clientX;
    this._moveStartY = event.clientY;
    this.service.startMove(event, index);
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.resizingIndex !== null) {
      this._wasDragged = true;
      this.doResize(event);
    } else if (this.service.movingIndex !== null) {
      const dx = Math.abs(event.clientX - this._moveStartX);
      const dy = Math.abs(event.clientY - this._moveStartY);
      if (dx > this._DRAG_THRESHOLD || dy > this._DRAG_THRESHOLD) this._wasDragged = true;
      this.service.moveItem(event);
    }
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    if (this.resizingIndex !== null) this.stopResize();
    else this.service.stopMove();
    setTimeout(() => { this._wasDragged = false; }, 0);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Resize
  // ══════════════════════════════════════════════════════════════════════

  startResize(event: MouseEvent, index: number, direction: string): void {
    event.preventDefault(); event.stopPropagation();
    this._wasDragged = true;
    const c = this.service.canvasCharts[index];
    this.resizingIndex = index;
    this.resizeDirection = direction;
    this.resizeStartX = event.clientX;
    this.resizeStartY = event.clientY;
    this.resizeStartW = c.width ?? this.MIN_W;
    this.resizeStartH = c.height ?? this.MIN_H;
    this.resizeStartLeft = c.x ?? 0;
    this.resizeStartTop = c.y ?? 0;
  }

  private doResize(event: MouseEvent): void {
    if (this.resizingIndex === null) return;
    const c = this.service.canvasCharts[this.resizingIndex];
    const minW = c.type === 'table' ? this.TABLE_MIN_W : this.MIN_W;
    const minH = c.type === 'table' ? this.TABLE_MIN_H : this.MIN_H;
    const dx = event.clientX - this.resizeStartX;
    const dy = event.clientY - this.resizeStartY;
    const dir = this.resizeDirection;
    let newW = this.resizeStartW, newH = this.resizeStartH;
    let newX = this.resizeStartLeft, newY = this.resizeStartTop;
    if (dir.includes('e')) newW = Math.max(minW, this.resizeStartW + dx);
    if (dir.includes('w')) { newX = Math.max(0, this.resizeStartLeft + dx); newW = Math.max(minW, this.resizeStartLeft + this.resizeStartW - newX); }
    if (dir.includes('s')) newH = Math.max(minH, this.resizeStartH + dy);
    if (dir.includes('n')) { newY = Math.max(0, this.resizeStartTop + dy); newH = Math.max(minH, this.resizeStartTop + this.resizeStartH - newY); }
    c.width = Math.round(newW); c.height = Math.round(newH);
    c.x = Math.round(newX); c.y = Math.round(newY);
    this.service.expandCanvas();
    this.service.scheduleUpdate(c);
  }

  private stopResize(): void {
    if (this.resizingIndex !== null) {
      const c = this.service.canvasCharts[this.resizingIndex];
      const idx = this.resizingIndex;
      const [nx, ny] = this.service.findFreePosition(c.x!, c.y!, c.width!, c.height!, idx);
      c.x = nx; c.y = ny;
      this.service.expandCanvas();
      this.service.scheduleUpdate(c);
    }
    this.resizingIndex = null;
    this.resizeDirection = '';
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Property Panel
  // ══════════════════════════════════════════════════════════════════════

  openPropertyPanel(chart: ChartItem): void {
    if (this._wasDragged) return;
    this.isCustomDataUploaded = false;
    this.isXYEnabled = false;
    this.isLivePreview = false;
    this.fieldValueCounts = [];
    this.xFieldValueCounts = [];
    this.yFieldValueCounts = [];
    this.selectedXValues = (chart as any).selectedXValues ? [...(chart as any).selectedXValues] : [];
    this.selectedYValues = (chart as any).selectedYValues ? [...(chart as any).selectedYValues] : [];
    this.previewField = '';
    this.countSelectedValues = (chart as any).countSelectedValues
      ? [...(chart as any).countSelectedValues] : [];
    // Table chart state
    this.tableSelectedColumns = chart.tableSelectedColumns ? [...chart.tableSelectedColumns] : [];
    this.tableRowCount = chart.tableRowCount ?? 10;
    this.tableColumnKeys = [];
    this.selectedItem = chart;
    this.originalSnapshot = JSON.parse(JSON.stringify(chart));
    this.editableItem = {
      ...chart,
      x: Math.round(chart.x ?? 0),
      y: Math.round(chart.y ?? 0),
      width: Math.round(chart.width ?? this.MIN_W),
      height: Math.round(chart.height ?? this.MIN_H)
    };

    if (this.editableItem.data?.length) {
      this.editableItem.fields = Object.keys(this.editableItem.data[0]);
      this.editableItem.isXYEnabled = true;
      this.xFieldDisplayValue = this.editableItem.xField || '';
      this.yFieldDisplayValue = this.editableItem.yField || '';
      this.rFieldDisplayValue = this.editableItem.rField || '';
      this.isLivePreview = true;
      this.computeFieldValueCounts();
      this.computeXFieldValueCounts();
      this.computeYFieldValueCounts();
      if (this.editableItem.type === 'table') this.tableColumnKeys = this.editableItem.fields || [];
    } else if (this.editableItem.tableId) {
      const page = this.pages.find(p => p.id === this.editableItem!.tableId);
      if (page) {
        const td = this.service.getTableData(page.table_name);
        this.editableItem.data = td;
        this.editableItem.fields = td.length ? Object.keys(td[0]) : [];
        this.editableItem.isXYEnabled = true;
        this.xFieldDisplayValue = this.editableItem.xField || '';
        this.yFieldDisplayValue = this.editableItem.yField || '';
        this.rFieldDisplayValue = this.editableItem.rField || '';
        this.isLivePreview = true;
        this.computeFieldValueCounts();
        this.computeXFieldValueCounts();
        this.computeYFieldValueCounts();
        if (this.editableItem.type === 'table') this.tableColumnKeys = this.editableItem.fields || [];
      }
    } else {
      this.editableItem.fields = [];
      this.filteredFields = [];
      this.xFieldDisplayValue = '';
      this.yFieldDisplayValue = '';
      this.rFieldDisplayValue = '';
    }

    this.editableItem.yField = this.editableItem.yField || '';
    this.editableItem.rField = this.editableItem.rField || '';
    this.chartRequirements = this.service.getChartRequirements(this.editableItem.type);
    this.propertyPanelOpen = true;
  }

  onTableSelect(tableValue: string): void {
    const tableId = +tableValue;
    if (!this.editableItem || !tableId) return;
    const page = this.pages.find(p => p.id == tableId);
    if (!page) return;
    this.editableItem.tableId = +page.id;
    this.editableItem.tableName = page.table_name;
    const tableData = this.service.getTableData(page.table_name);
    this.editableItem.data = tableData;
    this.editableItem.fields = tableData.length ? Object.keys(tableData[0]) : [];
    this.editableItem.isXYEnabled = true;
    this.editableItem.xField = '';
    this.editableItem.yField = '';
    this.editableItem.rField = '';
    this.fieldValueCounts = [];
    this.previewField = '';
    if (this.editableItem.type === 'count') {
      this.countSelectedValues = [];
      (this.editableItem as any).countSelectedValues = [];
    }
    if (this.editableItem.type === 'table') {
      this.tableColumnKeys = this.editableItem.fields || [];
      this.tableSelectedColumns = [];
      this.editableItem.tableSelectedColumns = [];
      this.editableItem.tableRowCount = this.tableRowCount;
    }
    const rowCount = tableData.length;
    this.snackBar.open(
      `📊 "${page.table_name}" — ${rowCount.toLocaleString()} rows loaded`,
      'OK', { duration: 3500 }
    );
    this.chartRequirements = this.service.getChartRequirements(this.editableItem.type);
    this.isLivePreview = true;
    this.refreshGraph(this.editableItem, true);
    this.pushLiveUpdate();
  }

  onXFieldChange(fieldName: string): void {
    if (!this.editableItem) return;
    this.editableItem.xField = fieldName;
    this.xFieldDisplayValue = fieldName;
    this.warnNulls(fieldName);
    this.autoResizeItem(this.editableItem);
    if (this.editableItem.type === 'count') {
      this.countSelectedValues = [];
      (this.editableItem as any).countSelectedValues = [];
    } else {
      this.selectedXValues = [];
      (this.editableItem as any).selectedXValues = [];
      this.computeXFieldValueCounts();
    }
    this.computeFieldValueCounts();
    this.pushLiveUpdate();
  }

  onYFieldChange(fieldName: string): void {
    if (!this.editableItem) return;
    this.editableItem.yField = fieldName;
    this.yFieldDisplayValue = fieldName;
    this.warnNulls(fieldName);
    this.autoResizeItem(this.editableItem);
    if (this.editableItem.type !== 'count') {
      this.selectedYValues = [];
      (this.editableItem as any).selectedYValues = [];
      this.computeYFieldValueCounts();
    }
    this.computeFieldValueCounts();
    this.pushLiveUpdate();
  }

  onRFieldChange(fieldName: string): void {
    if (!this.editableItem) return;
    this.editableItem.rField = fieldName;
    this.rFieldDisplayValue = fieldName;
    this.computeFieldValueCounts();
    this.pushLiveUpdate();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  computeFieldValueCounts — count chart மட்டும்
  // ══════════════════════════════════════════════════════════════════════

  computeFieldValueCounts(): void {
    if (this.editableItem?.type !== 'count') {
      this.fieldValueCounts = [];
      return;
    }
    const field = this.editableItem?.xField || '';
    this.previewField = field;
    if (!field || !this.editableItem?.data?.length) {
      this.fieldValueCounts = [];
      return;
    }
    const data = this.editableItem.data;
    const counts: Record<string, number> = {};
    for (const row of data) {
      const raw = String(row[field] ?? 'N/A');
      const label = this.service.resolveLabelPublic(raw, field);
      counts[label] = (counts[label] ?? 0) + 1;
    }
    const total = data.length;
    this.fieldValueCounts = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({
        label,
        count,
        pct: Math.round((count / total) * 100)
      }));
  }

  // ── Normal chart X field value preview ────────────────────────────────
  computeXFieldValueCounts(): void {
    if (!this.editableItem || this.editableItem.type === 'count') {
      this.xFieldValueCounts = [];
      return;
    }
    const field = this.editableItem.xField || '';
    if (!field || !this.editableItem.data?.length) {
      this.xFieldValueCounts = [];
      return;
    }
    this.xFieldValueCounts = this.buildValueCounts(this.editableItem.data, field);
  }

  // ── Normal chart Y field value preview ────────────────────────────────
  computeYFieldValueCounts(): void {
    if (!this.editableItem || this.editableItem.type === 'count') {
      this.yFieldValueCounts = [];
      return;
    }
    const field = this.editableItem.yField || '';
    if (!field || !this.editableItem.data?.length) {
      this.yFieldValueCounts = [];
      return;
    }
    this.yFieldValueCounts = this.buildValueCounts(this.editableItem.data, field);
  }

  private buildValueCounts(data: any[], field: string): { label: string; count: number; pct: number }[] {
    const counts: Record<string, number> = {};
    for (const row of data) {
      const raw = String(row[field] ?? 'N/A');
      const label = this.service.resolveLabelPublic(raw, field);
      counts[label] = (counts[label] ?? 0) + 1;
    }
    const total = data.length;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count, pct: Math.round((count / total) * 100) }));
  }

  // ── X value checkbox toggle ───────────────────────────────────────────
  isXValueSelected(label: string): boolean {
    return this.selectedXValues.includes(label);
  }

  toggleXValue(label: string, event: Event): void {
    if (!this.editableItem) return;
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      if (!this.selectedXValues.includes(label))
        this.selectedXValues = [...this.selectedXValues, label];
    } else {
      this.selectedXValues = this.selectedXValues.filter(v => v !== label);
    }
    (this.editableItem as any).selectedXValues = [...this.selectedXValues];
    this.applyValueFilterAndUpdate();
  }

  // ── Y value checkbox toggle ───────────────────────────────────────────
  isYValueSelected(label: string): boolean {
    return this.selectedYValues.includes(label);
  }

  toggleYValue(label: string, event: Event): void {
    if (!this.editableItem) return;
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      if (!this.selectedYValues.includes(label))
        this.selectedYValues = [...this.selectedYValues, label];
    } else {
      this.selectedYValues = this.selectedYValues.filter(v => v !== label);
    }
    (this.editableItem as any).selectedYValues = [...this.selectedYValues];
    this.applyValueFilterAndUpdate();
  }

  // ── Filter data based on selected X/Y values and push live update ─────
  private applyValueFilterAndUpdate(): void {
    if (!this.editableItem) return;
    (this.editableItem as any).filteredSelectedXValues = [...this.selectedXValues];
    (this.editableItem as any).filteredSelectedYValues = [...this.selectedYValues];
    this.pushLiveUpdate();
  }

  // ── Stepper helpers for Position & Size inputs ─────────────────────────
  stepX(delta: number): void {
    if (!this.editableItem) return;
    this.editableItem.x = Math.max(0, (this.editableItem.x ?? 0) + delta);
    this.checkOverlapLive(this.editableItem);
  }

  stepY(delta: number): void {
    if (!this.editableItem) return;
    this.editableItem.y = Math.max(0, (this.editableItem.y ?? 0) + delta);
    this.checkOverlapLive(this.editableItem);
  }

  stepWidth(delta: number): void {
    if (!this.editableItem) return;
    this.editableItem.width = Math.max(this.MIN_W, (this.editableItem.width ?? this.MIN_W) + delta);
    this.onSizeChange();
  }

  stepHeight(delta: number): void {
    if (!this.editableItem) return;
    this.editableItem.height = Math.max(this.MIN_H, (this.editableItem.height ?? this.MIN_H) + delta);
    this.onSizeChange();
  }

  private pushLiveUpdate(): void {
    if (!this.selectedItem || !this.editableItem) return;
    Object.assign(this.selectedItem, {
      type: this.editableItem.type,
      data: this.editableItem.data,
      xField: this.editableItem.xField,
      yField: this.editableItem.yField,
      rField: this.editableItem.rField,
      width: this.editableItem.width,
      height: this.editableItem.height,
      x: this.editableItem.x,
      y: this.editableItem.y,
      countSelectedValues: (this.editableItem as any).countSelectedValues,
      selectedXValues: (this.editableItem as any).selectedXValues,
      selectedYValues: (this.editableItem as any).selectedYValues,
      filteredSelectedXValues: (this.editableItem as any).filteredSelectedXValues,
      filteredSelectedYValues: (this.editableItem as any).filteredSelectedYValues,
      tableRowCount: this.editableItem.tableRowCount,
      tableSelectedColumns: this.editableItem.tableSelectedColumns,
    });
  }

  isChartReady(): boolean {
    if (!this.editableItem) return false;
    if (this.editableItem.type === 'table') return this.isTableChartConfigured();
    const req = this.chartRequirements;
    if (!req) return false;
    const xOk = !req.selectableX || !!this.editableItem.xField;
    const yOk = !req.selectableY || !!this.editableItem.yField;
    return !!(this.editableItem.data?.length) && xOk && yOk;
  }

  togglePosSection(): void { this.posSectionOpen = !this.posSectionOpen; }

  checkOverlapLive(item: ChartItem): void {
    if (!item) return;
    const idx = this.service.canvasCharts.findIndex(c => c.id === item.id);
    if (idx === -1) return;
    const [nx, ny] = this.service.findFreePosition(
      item.x ?? 0, item.y ?? 0, item.width ?? 0, item.height ?? 0, idx
    );
    item.x = nx; item.y = ny;
    this.pushLiveUpdate();
    this.service.expandCanvas();
    if (this.selectedItem) this.service.scheduleUpdate(this.selectedItem);
  }

  private warnNulls(field: string): void {
    if (!field || !this.editableItem?.data) return;
    const hasNull = this.editableItem.data.some(
      (d: any) => d[field] === null || d[field] === undefined || d[field] === ''
    );
    if (hasNull) this.snackBar.open(`"${field}" contains null/empty values`, 'Close', { duration: 3000 });
  }

  onSizeChange(): void {
    if (!this.editableItem) return;
    if ((this.editableItem.width ?? 0) < this.MIN_W) this.editableItem.width = this.MIN_W;
    if ((this.editableItem.height ?? 0) < this.MIN_H) this.editableItem.height = this.MIN_H;
    const idx = this.service.canvasCharts.findIndex(c => c.id === this.editableItem!.id);
    if (idx !== -1) {
      const [nx, ny] = this.service.findFreePosition(
        this.editableItem.x ?? 0, this.editableItem.y ?? 0,
        this.editableItem.width ?? this.MIN_W, this.editableItem.height ?? this.MIN_H, idx
      );
      this.editableItem.x = nx; this.editableItem.y = ny;
    }
    this.pushLiveUpdate();
    this.service.expandCanvas();
    if (this.selectedItem) {
      this.selectedItem.width = this.editableItem.width;
      this.selectedItem.height = this.editableItem.height;
      this.selectedItem.x = this.editableItem.x;
      this.selectedItem.y = this.editableItem.y;
      this.service.scheduleUpdate(this.selectedItem);
    }
  }

  refreshGraph(item: ChartItem, autoResize = false): void {
    this.chartRequirements = this.service.getChartRequirements(item.type);
    if (autoResize) this.autoResizeItem(item);
  }

  autoResizeItem(item: ChartItem): void {
    if (item.type === 'table') {
      const colCount = item.tableSelectedColumns?.length || 1;
      const rowCount = item.tableRowCount || 10;
      const colW = Math.max(80, Math.min(140, 600 / colCount));
      item.width = Math.max(this.TABLE_MIN_W, Math.round(colCount * colW + 40));
      item.height = Math.max(this.TABLE_MIN_H, Math.round(32 + 30 + rowCount * 26 + 20));
      return;
    }
    if (item.type === 'count') {
      const selectedCount = ((item as any).countSelectedValues?.length) || 0;
      if (selectedCount === 0) {
        item.width = this.MIN_W;
        item.height = this.MIN_H;
      } else {
        const cols = selectedCount <= 1 ? 1 : selectedCount <= 4 ? 2 : 3;
        const rows = Math.ceil(selectedCount / cols);
        item.width = Math.max(this.MIN_W, cols * 160 + (cols + 1) * 10);
        item.height = Math.max(this.MIN_H, rows * 120 + (rows + 1) * 10);
      }
      return;
    }
    const hasData = !!(item.data?.length);
    const hasField = !!(item.xField || item.yField);
    item.width = hasData && hasField ? 420 : this.MIN_W;
    item.height = hasData && hasField ? 320 : this.MIN_H;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Save / Cancel
  // ══════════════════════════════════════════════════════════════════════

  saveChanges(): void {
    if (!this.selectedItem || !this.editableItem) return;
    this.refreshGraph(this.editableItem, false);
    const idx = this.service.canvasCharts.findIndex(c => c.id === this.selectedItem!.id);
    if (idx !== -1) {
      this.service.canvasCharts[idx] = {
        ...this.editableItem,
        containerId: this.service.canvasCharts[idx].containerId
      };
      this.selectedItem = this.service.canvasCharts[idx];
    } else {
      Object.assign(this.selectedItem, this.editableItem);
    }
    this.service.updateContainer(this.selectedItem);
    this.service.expandCanvas();
    this.cleanupPropertyPanel();
  }

  cancelChanges(): void {
    if (this.selectedItem && this.originalSnapshot) {
      const idx = this.service.canvasCharts.findIndex(c => c.id === this.selectedItem!.id);
      if (idx !== -1) this.service.canvasCharts[idx] = { ...this.originalSnapshot };
      else Object.assign(this.selectedItem, this.originalSnapshot);
    }
    this.cleanupPropertyPanel();
  }

  cleanupPropertyPanel(): void {
    this.propertyPanelOpen = false;
    this.selectedItem = null;
    this.editableItem = null;
    this.originalSnapshot = null;
    this.uploadProgress = 0;
    this.isLivePreview = false;
    this.posSectionOpen = false;
    this.fieldValueCounts = [];
    this.xFieldValueCounts = [];
    this.yFieldValueCounts = [];
    this.selectedXValues = [];
    this.selectedYValues = [];
    this.previewField = '';
    this.tableColumnKeys = [];
    this.tableSelectedColumns = [];
    this.tableRowCount = 10;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Remove
  // ══════════════════════════════════════════════════════════════════════

  removeChart(id: number): void {
    this.service.removeChart(id);
    if (this.selectedItem?.id === id) this.cleanupPropertyPanel();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Clear All — current page எல்லா charts-உம் delete பண்ணும்
  // ══════════════════════════════════════════════════════════════════════

  clearAllCharts(): void {
    if (this.service.canvasCharts.length === 0) return;
    // Property panel open இருந்தா close பண்ணு
    if (this.propertyPanelOpen) this.cleanupPropertyPanel();
    // எல்லா charts-உம் JSON server-லயும் delete பண்ணு
    [...this.service.canvasCharts].forEach(chart => {
      this.service.deleteContainer(chart);
    });
    // Canvas clear பண்ணு
    this.service.canvasCharts = [];
    this.service.expandCanvas();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  File Upload
  // ══════════════════════════════════════════════════════════════════════

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    input.value = '';
    this.uploadProgress = 0;
    this.service.uploadFile(file, p => { this.uploadProgress = p; }).then(data => {
      this.isCustomDataUploaded = true;
      if (this.editableItem) {
        this.editableItem.data = data;
        this.setFieldsForSelectedChart(data);
        this.refreshGraph(this.editableItem, true);
        this.isLivePreview = true;
        this.computeFieldValueCounts();
        this.pushLiveUpdate();
      }
      this.uploadProgress = 100;
      setTimeout(() => { this.uploadProgress = 0; }, 2000);
    });
  }

  setFieldsForSelectedChart(data: any[]): void {
    if (!data?.length || !this.editableItem) return;
    this.editableItem.fields = Object.keys(data[0]);
    this.editableItem.valueField = '';
    this.editableItem.xField = '';
    this.editableItem.yField = '';
    this.editableItem.rField = '';
  }

  clearCustomData(): void {
    if (!this.editableItem) return;
    this.isCustomDataUploaded = false;
    this.editableItem.data = [];
    this.editableItem.fields = [];
    this.editableItem.xField = '';
    this.editableItem.yField = '';
    this.editableItem.rField = '';
    this.isLivePreview = false;
    this.fieldValueCounts = [];
    this.previewField = '';
    this.pushLiveUpdate();
  }

  toggleSidebar(): void { this.isSidebarCollapsed = !this.isSidebarCollapsed; }


  // ══════════════════════════════════════════════════════════════════════
  //  Table Chart helpers
  // ══════════════════════════════════════════════════════════════════════

  getTableSelectedColumns(chart: ChartItem): string[] {
    return chart.tableSelectedColumns || [];
  }

  getTableRowCount(chart: ChartItem): number {
    return chart.tableRowCount || 10;
  }

  isTableChartReady(chart: ChartItem): boolean {
    return !!(chart.data?.length && (chart.tableSelectedColumns?.length ?? 0) > 0);
  }

  isTableColumnSelected(col: string): boolean {
    return this.tableSelectedColumns.includes(col);
  }

  toggleTableColumn(col: string, event: Event): void {
    if (!this.editableItem || this.editableItem.type !== 'table') return;
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      if (!this.tableSelectedColumns.includes(col))
        this.tableSelectedColumns = [...this.tableSelectedColumns, col];
    } else {
      this.tableSelectedColumns = this.tableSelectedColumns.filter(c => c !== col);
    }
    this.editableItem.tableSelectedColumns = [...this.tableSelectedColumns];
    this.autoResizeItem(this.editableItem);
    this.pushLiveUpdate();
  }

  selectAllTableColumns(): void {
    if (!this.editableItem || this.editableItem.type !== 'table') return;
    this.tableSelectedColumns = [...this.tableColumnKeys];
    this.editableItem.tableSelectedColumns = [...this.tableSelectedColumns];
    this.autoResizeItem(this.editableItem);
    this.pushLiveUpdate();
  }

  clearAllTableColumns(): void {
    if (!this.editableItem || this.editableItem.type !== 'table') return;
    this.tableSelectedColumns = [];
    this.editableItem.tableSelectedColumns = [];
    this.pushLiveUpdate();
  }

  onTableRowCountChange(value: number): void {
    if (!this.editableItem || this.editableItem.type !== 'table') return;
    const max = this.editableItem.data?.length || 9999;
    const safe = Math.max(1, Math.min(isNaN(value) ? 1 : value, max));
    this.tableRowCount = safe;
    this.editableItem.tableRowCount = safe;
    this.autoResizeItem(this.editableItem);
    this.pushLiveUpdate();
  }

  isTableChartConfigured(): boolean {
    return !!(this.editableItem?.type === 'table' &&
      this.editableItem?.data?.length &&
      this.tableSelectedColumns.length > 0);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Count Chart checkbox helpers
  // ══════════════════════════════════════════════════════════════════════

  isCountCardSelected(label: string): boolean {
    return this.countSelectedValues.includes(label);
  }

  toggleCountCard(vp: { label: string; count: number; pct: number }, event: Event): void {
    if (!this.editableItem || this.editableItem.type !== 'count') return;
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      if (!this.countSelectedValues.includes(vp.label))
        this.countSelectedValues = [...this.countSelectedValues, vp.label];
    } else {
      this.countSelectedValues = this.countSelectedValues.filter(v => v !== vp.label);
    }
    (this.editableItem as any).countSelectedValues = [...this.countSelectedValues];
    this.autoResizeItem(this.editableItem);
    this.pushLiveUpdate();
  }


  // ══════════════════════════════════════════════════════════════════════
  //  Select All / None helpers — X, Y, Count value previews
  // ══════════════════════════════════════════════════════════════════════

  // ── X field master checkbox ─────────────────────────────────────────────
  isAllXSelected(): boolean {
    return this.xFieldValueCounts.length > 0 &&
      this.selectedXValues.length === this.xFieldValueCounts.length;
  }

  isXIndeterminate(): boolean {
    return this.selectedXValues.length > 0 &&
      this.selectedXValues.length < this.xFieldValueCounts.length;
  }

  toggleAllXValues(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) { this.selectAllXValues(); } else { this.clearAllXValues(); }
  }

  selectAllXValues(): void {
    if (!this.editableItem) return;
    this.selectedXValues = this.xFieldValueCounts.map(v => v.label);
    (this.editableItem as any).selectedXValues = [...this.selectedXValues];
    this.applyValueFilterAndUpdate();
  }

  clearAllXValues(): void {
    if (!this.editableItem) return;
    this.selectedXValues = [];
    (this.editableItem as any).selectedXValues = [];
    this.applyValueFilterAndUpdate();
  }

  // ── Y field master checkbox ─────────────────────────────────────────────
  isAllYSelected(): boolean {
    return this.yFieldValueCounts.length > 0 &&
      this.selectedYValues.length === this.yFieldValueCounts.length;
  }

  isYIndeterminate(): boolean {
    return this.selectedYValues.length > 0 &&
      this.selectedYValues.length < this.yFieldValueCounts.length;
  }

  toggleAllYValues(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) { this.selectAllYValues(); } else { this.clearAllYValues(); }
  }

  selectAllYValues(): void {
    if (!this.editableItem) return;
    this.selectedYValues = this.yFieldValueCounts.map(v => v.label);
    (this.editableItem as any).selectedYValues = [...this.selectedYValues];
    this.applyValueFilterAndUpdate();
  }

  clearAllYValues(): void {
    if (!this.editableItem) return;
    this.selectedYValues = [];
    (this.editableItem as any).selectedYValues = [];
    this.applyValueFilterAndUpdate();
  }

  // ── Count chart master checkbox ──────────────────────────────────────────
  isAllCountSelected(): boolean {
    return this.fieldValueCounts.length > 0 &&
      this.countSelectedValues.length === this.fieldValueCounts.length;
  }

  isCountIndeterminate(): boolean {
    return this.countSelectedValues.length > 0 &&
      this.countSelectedValues.length < this.fieldValueCounts.length;
  }

  toggleAllCountValues(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) { this.selectAllCountValues(); } else { this.clearAllCountValues(); }
  }

  selectAllCountValues(): void {
    if (!this.editableItem || this.editableItem.type !== 'count') return;
    this.countSelectedValues = this.fieldValueCounts.map(v => v.label);
    (this.editableItem as any).countSelectedValues = [...this.countSelectedValues];
    this.autoResizeItem(this.editableItem);
    this.pushLiveUpdate();
  }

  clearAllCountValues(): void {
    if (!this.editableItem || this.editableItem.type !== 'count') return;
    this.countSelectedValues = [];
    (this.editableItem as any).countSelectedValues = [];
    this.autoResizeItem(this.editableItem);
    this.pushLiveUpdate();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  updateChartsWithNewData — data.json poll update
  // ══════════════════════════════════════════════════════════════════════

  updateChartsWithNewData(): void {
    this.service.canvasCharts.forEach(chart => {
      if (!chart.tableName) return;
      const nd = this.service.getTableData(chart.tableName);
      if (nd?.length) { chart.data = nd; this.refreshGraph(chart, false); }
    });
    if (this.propertyPanelOpen && this.selectedItem?.tableName && this.editableItem) {
      const nd = this.service.getTableData(this.selectedItem.tableName);
      if (nd?.length) {
        this.editableItem.data = nd;
        this.refreshGraph(this.editableItem, false);
        this.computeFieldValueCounts();
      }
    }
  }
}
