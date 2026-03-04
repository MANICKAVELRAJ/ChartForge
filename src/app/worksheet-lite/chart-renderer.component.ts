import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  NgZone
} from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { ChartGenService, ChartItem } from './chart-gen.service';

Chart.register(...registerables);

const HEADER_HEIGHT = 37; // matches .canvas-header height in CSS

@Component({
  selector: 'app-chart-renderer',
  template: `
    <div class="chart-wrap" #wrapRef>
      <canvas #chartCanvas *ngIf="hasData"></canvas>
      <div class="no-data" *ngIf="!hasData">
        <span class="no-data-icon">📊</span>
        <span>Configure chart to preview</span>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .chart-wrap {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #fff;
      border-radius: 0 0 10px 10px;
    }
    canvas {
      display: block;
      position: absolute;
      top: 0;
      left: 0;
    }
    .no-data {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: #90a4ae;
      font-size: 12px;
      font-family: Inter, sans-serif;
      user-select: none;
    }
    .no-data-icon { font-size: 32px; }
  `]
})
export class ChartRendererComponent implements AfterViewInit, OnChanges, OnDestroy {

  @Input() item!: ChartItem;

  @ViewChild('wrapRef',    { static: true  }) wrapRef!:    ElementRef<HTMLDivElement>;
  @ViewChild('chartCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

  hasData        = false;
  private chart: Chart | null = null;
  private ro:     ResizeObserver | null = null;
  private rafId:  number | null = null;

  constructor(
    private chartGen: ChartGenService,
    private zone:     NgZone
  ) {}

  /* ------------------------------------------------------------------ */
  ngAfterViewInit(): void {
    this.setupResizeObserver();
    this.rebuild();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['item']) {
      this.rebuild();
    }
  }

  ngOnDestroy(): void {
    this.destroyChart();
    this.ro?.disconnect();
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }

  /* ------------------------------------------------------------------ */
  private rebuild(): void {
    this.hasData = !!(this.item?.data?.length);

    // Wait one tick so *ngIf renders the <canvas>
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      if (this.hasData) {
        this.renderChart();
      } else {
        this.destroyChart();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  private renderChart(): void {
    if (!this.canvasRef?.nativeElement || !this.item) return;

    const wrap   = this.wrapRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;
    const w      = Math.max(50, wrap.clientWidth);
    const h      = Math.max(50, wrap.clientHeight);

    this.destroyChart();

    /* set pixel dimensions explicitly – no CSS sizing tricks */
    canvas.width        = w;
    canvas.height       = h;
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use ChartGenService to build the Chart.js config
    this.zone.runOutsideAngular(() => {
      this.chart = this.chartGen.renderChart(this.item, canvas);
    });
  }

  /* ------------------------------------------------------------------ */
  private setupResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;

    this.ro = new ResizeObserver(() => {
      // Debounce via rAF to avoid thrash
      if (this.rafId !== null) cancelAnimationFrame(this.rafId);
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.onContainerResize();
      });
    });

    this.ro.observe(this.wrapRef.nativeElement);
  }

  /* ------------------------------------------------------------------ */
  private onContainerResize(): void {
    if (!this.hasData || !this.canvasRef?.nativeElement || !this.chart) return;

    const wrap = this.wrapRef.nativeElement;
    const w    = Math.max(50, wrap.clientWidth);
    const h    = Math.max(50, wrap.clientHeight);

    const canvas        = this.canvasRef.nativeElement;
    canvas.width        = w;
    canvas.height       = h;
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';

    try {
      this.chart.resize(w, h);
    } catch {
      // If resize throws (rare edge-case), recreate
      this.renderChart();
    }
  }

  /* ------------------------------------------------------------------ */
  private destroyChart(): void {
    if (this.chart) {
      try { this.chart.destroy(); } catch { /* ignore */ }
      this.chart = null;
    }
  }
}
