import { Component, OnInit, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface ChartItem {
  id: number;
  name: string;
  image: string;
}

export interface CanvasItem extends ChartItem {
  x: number;
  y: number;
  zIndex: number;
  instanceId: number;
}

@Component({
  selector: 'app-worksheet',
  templateUrl: './worksheet.component.html',
  styleUrls: ['./worksheet.component.css']
})
export class WorksheetComponent implements OnInit {

  fields: ChartItem[] = [];
  canvasItems: CanvasItem[] = [];

  draggingItem: ChartItem | null = null;
  movingIndex: number | null = null;
  activeIndex: number | null = null;

  offsetX = 0;
  offsetY = 0;

  zIndexCounter = 1;
  instanceCounter = 0;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadCharts();
  }

  /* ================= LOAD CHARTS FROM JSON ================= */
  loadCharts(): void {
    this.http.get<ChartItem[]>('assets/chart.json').subscribe({
      next: (data) => this.fields = data,
      error: (err) => console.error('Failed to load chart.json', err)
    });
  }

  /* ================= LEFT PANEL DRAG ================= */
  startDrag(event: MouseEvent, field: ChartItem): void {
    this.draggingItem = field;
    this.offsetX = event.offsetX;
    this.offsetY = event.offsetY;
  }

  /* ================= DROP ON CANVAS ================= */
  dropOnCanvas(event: MouseEvent): void {
    if (!this.draggingItem) return;

    const canvas = event.currentTarget as HTMLElement;
    const rect = canvas.getBoundingClientRect();

    const x = event.clientX - rect.left - this.offsetX;
    const y = event.clientY - rect.top - this.offsetY;

    this.canvasItems.push({
      ...this.draggingItem,
      x,
      y,
      zIndex: ++this.zIndexCounter,
      instanceId: ++this.instanceCounter
    });

    this.draggingItem = null;
  }

  /* ================= MOVE INSIDE CANVAS ================= */
  startMove(event: MouseEvent, index: number): void {
    event.stopPropagation();

    this.movingIndex = index;
    this.activeIndex = index;

    this.canvasItems[index].zIndex = ++this.zIndexCounter;
    this.offsetX = event.offsetX;
    this.offsetY = event.offsetY;
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.movingIndex === null) return;

    const canvas = document.querySelector('.worksheet') as HTMLElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();

    this.canvasItems[this.movingIndex].x =
      event.clientX - rect.left - this.offsetX;

    this.canvasItems[this.movingIndex].y =
      event.clientY - rect.top - this.offsetY;
  }

  @HostListener('document:mouseup')
  stopMove(): void {
    this.movingIndex = null;
    this.activeIndex = null;
  }

  /* ================= HOVER Z-INDEX ================= */
  onHover(index: number): void {
    this.activeIndex = index;
    this.canvasItems[index].zIndex = ++this.zIndexCounter;
  }

  onLeave(): void {
    this.activeIndex = null;
  }

  /* ================= REMOVE ITEM ================= */
  removeCanvasItem(index: number): void {
    this.canvasItems.splice(index, 1);
  }

  /* ================= SIDENAV TOGGLE ================= */
  toggleSidenav(sidenav: any): void {
    sidenav.toggle();
  }
}
