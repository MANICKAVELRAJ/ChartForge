import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import * as XLSX from 'xlsx';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { BehaviorSubject, timer, switchMap, retry, shareReplay } from 'rxjs';
import { ChartItem } from './chart-gen.service';

export interface ChartRequirements {
  selectableX: boolean;
  selectableY: boolean;
  selectableR: boolean;   // ← NEW for bubble
  xLabel: string;
  yLabel: string;
  rLabel: string;         // ← NEW for bubble
}

export interface PageItem {
  id: number;
  page_name: string;
  table_name: string;
}

@Injectable({ providedIn: 'root' })
export class WorksheetLiteService {

  chartTypes: ChartItem[] = [];
  canvasCharts: ChartItem[] = [];

  private workflowFieldsSubject = new BehaviorSubject<string[]>([]);
  workflowFields$ = this.workflowFieldsSubject.asObservable();

  private fieldsSubject = new BehaviorSubject<any[]>([]);
  fields$ = this.fieldsSubject.asObservable();

  fieldsByPageIdMap = new Map<string, any[]>();

  get allFields(): any[] {
    return this.fieldsSubject.value;
  }

  nextId = 1000;
  zIndexCounter = 10;

  canvasEl!: HTMLElement;
  movingIndex: number | null = null;
  offsetX = 0;
  offsetY = 0;

  chartRequirementsMap: Record<string, ChartRequirements> = {
    bar:           { selectableX: false, selectableY: true,  selectableR: false, xLabel: 'Count',    yLabel: 'Field',    rLabel: '' },
    column:        { selectableX: true,  selectableY: false, selectableR: false, xLabel: 'Field',    yLabel: 'Count',    rLabel: '' },
    stackedBar:    { selectableX: true,  selectableY: true,  selectableR: false, xLabel: 'Group By', yLabel: 'Category', rLabel: '' },
    stackedColumn: { selectableX: true,  selectableY: true,  selectableR: false, xLabel: 'Category', yLabel: 'Group By', rLabel: '' },
    pie:           { selectableX: true,  selectableY: true,  selectableR: false, xLabel: 'Category', yLabel: 'Value',    rLabel: '' },
    doughnut:      { selectableX: true,  selectableY: true,  selectableR: false, xLabel: 'Category', yLabel: 'Value',    rLabel: '' },
    bubble:        { selectableX: true,  selectableY: true,  selectableR: true,  xLabel: 'X Field',  yLabel: 'Y Field',  rLabel: 'Radius (Size)' }, // ← NEW
  };

  getChartRequirements(type: string): ChartRequirements {
    return this.chartRequirementsMap[type] || {
      selectableX: true, selectableY: true, selectableR: false,
      xLabel: 'X Field', yLabel: 'Y Field', rLabel: ''
    };
  }

  private pagesSubject = new BehaviorSubject<PageItem[]>([]);
  pages$ = this.pagesSubject.asObservable();

  constructor(
    private http: HttpClient,
    private sanitizer: DomSanitizer
  ) {
    this.loadWorkflow();
    this.loadFields();
    this.loadPages();
  }

  initCanvas(el: HTMLElement): void { this.canvasEl = el; }

  /** Expand worksheet inner size to always fit all chart elements with padding */
  expandCanvas(): void {
    if (!this.canvasEl) return;
    const pad = 40;
    let maxRight  = 0;
    let maxBottom = 0;
    for (const c of this.canvasCharts) {
      const r = (c.x ?? 0) + (c.width  ?? 0);
      const b = (c.y ?? 0) + (c.height ?? 0);
      if (r > maxRight)  maxRight  = r;
      if (b > maxBottom) maxBottom = b;
    }
    const newW = Math.max(maxRight  + pad, this.canvasEl.parentElement?.clientWidth  ?? 600);
    const newH = Math.max(maxBottom + pad, this.canvasEl.parentElement?.clientHeight ?? 400);
    this.canvasEl.style.width  = newW  + 'px';
    this.canvasEl.style.height = newH  + 'px';
    this.canvasEl.style.minWidth  = newW + 'px';
    this.canvasEl.style.minHeight = newH + 'px';
  }

