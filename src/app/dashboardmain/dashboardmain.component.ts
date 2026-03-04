import { Component } from '@angular/core';
import {
  CdkDragDrop,
  transferArrayItem,
  moveItemInArray,
  CdkDragEnd
} from '@angular/cdk/drag-drop';

export interface ChartItem {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

@Component({
  selector: 'app-dashboardmain',
  templateUrl: './dashboardmain.component.html',
  styleUrl: './dashboardmain.component.css'
})
export class DashboardmainComponent {

  allFields: string[] = [
    'Order Date',
    'Category',
    'Sub-Category',
    'Sales',
    'Profit',
    'Quantity'
  ];

  fields: string[] = [
    'Order Date',
    'Category',
    'Sub-Category',
    'Sales',
    'Profit',
    'Quantity'
  ];

  columns: string[] = [];
  rows: string[] = [];

  dragOverShelf: string = '';

  // Chart types available in Analytics tab
  chartTypes: string[] = [
    'Bar Chart',
    'Line Chart',
    'Pie Chart',
    'Area Chart',
    'Scatter Plot',
    'Heat Map'
  ];

  // Charts dropped in canvas area
  canvasCharts: ChartItem[] = [];

  // Track next chart ID
  nextChartId: number = 1;

  drop(event: CdkDragDrop<string[]>) {
    console.log('Drop event:', event);
    
    this.dragOverShelf = '';
    
    if (event.previousContainer === event.container) {
      
      moveItemInArray(
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );
    } else {
      
      const draggedField = event.previousContainer.data[event.previousIndex];
      
      // Check if dragging from field list
      if (event.previousContainer.id === 'field-list') {
        
        const targetShelf = event.container.id;
        
        if (targetShelf === 'columnsList') {
          
          if (this.columns.includes(draggedField)) {
            console.log(`Field "${draggedField}" is already in Columns. Cannot add duplicate.`);
            return; 
          }
        } else if (targetShelf === 'rowsList') {
          
          if (this.rows.includes(draggedField)) {
            console.log(`Field "${draggedField}" is already in Rows. Cannot add duplicate.`);
            return; 
          }
        }
        
        event.container.data.splice(event.currentIndex, 0, draggedField);
        
      } 
      // Moving between shelves or from shelves to field list
      else {
        
        const draggedField = event.previousContainer.data[event.previousIndex];
        const targetShelf = event.container.id;
        
        if (targetShelf === 'columnsList') {
          
          if (this.columns.includes(draggedField)) {
            console.log(`Field "${draggedField}" is already in Columns. Cannot move to Columns.`);
            return; 
          }
        } else if (targetShelf === 'rowsList') {
          
          if (this.rows.includes(draggedField)) {
            console.log(`Field "${draggedField}" is already in Rows. Cannot move to Rows.`);
            return; 
          }
        }
        
        transferArrayItem(
          event.previousContainer.data,
          event.container.data,
          event.previousIndex,
          event.currentIndex
        );
      }
    }
    
    console.log('Fields:', this.fields);
    console.log('Columns:', this.columns);
    console.log('Rows:', this.rows);
    console.log('Canvas Charts:', this.canvasCharts);
  }

  // Handle chart drop in canvas
  dropOnCanvas(event: CdkDragDrop<any>) {
    console.log('Drop on canvas:', event);
    
    if (event.previousContainer.id === 'chartList') {
      const chartName = event.previousContainer.data[event.previousIndex];
      
      // Get the mouse position from the original event
      const originalEvent = event.event as MouseEvent;
      
      // Get canvas position
      const canvasElement = document.querySelector('.worksheet-canvas');
      if (canvasElement) {
        const canvasRect = canvasElement.getBoundingClientRect();
        
        // Calculate drop position relative to canvas
        // Use the mouse position from the original event
        const dropX = originalEvent.clientX;
        const dropY = originalEvent.clientY;
        
        // Calculate position relative to canvas
        const relativeX = dropX - canvasRect.left;
        const relativeY = dropY - canvasRect.top;
        
        // Create new chart at exact drop position
        const newChart: ChartItem = {
          id: this.nextChartId++,
          name: chartName,
          type: this.getChartType(chartName),
          x: relativeX - 90, // Half of chart width for centering
          y: relativeY - 60, // Half of chart height for centering
          width: 180,
          height: 200
        };
        
        // Ensure chart stays within canvas bounds
        const minX = 10;
        const minY = 10;
        const maxX = canvasRect.width - newChart.width - 10;
        const maxY = canvasRect.height - newChart.height - 10;
        
        newChart.x = Math.max(minX, Math.min(newChart.x, maxX));
        newChart.y = Math.max(minY, Math.min(newChart.y, maxY));
        
        this.canvasCharts.push(newChart);
        console.log('New chart added at position:', newChart.x, newChart.y);
      }
    }
  }

  // Helper to get chart type from name
  getChartType(chartName: string): string {
    if (chartName.includes('Bar')) return 'bar';
    if (chartName.includes('Line')) return 'line';
    if (chartName.includes('Pie')) return 'pie';
    if (chartName.includes('Area')) return 'area';
    if (chartName.includes('Scatter')) return 'scatter';
    if (chartName.includes('Heat')) return 'heatmap';
    return 'chart';
  }

  // Remove chart from canvas
  removeChart(chartId: number) {
    this.canvasCharts = this.canvasCharts.filter(chart => chart.id !== chartId);
  }

  // Handle chart drag end to update position
  onChartDragEnd(event: CdkDragEnd, chartId: number) {
    const chart = this.canvasCharts.find(c => c.id === chartId);
    if (chart) {
      // Get the drag distance from the event
      const distance = event.distance;
      
      // Update chart position based on drag distance
      chart.x += distance.x;
      chart.y += distance.y;
      
      // Ensure chart stays within canvas bounds
      const canvasElement = document.querySelector('.worksheet-canvas');
      if (canvasElement) {
        const canvasRect = canvasElement.getBoundingClientRect();
        const maxX = canvasRect.width - chart.width - 10;
        const maxY = canvasRect.height - chart.height - 10;
        
        chart.x = Math.max(10, Math.min(chart.x, maxX));
        chart.y = Math.max(10, Math.min(chart.y, maxY));
      }
    }
  }

  // Handle drag enter events
  onDragEnter(shelf: string) {
    this.dragOverShelf = shelf;
  }

  // Handle drag leave events
  onDragLeave(shelf: string) {
    if (this.dragOverShelf === shelf) {
      this.dragOverShelf = '';
    }
  }

  remove(list: string[], index: number) {
    list.splice(index, 1);
  }

  isFieldInColumns(field: string): boolean {
    return this.columns.includes(field);
  }
  
  isFieldInRows(field: string): boolean {
    return this.rows.includes(field);
  }
  
  isFieldInShelves(field: string): boolean {
    return this.isFieldInColumns(field) || this.isFieldInRows(field);
  }
  
  getFieldPlacement(field: string): string {
    const inColumns = this.isFieldInColumns(field);
    const inRows = this.isFieldInRows(field);
    
    if (inColumns && inRows) {
      return 'Both';
    } else if (inColumns) {
      return 'Columns';
    } else if (inRows) {
      return 'Rows';
    } else {
      return '';
    }
  }

  getColumnsText(): string {
    return this.columns.length > 0 ? this.columns.join(', ') : '';
  }

  getRowsText(): string {
    return this.rows.length > 0 ? this.rows.join(', ') : '';
  }

  // Check if canvas has charts
  hasChartsInCanvas(): boolean {
    return this.canvasCharts.length > 0;
  }
}