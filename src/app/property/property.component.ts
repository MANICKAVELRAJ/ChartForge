import { Component } from '@angular/core';

@Component({
  selector: 'app-property',
  templateUrl: './property.component.html',
  styleUrls: ['./property.component.css']
})
export class PropertyComponent {

  propertyPanelOpen = false;

  selectedItem: any = null;

  propertyForm = {
    position: {
      x: 120,
      y: 80
    }
  };

  openPropertyPanel() {
    // toggle behavior
    if (this.propertyPanelOpen) {
      this.closePropertyPanel();
      return;
    }

    this.selectedItem = {
      label: 'Bar Chart',
      type: 'chart',
      position: { ...this.propertyForm.position },
      properties: {
        width: 320,
        height: 220,
        title: 'Monthly Sales'
      }
    };

    this.propertyPanelOpen = true;
  }

  closePropertyPanel() {
    this.propertyPanelOpen = false;
  }

  getIconName(type: string): string {
    return type === 'chart' ? 'bar_chart' : 'settings';
  }

  saveProperties() {
    this.selectedItem.position.x = this.propertyForm.position.x;
    this.selectedItem.position.y = this.propertyForm.position.y;
    this.closePropertyPanel();
  }
}