  getFieldsByPageId(pageId: string): any[] {
    return this.fieldsByPageIdMap.get(pageId) || [];
  }

  loadFields(): void {
    timer(0, 10000).pipe(
      switchMap(() => this.http.get<any[]>('assets/fields.json')),
      retry(3),
      shareReplay(1)
    ).subscribe(res => {
      if (!Array.isArray(res)) { this.fieldsSubject.next([]); return; }
      // ✅ Content compare — value change-ஐயும் detect பண்ணும்
      if (JSON.stringify(res) === JSON.stringify(this.fieldsSubject.value)) return;
      const newMap = new Map<string, any[]>();
      res.forEach(f => {
        const pid = String(f.page_id);
        if (pid) {
          if (!newMap.has(pid)) newMap.set(pid, []);
          newMap.get(pid)!.push(f);
        }
      });
      this.fieldsByPageIdMap = newMap;
      this.fieldsSubject.next(res);
    }, err => console.error('Error polling fields.json', err));
  }

  loadPages(): void {
    this.http.get<PageItem[]>('assets/pages.json').subscribe(res => {
      this.pagesSubject.next(Array.isArray(res) && res.length > 0 ? res : []);
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
    const rect   = this.canvasEl.getBoundingClientRect();
    const mouse  = event.event as MouseEvent;
    const width  = 180, height = 140;
    let x = mouse.clientX - rect.left - width / 2;
    let y = mouse.clientY - rect.top  - height / 2;
    [x, y] = this.findFreePosition(x, y, width, height);
    this.canvasCharts.push({ ...draggedChart, id: this.nextId++, x, y, width, height, zIndex: ++this.zIndexCounter });
    this.expandCanvas();
  }

  findFreePosition(x: number, y: number, width: number, height: number, ignoreIndex: number | null = null): [number, number] {
    const gap = 24;
    x = Math.max(0, x);
    y = Math.max(0, y);
    for (let attempt = 0; attempt < 200; attempt++) {
      let overlap = false;
      for (let j = 0; j < this.canvasCharts.length; j++) {
        if (ignoreIndex === j) continue;
        const c = this.canvasCharts[j];
        const hit = !(x + width + gap <= c.x! || x >= c.x! + c.width! + gap || y + height + gap <= c.y! || y >= c.y! + c.height! + gap);
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
    item.y = Math.max(0, event.clientY - rect.top  - this.offsetY);
    this.expandCanvas();
  }

  stopMove(): void {
    if (this.movingIndex === null) return;
    const item = this.canvasCharts[this.movingIndex];
    const [x, y] = this.findFreePosition(item.x!, item.y!, item.width!, item.height!, this.movingIndex);
    item.x = x; item.y = y;
    this.movingIndex = null;
    this.expandCanvas();
  }

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
      <circle cx="6"  cy="18" r="3"   fill="#1a73e8" opacity="0.85"/>
      <circle cx="14" cy="14" r="4.5" fill="#34a853" opacity="0.80"/>
      <circle cx="19" cy="7"  r="2.5" fill="#fbbc05" opacity="0.85"/>
      <circle cx="8"  cy="8"  r="2"   fill="#ea4335" opacity="0.80"/>
      <circle cx="17" cy="18" r="1.5" fill="#46bdc6" opacity="0.85"/>
    </svg>`,
  };

  getChartSvg(type?: string): SafeHtml {
    if (!type) return '';
    return this.sanitizer.bypassSecurityTrustHtml(this.chartSvgMap[type] || '');
  }

  removeChart(id: number): void {
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
          const wb    = XLSX.read((e.target as any).result, { type: 'binary' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(sheet));
        };
        reader.readAsBinaryString(file);
      }
    });
  }
}
