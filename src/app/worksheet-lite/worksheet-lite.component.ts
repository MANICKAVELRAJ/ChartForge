import {
  Component,
  OnInit,
  AfterViewInit,
  HostListener
} from '@angular/core';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
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
  rFieldDisplayValue = '';   // ← NEW bubble
  isXYEnabled = false;
  chartRequirements: any = null;
  isLivePreview = false;
  posSectionOpen = false;

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

  ngOnInit(): void {
    this.service.loadCharts();
    this.service.loadWorkflow();
    this.service.workflowFields$.subscribe(f => { this.defaultWorkflowFields = f; });
    this.service.fields$.subscribe(fields => {
      if (fields.length > 0) this.updateChartsWithNewData();
    });
    this.service.pages$.subscribe(pages => {
      this.pages = pages || [];
      this.pageTableFields = (pages || []).map(p => p.table_name).filter((v, i, a) => a.indexOf(v) === i);
    });
  }

  ngAfterViewInit(): void {
    const canvas = document.querySelector('.worksheet') as HTMLElement;
    if (canvas) this.service.initCanvas(canvas);
  }

  dropOnCanvas(event: CdkDragDrop<any>): void {
    this.service.dropOnCanvas(event);
    const last = this.service.canvasCharts[this.service.canvasCharts.length - 1];
    if (last) { this.refreshGraph(last); this.openPropertyPanel(last); }
  }

  startMove(event: MouseEvent, index: number): void {
    if ((event.target as HTMLElement).classList.contains('resize-handle')) return;
    this.service.startMove(event, index);
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.resizingIndex !== null) this.doResize(event);
    else this.service.moveItem(event);
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    if (this.resizingIndex !== null) this.stopResize();
    else this.service.stopMove();
  }

  startResize(event: MouseEvent, index: number, direction: string): void {
    event.preventDefault(); event.stopPropagation();
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
    const c   = this.service.canvasCharts[this.resizingIndex];
    const dx  = event.clientX - this.resizeStartX;
    const dy  = event.clientY - this.resizeStartY;
    const dir = this.resizeDirection;
    let newW = this.resizeStartW, newH = this.resizeStartH;
    let newX = this.resizeStartLeft, newY = this.resizeStartTop;
    if (dir.includes('e')) newW = Math.max(this.MIN_W, this.resizeStartW + dx);
    if (dir.includes('w')) { newX = Math.max(0, this.resizeStartLeft + dx); newW = Math.max(this.MIN_W, this.resizeStartLeft + this.resizeStartW - newX); }
    if (dir.includes('s')) newH = Math.max(this.MIN_H, this.resizeStartH + dy);
    if (dir.includes('n')) { newY = Math.max(0, this.resizeStartTop + dy); newH = Math.max(this.MIN_H, this.resizeStartTop + this.resizeStartH - newY); }
    c.width = Math.round(newW); c.height = Math.round(newH); c.x = Math.round(newX); c.y = Math.round(newY);
    this.service.expandCanvas();
  }

  private stopResize(): void { this.resizingIndex = null; this.resizeDirection = ''; }

  openPropertyPanel(chart: ChartItem): void {
    this.isCustomDataUploaded = false;
    this.isXYEnabled = false;
    this.isLivePreview = false;
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
      this.rFieldDisplayValue = this.editableItem.rField || '';  // ← NEW
      this.isLivePreview = true;
    } else if (this.editableItem.tableId) {
      const page = this.pages.find(p => p.id === this.editableItem!.tableId);
      if (page) {
        const td = this.service.allFields.filter(f => f.page_id == page.id);
        this.editableItem.data = td;
        this.editableItem.fields = td.length ? Object.keys(td[0]) : [];
        this.editableItem.isXYEnabled = true;
        this.xFieldDisplayValue = this.editableItem.xField || '';
        this.yFieldDisplayValue = this.editableItem.yField || '';
        this.rFieldDisplayValue = this.editableItem.rField || '';  // ← NEW
        this.isLivePreview = true;
      }
    } else {
      this.editableItem.fields = [];
      this.filteredFields = [];
      this.xFieldDisplayValue = '';
      this.yFieldDisplayValue = '';
      this.rFieldDisplayValue = '';  // ← NEW
    }
    this.editableItem.yField = this.editableItem.yField || '';
    this.editableItem.rField = this.editableItem.rField || '';  // ← NEW
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
    const tableData = this.service.allFields.filter(f => f.page_id == page.id);
    this.editableItem.data = tableData;
    this.editableItem.fields = tableData.length ? Object.keys(tableData[0]) : [];
    this.editableItem.isXYEnabled = true;
    this.editableItem.xField = '';
    this.editableItem.yField = '';
    this.editableItem.rField = '';  // ← NEW
    const rowCount = tableData.length;
    this.snackBar.open(`📊 "${page.table_name}" — ${rowCount.toLocaleString()} row${rowCount !== 1 ? 's' : ''} loaded`, 'OK', { duration: 3500 });
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
    this.pushLiveUpdate();
  }

  onYFieldChange(fieldName: string): void {
    if (!this.editableItem) return;
    this.editableItem.yField = fieldName;
    this.yFieldDisplayValue = fieldName;
    this.warnNulls(fieldName);
    this.autoResizeItem(this.editableItem);
    this.pushLiveUpdate();
  }

  // ← NEW: Bubble R field change
  onRFieldChange(fieldName: string): void {
    if (!this.editableItem) return;
    this.editableItem.rField = fieldName;
    this.rFieldDisplayValue = fieldName;
    this.pushLiveUpdate();
  }

  private pushLiveUpdate(): void {
    if (!this.selectedItem || !this.editableItem) return;
    Object.assign(this.selectedItem, {
      type: this.editableItem.type,
      data: this.editableItem.data,
      xField: this.editableItem.xField,
      yField: this.editableItem.yField,
      rField: this.editableItem.rField,  // ← NEW
      width: this.editableItem.width,
      height: this.editableItem.height,
      x: this.editableItem.x,
      y: this.editableItem.y,
    });
  }

  isChartReady(): boolean {
    if (!this.editableItem) return false;
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
    const [nx, ny] = this.service.findFreePosition(item.x ?? 0, item.y ?? 0, item.width ?? 0, item.height ?? 0, idx);
    item.x = nx; item.y = ny;
    this.pushLiveUpdate();
    this.service.expandCanvas();
  }

  private warnNulls(field: string): void {
    if (!field || !this.editableItem?.data) return;
    const hasNull = this.editableItem.data.some((d: any) => d[field] === null || d[field] === undefined || d[field] === '');
    if (hasNull) this.snackBar.open(`"${field}" contains null/empty values`, 'Close', { duration: 3000 });
  }

  onSizeChange(): void {
    if (!this.editableItem) return;
    if ((this.editableItem.width  ?? 0) < this.MIN_W) this.editableItem.width  = this.MIN_W;
    if ((this.editableItem.height ?? 0) < this.MIN_H) this.editableItem.height = this.MIN_H;
    this.pushLiveUpdate();
    this.service.expandCanvas();
  }

  refreshGraph(item: ChartItem, autoResize = false): void {
    this.chartRequirements = this.service.getChartRequirements(item.type);
    if (autoResize) this.autoResizeItem(item);
  }

  autoResizeItem(item: ChartItem): void {
    const hasData = !!(item.data?.length);
    const hasField = !!(item.xField || item.yField);
    item.width = hasData && hasField ? 420 : this.MIN_W;
    item.height = hasData && hasField ? 320 : this.MIN_H;
  }

  saveChanges(): void {
    if (!this.selectedItem || !this.editableItem) return;
    this.refreshGraph(this.editableItem, false);
    Object.assign(this.selectedItem, this.editableItem);
    this.service.expandCanvas();
    this.cleanupPropertyPanel();
  }

  cancelChanges(): void {
    if (this.selectedItem && this.originalSnapshot) Object.assign(this.selectedItem, this.originalSnapshot);
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
  }

  removeChart(id: number): void {
    this.service.removeChart(id);
    if (this.selectedItem?.id === id) this.cleanupPropertyPanel();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    // Reset input so the same file can be selected again on a different chart
    input.value = '';
    this.uploadProgress = 0;
    this.service.uploadFile(file, p => { this.uploadProgress = p; }).then(data => {
      this.isCustomDataUploaded = true;
      if (this.editableItem) {
        this.editableItem.data = data;
        this.setFieldsForSelectedChart(data);
        this.refreshGraph(this.editableItem, true);
        this.isLivePreview = true;
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
    this.editableItem.rField = '';  // ← NEW
  }

  clearCustomData(): void {
    if (!this.editableItem) return;
    this.isCustomDataUploaded = false;
    this.editableItem.data = [];
    this.editableItem.fields = [];
    this.editableItem.xField = '';
    this.editableItem.yField = '';
    this.editableItem.rField = '';  // ← NEW
    this.isLivePreview = false;
    this.pushLiveUpdate();
  }

  toggleSidebar(): void { this.isSidebarCollapsed = !this.isSidebarCollapsed; }

  updateChartsWithNewData(): void {
    this.service.canvasCharts.forEach(chart => {
      if (!chart.tableId) return;
      const nd = this.service.getFieldsByPageId(String(chart.tableId));
      if (nd?.length) { chart.data = nd; this.refreshGraph(chart, false); }
    });
    if (this.propertyPanelOpen && this.selectedItem?.tableId && this.editableItem) {
      const nd = this.service.getFieldsByPageId(String(this.selectedItem.tableId));
      if (nd?.length) { this.editableItem.data = nd; this.refreshGraph(this.editableItem, false); }
    }
  }
}